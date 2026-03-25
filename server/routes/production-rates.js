// ============================================================
// RAC Inventory - Production Rates & BOM Templates API
//
// Routes mounted at /api/production-rates
//
//   GET  /api/production-rates            - all active rates
//   GET  /api/production-rates/current    - flat key/value for production form
//   PUT  /api/production-rates/:id        - update a rate value
//   GET  /api/production-rates/bom        - all BOM templates
//   GET  /api/production-rates/bom/product/:productId  - BOM for one product
//   POST /api/production-rates/bom        - create BOM template
//   PUT  /api/production-rates/bom/:id    - update BOM template
//   GET  /api/production-rates/monthly-wip-report?year=&month=  - WIP journal support
// ============================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// ----------------------------------------
// GET /api/production-rates
// All active rates in display order
// ----------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        rate_id, rate_type, rate_description,
        rate_per_unit, rate_unit,
        effective_from, is_active, notes, updated_at
      FROM production_rates
      WHERE is_active = TRUE
      ORDER BY
        CASE rate_type
          WHEN 'BLAST_WIP'   THEN 1
          WHEN 'LABOUR'      THEN 2
          WHEN 'MACHINE'     THEN 3
          WHEN 'MAINTENANCE' THEN 4
          WHEN 'FUEL'        THEN 5
          ELSE 6
        END
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching production rates:', error);
    res.status(500).json({ error: 'Failed to fetch production rates' });
  }
});

// ----------------------------------------
// GET /api/production-rates/current
// Flat object for production form pre-fill
// e.g. { BLAST_WIP: { rate: 12.50, unit: '$/tonne' }, LABOUR: { rate: 45.00, unit: '$/hr' } }
// ----------------------------------------
router.get('/current', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT rate_type, rate_per_unit, rate_unit FROM production_rates WHERE is_active = TRUE'
    );
    const rates = {};
    result.rows.forEach(row => {
      rates[row.rate_type] = {
        rate: parseFloat(row.rate_per_unit),
        unit: row.rate_unit
      };
    });
    res.json(rates);
  } catch (error) {
    console.error('Error fetching current rates:', error);
    res.status(500).json({ error: 'Failed to fetch current rates' });
  }
});

// ----------------------------------------
// GET /api/production-rates/monthly-wip-report?year=2026&month=3
// WIP tonnes consumed per run for a given month
// Used by accountant to prepare the monthly Xero corrective journal
// ----------------------------------------
router.get('/monthly-wip-report', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'year and month query params required' });
  }
  try {
    const result = await pool.query(`
      SELECT
        prc.production_date,
        p.product_name,
        p.product_code,
        prc.tonnes_produced,
        prc.wip_tonnes_used,
        prc.wip_rate_per_tonne,
        prc.wip_total_cost,
        prc.reference_number,
        prc.xero_journal_ref
      FROM production_run_costs prc
      JOIN products p ON p.product_id = prc.product_id
      WHERE
        EXTRACT(YEAR  FROM prc.production_date) = $1
        AND EXTRACT(MONTH FROM prc.production_date) = $2
        AND prc.wip_tonnes_used > 0
      ORDER BY prc.production_date, p.product_name
    `, [parseInt(year), parseInt(month)]);

    const totalWipTonnes = result.rows.reduce((s, r) => s + parseFloat(r.wip_tonnes_used || 0), 0);
    const totalWipCost   = result.rows.reduce((s, r) => s + parseFloat(r.wip_total_cost  || 0), 0);

    res.json({
      year: parseInt(year),
      month: parseInt(month),
      runs: result.rows,
      totals: { total_wip_tonnes: totalWipTonnes, total_wip_cost: totalWipCost }
    });
  } catch (error) {
    console.error('Error generating WIP report:', error);
    res.status(500).json({ error: 'Failed to generate WIP report' });
  }
});

// ----------------------------------------
// PUT /api/production-rates/:id
// Update a rate value (admin/manager only action)
// Body: { rate_per_unit, notes }
// ----------------------------------------
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

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rate not found' });
    }
    res.json({ success: true, rate: result.rows[0] });
  } catch (error) {
    console.error('Error updating production rate:', error);
    res.status(500).json({ error: 'Failed to update rate' });
  }
});

// ----------------------------------------
// GET /api/production-rates/bom
// All active BOM templates
// ----------------------------------------
router.get('/bom', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.bom_id, b.product_id, p.product_name, p.product_code, p.family_group,
        b.is_by_product,
        b.wip_tonnes_per_tonne, b.labour_hours_per_tonne,
        b.machine_hours_per_tonne, b.maintenance_hours_per_tonne,
        b.fuel_litres_per_tonne, b.fuel_flat_per_run,
        b.notes, b.is_active, b.updated_at
      FROM bom_templates b
      JOIN products p ON p.product_id = b.product_id
      WHERE b.is_active = TRUE
      ORDER BY p.family_group, p.product_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching BOM templates:', error);
    res.status(500).json({ error: 'Failed to fetch BOM templates' });
  }
});

