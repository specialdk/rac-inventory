// ============================================================
// RAC Inventory - Production Rates, BOM Templates & Machines API
//
// Routes mounted at /api/production-rates
//
// RATES
//   GET  /api/production-rates                          - all active rates
//   GET  /api/production-rates/current                  - flat key/value for production form
//   PUT  /api/production-rates/:id                      - update a rate value
//
// MACHINES
//   GET  /api/production-rates/machines                 - all active machines
//   GET  /api/production-rates/machines/:id             - single machine
//   POST /api/production-rates/machines                 - create machine
//   PUT  /api/production-rates/machines/:id             - update machine rates
//   DELETE /api/production-rates/machines/:id           - deactivate machine
//
// BOM TEMPLATES
//   GET  /api/production-rates/bom                      - all BOM templates
//   GET  /api/production-rates/bom/product/:productId   - BOM for one product
//   POST /api/production-rates/bom                      - create BOM template
//   PUT  /api/production-rates/bom/:id                  - update BOM template
//
// REPORTING
//   GET  /api/production-rates/monthly-wip-report?year=&month=
// ============================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');

// ============================================================
// PRODUCTION RATES
// ============================================================

// GET /api/production-rates
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT rate_id, rate_type, rate_description,
             rate_per_unit, rate_unit,
             effective_from, is_active, notes, updated_at
      FROM production_rates
      WHERE is_active = TRUE
      ORDER BY CASE rate_type
        WHEN 'BLAST_WIP'   THEN 1
        WHEN 'LABOUR'      THEN 2
        WHEN 'MAINTENANCE' THEN 3
        WHEN 'FUEL'        THEN 4
        ELSE 5
      END
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching production rates:', error);
    res.status(500).json({ error: 'Failed to fetch production rates' });
  }
});

// GET /api/production-rates/current  (flat key/value for production form)
router.get('/current', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT rate_type, rate_per_unit, rate_unit FROM production_rates WHERE is_active = TRUE'
    );
    const rates = {};
    result.rows.forEach(row => {
      rates[row.rate_type] = { rate: parseFloat(row.rate_per_unit), unit: row.rate_unit };
    });
    res.json(rates);
  } catch (error) {
    console.error('Error fetching current rates:', error);
    res.status(500).json({ error: 'Failed to fetch current rates' });
  }
});

// GET /api/production-rates/monthly-wip-report?year=2026&month=3
router.get('/monthly-wip-report', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'year and month query params required' });
  }
  try {
    const result = await pool.query(`
      SELECT prc.production_date, p.product_name, p.product_code,
             prc.tonnes_produced, prc.wip_tonnes_used,
             prc.wip_rate_per_tonne, prc.wip_total_cost,
             prc.reference_number, prc.xero_journal_ref
      FROM production_run_costs prc
      JOIN products p ON p.product_id = prc.product_id
      WHERE EXTRACT(YEAR  FROM prc.production_date) = $1
        AND EXTRACT(MONTH FROM prc.production_date) = $2
        AND prc.wip_tonnes_used > 0
      ORDER BY prc.production_date, p.product_name
    `, [parseInt(year), parseInt(month)]);

    const totalWipTonnes = result.rows.reduce((s, r) => s + parseFloat(r.wip_tonnes_used || 0), 0);
    const totalWipCost   = result.rows.reduce((s, r) => s + parseFloat(r.wip_total_cost  || 0), 0);

    res.json({
      year: parseInt(year), month: parseInt(month),
      runs: result.rows,
      totals: { total_wip_tonnes: totalWipTonnes, total_wip_cost: totalWipCost }
    });
  } catch (error) {
    console.error('Error generating WIP report:', error);
    res.status(500).json({ error: 'Failed to generate WIP report' });
  }
});

// PUT /api/production-rates/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { rate_per_unit, notes } = req.body;

  if (rate_per_unit === undefined || rate_per_unit === null) {
    return res.status(400).json({ error: 'rate_per_unit is required' });
  }
  if (parseFloat(rate_per_unit) < 0) {
    return res.status(400).json({ error: 'Rate cannot be negative' });
  }

  try {
    const result = await pool.query(`
      UPDATE production_rates
      SET rate_per_unit = $1, notes = $2, updated_at = NOW()
      WHERE rate_id = $3 AND is_active = TRUE
      RETURNING *
    `, [parseFloat(rate_per_unit), notes || null, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Rate not found' });
    res.json({ success: true, rate: result.rows[0] });
  } catch (error) {
    console.error('Error updating production rate:', error);
    res.status(500).json({ error: 'Failed to update rate' });
  }
});

