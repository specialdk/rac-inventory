// ============================================================
// RAC Inventory - Production Runs API
//
// Routes mounted at /api/production-runs
//
//   GET  /api/production-runs              - recent runs list
//   GET  /api/production-runs/:id          - single run with detail
//   POST /api/production-runs              - save a new production run
//   GET  /api/production-runs/wip-report?year=&month=  - monthly WIP summary
//
// Phase 1 (Sandpit unification):
//   * Costing maths come from the shared engine (production-costing-engine)
//     so what the Sandpit shows is exactly what posts.
//   * A run can now CONSUME real input products from a source pile
//     (two-directional posting): each input posts a negative CONSUMPTION
//     movement and reduces current_stock at its current average cost,
//     while outputs post PRODUCTION movements as before.
//   * Fully backward compatible: with no `inputs`, behaviour is unchanged
//     (Blast WIP stays a cost-only line).
// ============================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');
const RACCosting = require('../../public/js/production-costing-engine');
const { markCostingPosted } = require('./production-costings');

const DEFAULT_FUEL_RATE = 2.10;

// Generate the next RefNo for a given prefix, e.g. getNextRefNo(client, "PR")
async function getNextRefNo(client, prefix) {
  const result = await client.query(
    `SELECT COALESCE(MAX((SUBSTRING(docket_number FROM '[0-9]+$'))::int), 0) AS max_num
       FROM stock_movements
      WHERE docket_number LIKE $1`,
    [prefix + "%"]
  );
  const nextNumber = (result.rows[0].max_num || 0) + 1;
  return `${prefix}${String(nextNumber).padStart(5, "0")}`;
}

