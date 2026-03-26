// ============================================================
// RAC Inventory - Production Runs API
//
// Routes mounted at /api/production-runs
//
//   GET  /api/production-runs              - recent runs list
//   GET  /api/production-runs/:id          - single run with detail
//   POST /api/production-runs              - save a new production run
//   GET  /api/production-runs/wip-report?year=&month=  - monthly WIP summary
// ============================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');

// ----------------------------------------
// GET /api/production-runs
// Recent production runs, newest first
// ----------------------------------------
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await pool.query(`
      SELECT
        pr.run_id,
        pr.run_date,
        pr.operator,
        pr.reference_number,
        pr.entry_mode,
        pr.wip_tonnes_used,
        pr.labour_hours,
        pr.total_run_cost,
        pr.variance_zone,
        pr.override_required,
        pr.notes,
        pr.created_at,
        -- Aggregate products made
        STRING_AGG(DISTINCT p.product_name, ', ' ORDER BY p.product_name) AS products_made,
        SUM(prp.tonnes_produced) AS total_tonnes,
        -- Cost per tonne (same for all products in a run)
        CASE WHEN SUM(prp.tonnes_produced) > 0
          THEN ROUND(pr.total_run_cost / SUM(prp.tonnes_produced), 4)
          ELSE 0
        END AS cost_per_tonne
      FROM production_runs pr
      LEFT JOIN production_run_products prp ON prp.run_id = pr.run_id
      LEFT JOIN products p ON p.product_id = prp.product_id
      GROUP BY pr.run_id
      ORDER BY pr.run_date DESC, pr.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching production runs:', error);
    res.status(500).json({ error: 'Failed to fetch production runs' });
  }
});

// ----------------------------------------
// GET /api/production-runs/:id
// Full detail for a single run
// ----------------------------------------
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Header
    const runResult = await pool.query(
      'SELECT * FROM production_runs WHERE run_id = $1',
      [id]
    );
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: 'Production run not found' });
    }

    // Machines used
    const machinesResult = await pool.query(`
      SELECT prm.*, m.machine_name, m.machine_type
      FROM production_run_machines prm
      JOIN machines m ON m.machine_id = prm.machine_id
      WHERE prm.run_id = $1
      ORDER BY prm.run_machine_id
    `, [id]);

    // Products made
    const productsResult = await pool.query(`
      SELECT prp.*, p.product_name, p.product_code, p.family_group,
             l.location_name
      FROM production_run_products prp
      JOIN products p ON p.product_id = prp.product_id
      LEFT JOIN locations l ON l.location_id = prp.to_location_id
      WHERE prp.run_id = $1
      ORDER BY prp.run_product_id
    `, [id]);

    res.json({
      run:      runResult.rows[0],
      machines: machinesResult.rows,
      products: productsResult.rows
    });
  } catch (error) {
    console.error('Error fetching production run:', error);
    res.status(500).json({ error: 'Failed to fetch production run' });
  }
});

// ----------------------------------------
// POST /api/production-runs
// Save a complete production run
//
// Body: {
//   run_date, operator, reference_number, entry_mode, notes,
//   wip_tonnes_used, wip_rate_per_tonne,
//   labour_hours, labour_rate_per_hour,
//   variance_zone, amber_check_confirmed,
//   override_required, override_code, override_notes, override_by,
//   machines: [{ machine_id, hours_used, rate_per_hour,
//                maintenance_rate_per_hour, fuel_litres_per_hour,
//                fuel_rate_per_litre, bom_hours_expected, variance_pct, variance_zone }],
//   products: [{ product_id, to_location_id, tonnes_produced }]
// }
// ----------------------------------------
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      run_date, operator, reference_number, entry_mode, notes,
      wip_tonnes_used, wip_rate_per_tonne,
      labour_hours, labour_rate_per_hour,
      variance_zone, amber_check_confirmed,
      override_required, override_code, override_notes, override_by,
      machines = [], products = []
    } = req.body;

    // Validate
    if (!run_date)        throw new Error('run_date is required');
    if (!products.length) throw new Error('At least one product is required');
    if (!machines.length) throw new Error('At least one machine is required');

    const totalTonnes = products.reduce((s, p) => s + parseFloat(p.tonnes_produced || 0), 0);
    if (totalTonnes <= 0) throw new Error('Total tonnes produced must be greater than 0');

    // ── Calculate costs ──────────────────────────────────────
    const wipRate     = parseFloat(wip_rate_per_tonne)    || 0;
    const wipTonnes   = parseFloat(wip_tonnes_used)       || 0;
    const wipCost     = Math.round(wipTonnes * wipRate * 100) / 100;

    const labRate     = parseFloat(labour_rate_per_hour)  || 0;
    const labHours    = parseFloat(labour_hours)          || 0;
    const labCost     = Math.round(labHours * labRate * 100) / 100;

    // Calculate per-machine costs
    const machineRows = machines.map(m => {
      const hrs       = parseFloat(m.hours_used)               || 0;
      const rate      = parseFloat(m.rate_per_hour)            || 0;
      const maintRate = parseFloat(m.maintenance_rate_per_hour)|| 0;
      const fuelLph   = parseFloat(m.fuel_litres_per_hour)     || 0;
      const fuelRate  = parseFloat(m.fuel_rate_per_litre)      || 0;

      const machineCost  = Math.round(hrs * rate * 100) / 100;
      const maintCost    = Math.round(hrs * maintRate * 100) / 100;
      const fuelLitres   = Math.round(hrs * fuelLph * 100) / 100;
      const fuelCost     = Math.round(fuelLitres * fuelRate * 100) / 100;
      const totalMachine = Math.round((machineCost + maintCost + fuelCost) * 100) / 100;

      return {
        machine_id:                parseInt(m.machine_id),
        hours_used:                hrs,
        rate_per_hour:             rate,
        maintenance_rate_per_hour: maintRate,
        fuel_litres_per_hour:      fuelLph,
        fuel_rate_per_litre:       fuelRate,
        machine_cost:              machineCost,
        maintenance_cost:          maintCost,
        fuel_litres_total:         fuelLitres,
        fuel_cost:                 fuelCost,
        total_cost:                totalMachine,
        bom_hours_expected:        parseFloat(m.bom_hours_expected) || null,
        variance_pct:              parseFloat(m.variance_pct)       || null,
        variance_zone:             m.variance_zone                  || null
      };
    });

    const machinesTotalCost = machineRows.reduce((s, m) => s + m.total_cost, 0);
    const totalRunCost      = Math.round((wipCost + labCost + machinesTotalCost) * 100) / 100;
    const costPerTonne      = totalTonnes > 0
      ? Math.round((totalRunCost / totalTonnes) * 10000) / 10000
      : 0;

    // ── Insert production_runs header ─────────────────────────
    const runResult = await client.query(`
      INSERT INTO production_runs (
        run_date, operator, reference_number, entry_mode,
        wip_tonnes_used, wip_rate_per_tonne, wip_total_cost,
        labour_hours, labour_rate_per_hour, labour_total_cost,
        total_run_cost,
        variance_zone, amber_check_confirmed,
        override_required, override_code, override_notes, override_by,
        notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING run_id
    `, [
      run_date, operator || null, reference_number || null, entry_mode || 'MANUAL',
      wipTonnes, wipRate, wipCost,
      labHours, labRate, labCost,
      totalRunCost,
      variance_zone || null, amber_check_confirmed || false,
      override_required || false, override_code || null, override_notes || null, override_by || null,
      notes || null
    ]);
    const runId = runResult.rows[0].run_id;

    // ── Insert machine rows ───────────────────────────────────
    for (const m of machineRows) {
      await client.query(`
        INSERT INTO production_run_machines (
          run_id, machine_id, hours_used,
          rate_per_hour, maintenance_rate_per_hour,
          fuel_litres_per_hour, fuel_rate_per_litre,
          machine_cost, maintenance_cost,
          fuel_litres_total, fuel_cost, total_cost,
          bom_hours_expected, variance_pct, variance_zone
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [
        runId, m.machine_id, m.hours_used,
        m.rate_per_hour, m.maintenance_rate_per_hour,
        m.fuel_litres_per_hour, m.fuel_rate_per_litre,
        m.machine_cost, m.maintenance_cost,
        m.fuel_litres_total, m.fuel_cost, m.total_cost,
        m.bom_hours_expected, m.variance_pct, m.variance_zone
      ]);
    }

    // ── Insert product rows + stock movements ─────────────────
    for (const p of products) {
      const tonnes       = parseFloat(p.tonnes_produced) || 0;
      const sharePct     = totalTonnes > 0 ? Math.round((tonnes / totalTonnes) * 1000000) / 10000 : 0;
      const costAllocated= Math.round(totalRunCost * (sharePct / 100) * 100) / 100;
      const costPerT     = tonnes > 0 ? Math.round((costAllocated / tonnes) * 10000) / 10000 : 0;

      // Get current weighted average for audit trail
      const currentStock = await client.query(`
        SELECT quantity, average_cost
        FROM current_stock
        WHERE product_id = $1 AND location_id = $2
      `, [p.product_id, p.to_location_id]);

      const prevAvgCost = currentStock.rows.length > 0
        ? parseFloat(currentStock.rows[0].average_cost) || 0
        : 0;
      const prevQty = currentStock.rows.length > 0
        ? parseFloat(currentStock.rows[0].quantity) || 0
        : 0;

      // Weighted average cost calculation
      const newAvgCost = (prevQty + tonnes) > 0
        ? Math.round(((prevAvgCost * prevQty) + (costPerT * tonnes)) / (prevQty + tonnes) * 10000) / 10000
        : costPerT;

      // Create stock movement
      const movResult = await client.query(`
        INSERT INTO stock_movements (
          movement_date, movement_type, product_id,
          to_location_id, quantity, unit_cost, total_cost,
          reference_number, notes, created_by
        ) VALUES (NOW(), 'PRODUCTION', $1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING movement_id
      `, [
        p.product_id, p.to_location_id || null,
        tonnes, costPerT,
        Math.round(costAllocated * 100) / 100,
        reference_number || `RUN-${runId}`,
        `Production run ${runId} — ${sharePct.toFixed(2)}% cost share`,
        operator || 'system'
      ]);
      const movementId = movResult.rows[0].movement_id;

      // Update current_stock (upsert)
      await client.query(`
        INSERT INTO current_stock (product_id, location_id, quantity, average_cost, total_value, last_updated)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET
          quantity      = current_stock.quantity + $3,
          average_cost  = $4,
          total_value   = (current_stock.quantity + $3) * $4,
          last_updated  = NOW()
      `, [
        p.product_id, p.to_location_id || null,
        tonnes, newAvgCost,
        Math.round(tonnes * newAvgCost * 100) / 100
      ]);

      // Update products table average cost
      await client.query(`
        UPDATE products SET standard_cost = $1 WHERE product_id = $2
      `, [newAvgCost, p.product_id]);

      // Insert production_run_products record
      await client.query(`
        INSERT INTO production_run_products (
          run_id, product_id, to_location_id, tonnes_produced,
          cost_share_pct, cost_allocated, cost_per_tonne,
          movement_id, prev_avg_cost, new_avg_cost
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [
        runId, p.product_id, p.to_location_id || null, tonnes,
        sharePct, costAllocated, costPerT,
        movementId, prevAvgCost, newAvgCost
      ]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      run_id: runId,
      total_run_cost: totalRunCost,
      cost_per_tonne: costPerTonne,
      total_tonnes: totalTonnes
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving production run:', error);
    res.status(500).json({ error: error.message || 'Failed to save production run' });
  } finally {
    client.release();
  }
});

// ----------------------------------------
// GET /api/production-runs/wip-report?year=2026&month=3
// Monthly WIP tonnes for Xero journal
// ----------------------------------------
router.get('/wip-report', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'year and month required' });
  }
  try {
    const result = await pool.query(`
      SELECT
        pr.run_date, pr.reference_number,
        pr.wip_tonnes_used, pr.wip_rate_per_tonne, pr.wip_total_cost,
        pr.total_run_cost,
        STRING_AGG(p.product_name || ' (' || prp.tonnes_produced || 't)', ', ') AS products,
        pr.xero_journal_ref
      FROM production_runs pr
      JOIN production_run_products prp ON prp.run_id = pr.run_id
      JOIN products p ON p.product_id = prp.product_id
      WHERE EXTRACT(YEAR  FROM pr.run_date) = $1
        AND EXTRACT(MONTH FROM pr.run_date) = $2
      GROUP BY pr.run_id
      ORDER BY pr.run_date
    `, [parseInt(year), parseInt(month)]);

    const totalWip  = result.rows.reduce((s, r) => s + parseFloat(r.wip_tonnes_used || 0), 0);
    const totalCost = result.rows.reduce((s, r) => s + parseFloat(r.wip_total_cost  || 0), 0);

    res.json({
      year: parseInt(year), month: parseInt(month),
      runs: result.rows,
      totals: { wip_tonnes: totalWip, wip_cost: totalCost }
    });
  } catch (error) {
    console.error('Error generating WIP report:', error);
    res.status(500).json({ error: 'Failed to generate WIP report' });
  }
});

module.exports = router;