// ============================================================
// MACHINES
// ============================================================

// GET /api/production-rates/machines  - all active machines
router.get('/machines', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT machine_id, machine_name, machine_type,
             rate_per_hour, maintenance_rate_per_hour, fuel_litres_per_hour,
             notes, is_active, updated_at
      FROM machines
      WHERE is_active = TRUE
      ORDER BY CASE machine_type
        WHEN 'CRUSHER'   THEN 1
        WHEN 'SCREEN'    THEN 2
        WHEN 'EXCAVATOR' THEN 3
        WHEN 'DOZER'     THEN 4
        WHEN 'LOADER'    THEN 5
        WHEN 'GRADER'    THEN 6
        WHEN 'TRUCK'     THEN 7
        ELSE 8
      END, machine_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ error: 'Failed to fetch machines' });
  }
});

// GET /api/production-rates/machines/:id  - single machine (for production form)
router.get('/machines/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM machines WHERE machine_id = $1 AND is_active = TRUE',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching machine:', error);
    res.status(500).json({ error: 'Failed to fetch machine' });
  }
});

// POST /api/production-rates/machines  - add a new machine
router.post('/machines', async (req, res) => {
  const {
    machine_name, machine_type,
    rate_per_hour, maintenance_rate_per_hour, fuel_litres_per_hour, notes
  } = req.body;

  if (!machine_name || !machine_type) {
    return res.status(400).json({ error: 'machine_name and machine_type are required' });
  }

  const validTypes = ['CRUSHER','SCREEN','DOZER','LOADER','EXCAVATOR','GRADER','TRUCK','OTHER'];
  if (!validTypes.includes(machine_type)) {
    return res.status(400).json({ error: `machine_type must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const result = await pool.query(`
      INSERT INTO machines (machine_name, machine_type, rate_per_hour, maintenance_rate_per_hour, fuel_litres_per_hour, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      machine_name, machine_type,
      parseFloat(rate_per_hour)              || 0,
      parseFloat(maintenance_rate_per_hour)  || 0,
      parseFloat(fuel_litres_per_hour)       || 0,
      notes || null
    ]);
    res.json({ success: true, machine: result.rows[0] });
  } catch (error) {
    console.error('Error creating machine:', error);
    res.status(500).json({ error: 'Failed to create machine' });
  }
});

// PUT /api/production-rates/machines/:id  - update machine rates
router.put('/machines/:id', async (req, res) => {
  const { id } = req.params;
  const {
    machine_name, machine_type,
    rate_per_hour, maintenance_rate_per_hour, fuel_litres_per_hour, notes
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE machines SET
        machine_name              = $1,
        machine_type              = $2,
        rate_per_hour             = $3,
        maintenance_rate_per_hour = $4,
        fuel_litres_per_hour      = $5,
        notes                     = $6,
        updated_at                = NOW()
      WHERE machine_id = $7 AND is_active = TRUE
      RETURNING *
    `, [
      machine_name, machine_type,
      parseFloat(rate_per_hour)              || 0,
      parseFloat(maintenance_rate_per_hour)  || 0,
      parseFloat(fuel_litres_per_hour)       || 0,
      notes || null,
      id
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json({ success: true, machine: result.rows[0] });
  } catch (error) {
    console.error('Error updating machine:', error);
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

// DELETE /api/production-rates/machines/:id  - soft delete (deactivate)
router.delete('/machines/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE machines SET is_active = FALSE, updated_at = NOW() WHERE machine_id = $1 RETURNING machine_name',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Machine not found' });
    res.json({ success: true, message: `${result.rows[0].machine_name} deactivated` });
  } catch (error) {
    console.error('Error deactivating machine:', error);
    res.status(500).json({ error: 'Failed to deactivate machine' });
  }
});

// ============================================================
// BOM TEMPLATES
// ============================================================

// GET /api/production-rates/bom  - all active BOMs with machine name
router.get('/bom', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.bom_id, b.product_id, p.product_name, p.product_code, p.family_group,
        b.is_by_product,
        b.wip_tonnes_per_tonne, b.labour_hours_per_tonne,
        b.machine_hours_per_tonne,
        b.fuel_litres_per_machine_hour, b.fuel_flat_per_run,
        b.machine_id, m.machine_name, m.machine_type,
        m.rate_per_hour, m.maintenance_rate_per_hour, m.fuel_litres_per_hour,
        b.notes, b.is_active, b.updated_at
      FROM bom_templates b
      JOIN products p  ON p.product_id  = b.product_id
      LEFT JOIN machines m ON m.machine_id = b.machine_id
      WHERE b.is_active = TRUE
      ORDER BY p.family_group, p.product_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching BOM templates:', error);
    res.status(500).json({ error: 'Failed to fetch BOM templates' });
  }
});

// GET /api/production-rates/bom/product/:productId
// Returns BOM + machine rates in one call — used by production form to pre-fill
router.get('/bom/product/:productId', async (req, res) => {
  const { productId } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        b.*,
        p.product_name, p.product_code,
        m.machine_name, m.machine_type,
        m.rate_per_hour, m.maintenance_rate_per_hour, m.fuel_litres_per_hour
      FROM bom_templates b
      JOIN products p  ON p.product_id  = b.product_id
      LEFT JOIN machines m ON m.machine_id = b.machine_id
      WHERE b.product_id = $1 AND b.is_active = TRUE
      LIMIT 1
    `, [productId]);

    if (result.rows.length === 0) return res.json({ found: false });
    res.json({ found: true, bom: result.rows[0] });
  } catch (error) {
    console.error('Error fetching BOM for product:', error);
    res.status(500).json({ error: 'Failed to fetch BOM template' });
  }
});

