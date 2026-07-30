// ============================================================
// RAC Inventory — Production Costings API
//
// Saved Sandpit costings, shared + searchable (replaces the
// Sandpit's per-browser localStorage). The Production screen
// searches these and imports one to post.
//
// Routes mounted at /api/production-costings
//   GET    /api/production-costings          - search / list
//   GET    /api/production-costings/:id       - one costing (full payload, for import)
//   POST   /api/production-costings           - save a costing (from the Sandpit)
//   PATCH  /api/production-costings/:id/status - archive / restore
//
// Also exports markCostingPosted(client, costingId, runId) so the
// production-runs POST can stamp a costing POSTED inside its own
// transaction when it is imported and posted.
// ============================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('../config/database');
const RACCosting = require('../../public/js/production-costing-engine');

// Next costing reference, e.g. C0001
async function getNextCostingRef(client) {
  const r = await client.query(
    `SELECT COALESCE(MAX((SUBSTRING(costing_ref FROM '[0-9]+$'))::int), 0) AS max_num
       FROM production_costings
      WHERE costing_ref LIKE 'C%'`
  );
  return 'C' + String((r.rows[0].max_num || 0) + 1).padStart(4, '0');
}

// Recompute headline totals from the input, server-side, so what's
// stored/searched is trustworthy regardless of what the client sent.
function totalsFrom(input) {
  const r = RACCosting.compute(input || {});
  return {
    input_tonnes:   r.inputTonnes,
    output_tonnes:  r.outputTonnes,
    total_run_cost: r.totalCost,
    cost_per_tonne: r.costPerTonne,
    computed: r
  };
}

// Shared helper — used by the production-runs POST to link a costing to its run.
async function markCostingPosted(client, costingId, runId) {
  if (!costingId) return;
  await client.query(
    `UPDATE production_costings
        SET status = 'POSTED', posted_run_id = $2, posted_at = NOW(), updated_at = NOW()
      WHERE costing_id = $1`,
    [costingId, runId]
  );
}

// ----------------------------------------
// GET /api/production-costings   (search / list)
//   ?status=DRAFT|POSTED|ARCHIVED  ?q=text  ?from=YYYY-MM-DD  ?to=YYYY-MM-DD  ?limit=50
// ----------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, q, from, to } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const where = [];
    const vals = [];
    if (status) { vals.push(status); where.push(`status = $${vals.length}`); }
    if (from)   { vals.push(from);   where.push(`run_date >= $${vals.length}`); }
    if (to)     { vals.push(to);     where.push(`run_date <= $${vals.length}`); }
    if (q) {
      vals.push('%' + q + '%');
      const p = `$${vals.length}`;
      where.push(`(costing_ref ILIKE ${p} OR notes ILIKE ${p} OR operator ILIKE ${p} OR payload::text ILIKE ${p})`);
    }
    vals.push(limit);
    const sql = `
      SELECT costing_id, costing_ref, run_date, operator, entry_mode, notes,
             input_tonnes, output_tonnes, total_run_cost, cost_per_tonne,
             status, posted_run_id, created_by, created_at, updated_at
        FROM production_costings
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC
       LIMIT $${vals.length}`;
    const result = await pool.query(sql, vals);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing costings:', error);
    res.status(500).json({ error: 'Failed to list costings' });
  }
});

// ----------------------------------------
// GET /api/production-costings/:id   (full payload, for import)
// ----------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM production_costings WHERE costing_id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Costing not found' });
    res.json(r.rows[0]);
  } catch (error) {
    console.error('Error fetching costing:', error);
    res.status(500).json({ error: 'Failed to fetch costing' });
  }
});

// ----------------------------------------
// POST /api/production-costings   (save a costing)
// Body: { costing_ref?, run_date, operator, entry_mode, notes, created_by,
//         rates:{wip,labour,fuel}, manHours, materials:[], products:[], machines:[] }
// The input object is stored verbatim in payload; totals are recomputed here.
// ----------------------------------------
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const input = {
      rates:    b.rates || { wip: b.wipRate, labour: b.labRate, fuel: b.fuelRate },
      manHours: b.manHours,
      materials: b.materials || [],
      products:  b.products  || [],
      machines:  b.machines  || []
    };
    if (!(input.products || []).some(p => parseFloat(p.tonnes) > 0)) {
      return res.status(400).json({ error: 'A costing needs at least one output product with tonnes.' });
    }

    const t = totalsFrom(input);
    // Store the input plus the computed split so a reader has both.
    const payload = { ...input,
      meta: { run_date: b.run_date || null, reference: b.costing_ref || null,
              operator: b.operator || null, entry_mode: b.entry_mode || null, notes: b.notes || null },
      computed: t.computed };

    await client.query('BEGIN');
    const ref = b.costing_ref && String(b.costing_ref).trim()
      ? String(b.costing_ref).trim()
      : await getNextCostingRef(client);

    const ins = await client.query(`
      INSERT INTO production_costings (
        costing_ref, run_date, operator, entry_mode, notes,
        input_tonnes, output_tonnes, total_run_cost, cost_per_tonne,
        payload, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',$11)
      RETURNING costing_id, costing_ref
    `, [
      ref, b.run_date || null, b.operator || null, b.entry_mode || null, b.notes || null,
      t.input_tonnes, t.output_tonnes, t.total_run_cost, t.cost_per_tonne,
      JSON.stringify(payload), b.created_by || null
    ]);
    await client.query('COMMIT');

    res.json({ success: true,
      costing_id: ins.rows[0].costing_id,
      costing_ref: ins.rows[0].costing_ref,
      total_run_cost: t.total_run_cost,
      cost_per_tonne: t.cost_per_tonne });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving costing:', error);
    res.status(500).json({ error: error.message || 'Failed to save costing' });
  } finally {
    client.release();
  }
});

// ----------------------------------------
// PATCH /api/production-costings/:id/status   (archive / restore)
// Body: { status: 'DRAFT' | 'ARCHIVED' }   (POSTED is set only by posting a run)
// ----------------------------------------
router.patch('/:id/status', async (req, res) => {
  try {
    const status = (req.body && req.body.status || '').toUpperCase();
    if (!['DRAFT', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: "status must be 'DRAFT' or 'ARCHIVED'" });
    }
    const r = await pool.query(
      `UPDATE production_costings SET status = $2, updated_at = NOW()
         WHERE costing_id = $1 AND status <> 'POSTED'
       RETURNING costing_id, status`,
      [req.params.id, status]
    );
    if (!r.rows.length) return res.status(409).json({ error: 'Not found, or already POSTED (cannot change).' });
    res.json({ success: true, ...r.rows[0] });
  } catch (error) {
    console.error('Error updating costing status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
module.exports.markCostingPosted = markCostingPosted;