// ----------------------------------------
// GET /api/production-rates/bom/product/:productId
// BOM template for a specific product (used to pre-fill production form)
// ----------------------------------------
router.get('/bom/product/:productId', async (req, res) => {
  const { productId } = req.params;
  try {
    const result = await pool.query(`
      SELECT b.*, p.product_name, p.product_code
      FROM bom_templates b
      JOIN products p ON p.product_id = b.product_id
      WHERE b.product_id = $1 AND b.is_active = TRUE
      LIMIT 1
    `, [productId]);

    if (result.rows.length === 0) {
      return res.json({ found: false });
    }
    res.json({ found: true, bom: result.rows[0] });
  } catch (error) {
    console.error('Error fetching BOM for product:', error);
    res.status(500).json({ error: 'Failed to fetch BOM template' });
  }
});

// ----------------------------------------
// POST /api/production-rates/bom
// Create a BOM template for a product
// (deactivates any existing BOM for that product first)
// ----------------------------------------
router.post('/bom', async (req, res) => {
  const {
    product_id, is_by_product,
    wip_tonnes_per_tonne, labour_hours_per_tonne,
    machine_hours_per_tonne, maintenance_hours_per_tonne,
    fuel_litres_per_tonne, fuel_flat_per_run, notes
  } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: 'product_id is required' });
  }

  try {
    // Retire existing active BOM for this product
    await pool.query(
      'UPDATE bom_templates SET is_active = FALSE, updated_at = NOW() WHERE product_id = $1',
      [product_id]
    );

    const result = await pool.query(`
      INSERT INTO bom_templates (
        product_id, is_by_product,
        wip_tonnes_per_tonne, labour_hours_per_tonne,
        machine_hours_per_tonne, maintenance_hours_per_tonne,
        fuel_litres_per_tonne, fuel_flat_per_run, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      product_id,
      is_by_product || false,
      wip_tonnes_per_tonne        != null ? wip_tonnes_per_tonne        : 1.0,
      labour_hours_per_tonne      != null ? labour_hours_per_tonne      : 1.0,
      machine_hours_per_tonne     != null ? machine_hours_per_tonne     : 1.0,
      maintenance_hours_per_tonne != null ? maintenance_hours_per_tonne : 1.0,
      fuel_litres_per_tonne       != null ? fuel_litres_per_tonne       : 0,
      fuel_flat_per_run           != null ? fuel_flat_per_run           : 0,
      notes || null
    ]);

    res.json({ success: true, bom: result.rows[0] });
  } catch (error) {
    console.error('Error creating BOM template:', error);
    res.status(500).json({ error: 'Failed to create BOM template' });
  }
});

// ----------------------------------------
// PUT /api/production-rates/bom/:id
// Update an existing BOM template
// ----------------------------------------
router.put('/bom/:id', async (req, res) => {
  const { id } = req.params;
  const {
    is_by_product,
    wip_tonnes_per_tonne, labour_hours_per_tonne,
    machine_hours_per_tonne, maintenance_hours_per_tonne,
    fuel_litres_per_tonne, fuel_flat_per_run, notes
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE bom_templates SET
        is_by_product               = $1,
        wip_tonnes_per_tonne        = $2,
        labour_hours_per_tonne      = $3,
        machine_hours_per_tonne     = $4,
        maintenance_hours_per_tonne = $5,
        fuel_litres_per_tonne       = $6,
        fuel_flat_per_run           = $7,
        notes                       = $8,
        updated_at                  = NOW()
      WHERE bom_id = $9 AND is_active = TRUE
      RETURNING *
    `, [
      is_by_product || false,
      wip_tonnes_per_tonne        != null ? wip_tonnes_per_tonne        : 1.0,
      labour_hours_per_tonne      != null ? labour_hours_per_tonne      : 1.0,
      machine_hours_per_tonne     != null ? machine_hours_per_tonne     : 1.0,
      maintenance_hours_per_tonne != null ? maintenance_hours_per_tonne : 1.0,
      fuel_litres_per_tonne       != null ? fuel_litres_per_tonne       : 0,
      fuel_flat_per_run           != null ? fuel_flat_per_run           : 0,
      notes || null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'BOM template not found' });
    }
    res.json({ success: true, bom: result.rows[0] });
  } catch (error) {
    console.error('Error updating BOM template:', error);
    res.status(500).json({ error: 'Failed to update BOM template' });
  }
});

module.exports = router;
