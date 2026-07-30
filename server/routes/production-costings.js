// ============================================================
// RAC Inventory System — server/routes/production-costings.js
// Phase 1: saved Sandpit costings (shared + searchable)
//
// A "costing" is a SAVED CALCULATION only. It never moves stock and
// never posts a production run — it's the shared, searchable replacement
// for the old per-browser localStorage costings.
//
// Backs the three endpoints the smoke test checks:
//   POST /api/production-costings        -> save a costing (returns id + ref)
//   GET  /api/production-costings?q=...   -> search / list (returns an ARRAY)
//   GET  /api/production-costings/:id     -> fetch one back (for import)
//
// Requires migration 006 (production_costings table) to be applied.
// ============================================================

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// The SAME engine the Sandpit and the test use, so the server's numbers
// always match the browser's. Path is relative to THIS file:
//   server/routes/  ->  ../../  (repo root)  ->  public/js/
const engine = require('../../public/js/production-costing-engine');

// Little helper: safely add up the "tonnes" column from a list of rows.
const sumTonnes = (rows) =>
  (Array.isArray(rows) ? rows : []).reduce((t, r) => t + Number(r.tonnes || 0), 0);


// ------------------------------------------------------------
// POST /api/production-costings   — save a costing
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const {
      operator    = null,
      entry_mode  = null,
      notes       = null,
      run_date    = null,
      costing_ref = null,          // optional user reference; auto-made if blank
      rates       = {},
      manHours    = 0,
      materials   = [],
      products    = [],
      machines    = []
    } = req.body || {};

    // 1) Do the maths with the shared engine (single source of truth).
    const result       = engine.compute({ rates, manHours, materials, products, machines });
    const totalRunCost = Number(result.totalCost);
    const costPerTonne = Number(result.costPerTonne);

    // 2) Headline tonnes, pulled out for fast searching/listing later.
    const inputTonnes  = sumTonnes(materials);
    const outputTonnes = sumTonnes(products);

    // 3) Keep the FULL costing exactly as sent, so it round-trips on import.
    const payload = { rates, manHours, materials, products, machines, result };

    // 4) Save the row. Status starts as DRAFT; costing_ref set in step 5.
    const insert = await query(
      `INSERT INTO production_costings
         (costing_ref, run_date, operator, entry_mode, notes,
          input_tonnes, output_tonnes, total_run_cost, cost_per_tonne,
          payload, status, created_by)
       VALUES
         ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5,
          $6, $7, $8, $9,
          $10::jsonb, 'DRAFT', $11)
       RETURNING costing_id, created_at`,
      [
        costing_ref, run_date, operator, entry_mode, notes,
        inputTonnes, outputTonnes, totalRunCost, costPerTonne,
        JSON.stringify(payload), operator
      ]
    );

    const costingId = insert.rows[0].costing_id;

    // 5) If no reference was supplied, make a tidy one like C0001.
    let ref = costing_ref;
    if (!ref) {
      ref = 'C' + String(costingId).padStart(4, '0');
      await query(
        `UPDATE production_costings
            SET costing_ref = $1, updated_at = NOW()
          WHERE costing_id = $2`,
        [ref, costingId]
      );
    }

    // 6) Reply in the exact shape the test expects.
    return res.json({
      success:        true,
      costing_id:     costingId,
      costing_ref:    ref,
      cost_per_tonne: costPerTonne,
      total_run_cost: totalRunCost,
      input_tonnes:   inputTonnes,
      output_tonnes:  outputTonnes
    });

  } catch (err) {
    console.error('POST /api/production-costings failed:', err);
    return res.status(500).json({
      success: false,
      error:   err.message,
      hint:    'If this mentions a missing relation/table, migration 006 may not be applied yet.'
    });
  }
});


// ------------------------------------------------------------
// GET /api/production-costings?q=...&status=...   — search / list
// Returns a PLAIN ARRAY of headline rows (leaves the heavy payload out).
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { q = '', status } = req.query;

    const where  = [];
    const params = [];

    if (q) {
      params.push('%' + q + '%');
      const p = '$' + params.length;
      // Match the search text against notes, reference or operator.
      where.push(`(notes ILIKE ${p} OR costing_ref ILIKE ${p} OR operator ILIKE ${p})`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const sql = `
      SELECT costing_id, costing_ref, run_date, operator, entry_mode, notes,
             input_tonnes, output_tonnes, total_run_cost, cost_per_tonne,
             status, posted_run_id, created_at
        FROM production_costings
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC
       LIMIT 200`;

    const result = await query(sql, params);
    return res.json(result.rows);          // <-- a plain array, as the test wants

  } catch (err) {
    console.error('GET /api/production-costings failed:', err);
    return res.status(500).json({ error: err.message });
  }
});


// ------------------------------------------------------------
// GET /api/production-costings/:id   — fetch one (for import)
// Returns the full row INCLUDING payload, so materials round-trip out.
// ------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM production_costings WHERE costing_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Costing not found' });
    }
    return res.json(result.rows[0]);       // payload comes back as a JSON object

  } catch (err) {
    console.error('GET /api/production-costings/:id failed:', err);
    return res.status(500).json({ error: err.message });
  }
});


// ------------------------------------------------------------
// markCostingPosted(client, costingId, runId)
//
// Called by the production-runs POST route (inside its transaction) when a
// saved costing is imported and posted to a real run. Stamps the costing
// POSTED and links it to the run, so the same costing can't be posted twice
// and every real run traces back to the costing it came from.
//
// Takes the transaction's `client` so it commits/rolls back WITH the run.
// ------------------------------------------------------------
async function markCostingPosted(client, costingId, runId) {
  if (!costingId) return;
  await client.query(
    `UPDATE production_costings
        SET status        = 'POSTED',
            posted_run_id = $2,
            posted_at     = NOW(),
            updated_at    = NOW()
      WHERE costing_id = $1`,
    [costingId, runId]
  );
}

// Export the router (for app.use) AND markCostingPosted (for production-runs.js).
// An Express router is a function, so attaching a property is safe:
//   require('./production-costings')                 -> the router (mountable)
//   require('./production-costings').markCostingPosted -> the helper
module.exports = router;
module.exports.markCostingPosted = markCostingPosted;