// ----------------------------------------
// GET /api/production-runs
// ----------------------------------------
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await pool.query(`
      SELECT
        pr.run_id, pr.run_date, pr.operator, pr.reference_number,
        pr.entry_mode, pr.wip_tonnes_used, pr.labour_hours,
        pr.total_run_cost, pr.by_product_credit_total, pr.net_cost_after_credits,
        pr.variance_zone, pr.override_required,
        pr.notes, pr.created_at,
        STRING_AGG(DISTINCT p.product_name, ', ' ORDER BY p.product_name) AS products_made,
        SUM(prp.tonnes_produced) AS total_tonnes,
        SUM(CASE WHEN prp.is_by_product THEN prp.tonnes_produced ELSE 0 END) AS by_product_tonnes,
        CASE WHEN SUM(CASE WHEN NOT prp.is_by_product THEN prp.tonnes_produced ELSE 0 END) > 0
          THEN ROUND(COALESCE(pr.net_cost_after_credits, pr.total_run_cost) /
               SUM(CASE WHEN NOT prp.is_by_product THEN prp.tonnes_produced ELSE 0 END), 4)
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
// ----------------------------------------
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) return next();  // let non-numeric paths (e.g. /wip-report) fall through
  try {
    const runResult = await pool.query('SELECT * FROM production_runs WHERE run_id = $1', [id]);
    if (runResult.rows.length === 0) return res.status(404).json({ error: 'Production run not found' });

    const machinesResult = await pool.query(`
      SELECT prm.*, m.machine_name, m.machine_type
      FROM production_run_machines prm
      JOIN machines m ON m.machine_id = prm.machine_id
      WHERE prm.run_id = $1 ORDER BY prm.run_machine_id
    `, [id]);

    const productsResult = await pool.query(`
      SELECT prp.*, p.product_name, p.product_code, p.family_group, l.location_name
      FROM production_run_products prp
      JOIN products p ON p.product_id = prp.product_id
      LEFT JOIN locations l ON l.location_id = prp.to_location_id
      WHERE prp.run_id = $1 ORDER BY prp.run_product_id
    `, [id]);

    // Inputs consumed (may be empty for legacy WIP-only runs)
    const inputsResult = await pool.query(`
      SELECT pri.*, p.product_name, p.product_code, l.location_name, l.location_code
      FROM production_run_inputs pri
      LEFT JOIN products p ON p.product_id = pri.product_id
      LEFT JOIN locations l ON l.location_id = pri.from_location_id
      WHERE pri.run_id = $1 ORDER BY pri.run_input_id
    `, [id]);

    res.json({
      run: runResult.rows[0],
      machines: machinesResult.rows,
      products: productsResult.rows,
      inputs: inputsResult.rows
    });
  } catch (error) {
    console.error('Error fetching production run:', error);
    res.status(500).json({ error: 'Failed to fetch production run' });
  }
});

// ----------------------------------------
// POST /api/production-runs
// Save a complete production run (with optional input consumption)
// ----------------------------------------
router.post('/', async (req, res) => {
  const {
    run_date, operator, reference_number, entry_mode, notes,
    wip_tonnes_used, wip_rate_per_tonne,
    labour_hours, labour_rate_per_hour,
    fuel_rate_per_litre,
    variance_zone, amber_check_confirmed,
    override_required, override_code, override_notes, override_by,
    machines = [], products = [], inputs = [],
    costing_id, allow_negative
  } = req.body || {};

  if (!run_date)        return res.status(400).json({ error: 'run_date is required' });
  if (!products.length) return res.status(400).json({ error: 'At least one product is required' });
  if (!machines.length) return res.status(400).json({ error: 'At least one machine is required' });

  const totalTonnes = products.reduce((s, p) => s + parseFloat(p.tonnes_produced || 0), 0);
  if (totalTonnes <= 0) return res.status(400).json({ error: 'Total tonnes produced must be greater than 0' });

  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const round2 = n => Math.round(num(n) * 100) / 100;

  const wipRate  = num(wip_rate_per_tonne);
  const labRate  = num(labour_rate_per_hour);
  const labHrs   = num(labour_hours);
  const fuelRate = num(fuel_rate_per_litre) || DEFAULT_FUEL_RATE;

  // Split inputs into real (stocked) vs Blast WIP (cost-only)
  const realInputs = inputs.filter(i => !i.is_wip && i.product_id);
  const wipInputs  = inputs.filter(i =>  i.is_wip);
  // Legacy header WIP still supported when no explicit WIP input line is given
  const legacyWipTonnes = wipInputs.length ? 0 : num(wip_tonnes_used);
  const wipTonnesTotal  = wipInputs.reduce((s, i) => s + num(i.tonnes), 0) + legacyWipTonnes;

  try {
    // ── Resolve each real input's source stock (avg cost + availability) ──
    for (const inp of realInputs) {
      const q = await pool.query(
        'SELECT quantity, average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2',
        [inp.product_id, inp.from_location_id]
      );
      inp._avail = q.rows.length ? num(q.rows[0].quantity) : 0;
      inp._avgCost = q.rows.length ? num(q.rows[0].average_cost)
                                   : num(inp.cost_per_tonne); // fallback if no stock row
      inp._tonnes = num(inp.tonnes);
      inp._exists = q.rows.length > 0;
    }

    // ── Soft-warning guard: block on shortfall unless allow_negative ──
    const shortfalls = realInputs
      .filter(i => i._tonnes > i._avail + 1e-9)
      .map(i => ({ product_id: i.product_id, from_location_id: i.from_location_id,
                   requested: i._tonnes, available: i._avail }));
    if (shortfalls.length && !allow_negative) {
      return res.status(409).json({
        error: 'INSUFFICIENT_INPUT_STOCK',
        message: 'One or more inputs would go negative. Re-submit with allow_negative:true to proceed.',
        shortfalls
      });
    }

    // ── Cost the run via the shared engine (single source of truth) ──
    const engineMaterials = [
      ...realInputs.map(i => ({ name: 'input', tonnes: i._tonnes, costPerT: i._avgCost })),
      ...(wipTonnesTotal > 0 ? [{ name: 'Blast WIP', isWip: true, tonnes: wipTonnesTotal, costPerT: wipRate }] : [])
    ];
    const engineMachines = machines.map(m => ({
      name: m.machine_id, hours: num(m.hours_used), rate: num(m.rate_per_hour),
      maint: num(m.maintenance_rate_per_hour), fuelLhr: num(m.fuel_litres_per_hour)
    }));
    const engineProducts = products.map(p => ({
      tonnes: num(p.tonnes_produced),
      isByProduct: !!p.is_by_product,
      creditRate: num(p.credit_rate_per_tonne)
    }));
    const R = RACCosting.compute({
      rates: { wip: wipRate, labour: labRate, fuel: fuelRate },
      manHours: labHrs, materials: engineMaterials,
      machines: engineMachines, products: engineProducts
    });

    const totalRunCost         = R.totalCost;
    const byProductCreditTotal = R.byProductCreditTotal;
    const netCostAfterCredits  = R.netCostAfterCredits;
    const wipCost              = round2(wipTonnesTotal * wipRate);

    // ── Everything below is one transaction ──
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const runResult = await client.query(`
        INSERT INTO production_runs (
          run_date, operator, reference_number, entry_mode,
          wip_tonnes_used, wip_rate_per_tonne, wip_total_cost,
          labour_hours, labour_rate_per_hour, labour_total_cost,
          total_run_cost, by_product_credit_total, net_cost_after_credits,
          variance_zone, amber_check_confirmed,
          override_required, override_code, override_notes, override_by,
          notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING run_id
      `, [
        run_date, operator || null, reference_number || null,
        (entry_mode === 'BOM' ? 'BOM' : 'MANUAL'),
        wipTonnesTotal, wipRate, wipCost,
        labHrs, labRate, R.labCost,
        totalRunCost, byProductCreditTotal, netCostAfterCredits,
        variance_zone || null, amber_check_confirmed || false,
        override_required || false, override_code || null, override_notes || null, override_by || null,
        notes || null
      ]);
      const runId = runResult.rows[0].run_id;

      // One RefNo for the whole run, shared across its movement lines
      const runRefNo = await getNextRefNo(client, "PR");

      // ── Machines ──
      for (let i = 0; i < machines.length; i++) {
        const m = machines[i], md = R.machDetail[i];
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
          runId, parseInt(m.machine_id), num(m.hours_used),
          num(m.rate_per_hour), num(m.maintenance_rate_per_hour),
          num(m.fuel_litres_per_hour), fuelRate,
          md.machineCost, md.maintCost,
          md.litres, md.fuelCost, md.total,
          m.bom_hours_expected != null ? num(m.bom_hours_expected) : null,
          m.variance_pct != null ? num(m.variance_pct) : null,
          m.variance_zone || null
        ]);
      }

      // ── Inputs consumed (two-directional: reduce input stock) ──
      for (const inp of realInputs) {
        const tonnes = inp._tonnes;
        const avg    = inp._avgCost;
        const lineCost = round2(tonnes * avg);

        const mov = await client.query(`
          INSERT INTO stock_movements (
            movement_date, movement_type, product_id,
            from_location_id, quantity, unit_cost, total_cost,
            reference_number, notes, created_by, docket_number
          ) VALUES (NOW(), 'CONSUMPTION', $1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING movement_id
        `, [
          inp.product_id, inp.from_location_id, tonnes, avg, lineCost,
          reference_number || `RUN-${runId}`,
          `Production run ${runId} — consumed into production`,
          operator || 'system', runRefNo
        ]);

        if (inp._exists) {
          await client.query(`
            UPDATE current_stock
               SET quantity = quantity - $3,
                   total_value = ROUND((quantity - $3) * average_cost, 2),
                   last_movement_date = NOW(), updated_at = NOW()
             WHERE product_id = $1 AND location_id = $2
          `, [inp.product_id, inp.from_location_id, tonnes]);
        } else {
          // No prior stock row (only reachable with allow_negative) — create a negative row
          await client.query(`
            INSERT INTO current_stock (product_id, location_id, quantity, average_cost, total_value, last_movement_date)
            VALUES ($1, $2, $3, $4, $5, NOW())
          `, [inp.product_id, inp.from_location_id, -tonnes, avg, round2(-tonnes * avg)]);
        }

        await client.query(`
          INSERT INTO production_run_inputs (
            run_id, product_id, is_wip, from_location_id,
            tonnes, cost_per_tonne, line_cost, movement_id, prev_avg_cost
          ) VALUES ($1,$2,false,$3,$4,$5,$6,$7,$8)
        `, [runId, inp.product_id, inp.from_location_id, tonnes, avg, lineCost, mov.rows[0].movement_id, avg]);
      }

      // WIP inputs (cost-only lines, no stock)
      for (const w of wipInputs) {
        const tonnes = num(w.tonnes);
        await client.query(`
          INSERT INTO production_run_inputs (run_id, product_id, is_wip, from_location_id, tonnes, cost_per_tonne, line_cost)
          VALUES ($1, NULL, true, NULL, $2, $3, $4)
        `, [runId, tonnes, wipRate, round2(tonnes * wipRate)]);
      }
      if (legacyWipTonnes > 0) {
        await client.query(`
          INSERT INTO production_run_inputs (run_id, product_id, is_wip, from_location_id, tonnes, cost_per_tonne, line_cost)
          VALUES ($1, NULL, true, NULL, $2, $3, $4)
        `, [runId, legacyWipTonnes, wipRate, round2(legacyWipTonnes * wipRate)]);
      }

      // ── Output products (produce stock, update weighted-avg + standard cost) ──
      for (let i = 0; i < products.length; i++) {
        const p = products[i], sp = R.split[i];
        const tonnes      = num(p.tonnes_produced);
        const isByProduct = !!p.is_by_product;
        const creditRate  = isByProduct ? num(p.credit_rate_per_tonne) : 0;
        const creditTotal = isByProduct ? round2(tonnes * creditRate) : 0;
        const costPerT      = sp.costPerTonne;
        const costAllocated = sp.productCost;
        const sharePct      = Math.round((sp.share || 0) * 100 * 10000) / 10000;

        const existingStock = await client.query(
          'SELECT quantity, average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2',
          [p.product_id, p.to_location_id]
        );
        const prevAvgCost = existingStock.rows.length ? num(existingStock.rows[0].average_cost) : 0;
        const prevQty     = existingStock.rows.length ? num(existingStock.rows[0].quantity)     : 0;
        const newAvgCost  = (prevQty + tonnes) > 0
          ? Math.round(((prevAvgCost * prevQty) + (costPerT * tonnes)) / (prevQty + tonnes) * 10000) / 10000
          : costPerT;

        const movResult = await client.query(`
          INSERT INTO stock_movements (
            movement_date, movement_type, product_id,
            to_location_id, quantity, unit_cost, total_cost,
            reference_number, notes, created_by, docket_number
          ) VALUES (NOW(), 'PRODUCTION', $1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING movement_id
        `, [
          p.product_id, p.to_location_id || null, tonnes, costPerT, round2(costAllocated),
          reference_number || `RUN-${runId}`,
          isByProduct
            ? `Production run ${runId} — by-product @ $${creditRate.toFixed(2)}/t standard cost`
            : `Production run ${runId} — ${sharePct.toFixed(2)}% of net cost after by-product credits`,
          operator || 'system', runRefNo
        ]);
        const movementId = movResult.rows[0].movement_id;

        const newQty   = prevQty + tonnes;
        const newValue = round2(newQty * newAvgCost);
        if (existingStock.rows.length === 0) {
          await client.query(`
            INSERT INTO current_stock (product_id, location_id, quantity, average_cost, total_value, last_movement_date)
            VALUES ($1, $2, $3, $4, $5, NOW())
          `, [p.product_id, p.to_location_id, newQty, newAvgCost, newValue]);
        } else {
          await client.query(`
            UPDATE current_stock
            SET quantity = $1, average_cost = $2, total_value = $3,
                last_movement_date = NOW(), updated_at = NOW()
            WHERE product_id = $4 AND location_id = $5
          `, [newQty, newAvgCost, newValue, p.product_id, p.to_location_id]);
        }

        await client.query('UPDATE products SET standard_cost = $1 WHERE product_id = $2', [newAvgCost, p.product_id]);

        await client.query(`
          INSERT INTO production_run_products (
            run_id, product_id, to_location_id, tonnes_produced,
            cost_share_pct, cost_allocated, cost_per_tonne,
            movement_id, prev_avg_cost, new_avg_cost,
            is_by_product, credit_rate_per_tonne, credit_total
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [
          runId, p.product_id, p.to_location_id || null, tonnes,
          sharePct, round2(costAllocated), costPerT,
          movementId, prevAvgCost, newAvgCost,
          isByProduct, creditRate, creditTotal
        ]);
      }

      // Link an imported costing to this run (Draft -> Posted)
      if (costing_id) await markCostingPosted(client, costing_id, runId);

      await client.query('COMMIT');

      res.json({
        success: true,
        run_id: runId,
        total_run_cost: totalRunCost,
        by_product_credit_total: byProductCreditTotal,
        net_cost_after_credits: netCostAfterCredits,
        cost_per_tonne: R.costPerTonne,
        total_tonnes: totalTonnes,
        inputs_consumed: realInputs.length,
        posted_with_negative: shortfalls.length > 0
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving production run:', error);
    res.status(500).json({ error: error.message || 'Failed to save production run' });
  }
});

// ----------------------------------------
// GET /api/production-runs/wip-report?year=2026&month=3
// ----------------------------------------
router.get('/wip-report', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  try {
    const result = await pool.query(`
      SELECT
        pr.run_date, pr.reference_number,
        pr.wip_tonnes_used, pr.wip_rate_per_tonne, pr.wip_total_cost,
        pr.total_run_cost, pr.by_product_credit_total, pr.net_cost_after_credits,
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