// POST /api/production-rates/bom  - create BOM template
router.post('/bom', async (req, res) => {
  const {
    product_id, is_by_product, machine_id,
    wip_tonnes_per_tonne, labour_hours_per_tonne,
    machine_hours_per_tonne,
    fuel_litres_per_machine_hour, fuel_flat_per_run, notes
  } = req.body;

  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  try {
    await pool.query(
      'UPDATE bom_templates SET is_active = FALSE, updated_at = NOW() WHERE product_id = $1',
      [product_id]
    );

    const result = await pool.query(`
      INSERT INTO bom_templates (
        product_id, is_by_product, machine_id,
        wip_tonnes_per_tonne, labour_hours_per_tonne,
        machine_hours_per_tonne,
        fuel_litres_per_machine_hour, fuel_flat_per_run, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      product_id,
      is_by_product || false,
      machine_id    || null,
      wip_tonnes_per_tonne          != null ? wip_tonnes_per_tonne          : 1.0,
      labour_hours_per_tonne        != null ? labour_hours_per_tonne        : 1.0,
      machine_hours_per_tonne       != null ? machine_hours_per_tonne       : 1.0,
      fuel_litres_per_machine_hour  != null ? fuel_litres_per_machine_hour  : 0,
      fuel_flat_per_run             != null ? fuel_flat_per_run             : 0,
      notes || null
    ]);

    res.json({ success: true, bom: result.rows[0] });
  } catch (error) {
    console.error('Error creating BOM template:', error);
    res.status(500).json({ error: 'Failed to create BOM template' });
  }
});

// PUT /api/production-rates/bom/:id  - update BOM template
router.put('/bom/:id', async (req, res) => {
  const { id } = req.params;
  const {
    is_by_product, machine_id,
    wip_tonnes_per_tonne, labour_hours_per_tonne,
    machine_hours_per_tonne,
    fuel_litres_per_machine_hour, fuel_flat_per_run, notes
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE bom_templates SET
        is_by_product                = $1,
        machine_id                   = $2,
        wip_tonnes_per_tonne         = $3,
        labour_hours_per_tonne       = $4,
        machine_hours_per_tonne      = $5,
        fuel_litres_per_machine_hour = $6,
        fuel_flat_per_run            = $7,
        notes                        = $8,
        updated_at                   = NOW()
      WHERE bom_id = $9 AND is_active = TRUE
      RETURNING *
    `, [
      is_by_product || false,
      machine_id    || null,
      wip_tonnes_per_tonne          != null ? wip_tonnes_per_tonne          : 1.0,
      labour_hours_per_tonne        != null ? labour_hours_per_tonne        : 1.0,
      machine_hours_per_tonne       != null ? machine_hours_per_tonne       : 1.0,
      fuel_litres_per_machine_hour  != null ? fuel_litres_per_machine_hour  : 0,
      fuel_flat_per_run             != null ? fuel_flat_per_run             : 0,
      notes || null,
      id
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'BOM template not found' });
    res.json({ success: true, bom: result.rows[0] });
  } catch (error) {
    console.error('Error updating BOM template:', error);
    res.status(500).json({ error: 'Failed to update BOM template' });
  }
});

module.exports = router;
