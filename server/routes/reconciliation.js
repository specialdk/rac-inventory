const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

/*
 * Stock Reconciliation — current_stock (live SOH) vs the movement ledger.
 *
 * CANONICAL LEDGER = sum of movements EXCLUDING DEMAND / EDIT / CANCEL,
 * with is_cancelled = false.  Matches the /as-at endpoint in stock.js and the
 * book stock the dashboard/stocktake use.  EDIT/CANCEL are audit-only (the
 * original movement is edited in place), so including them double-counts.
 *
 * Endpoints:
 *   GET  /api/reconciliation           live check (no write)
 *   POST /api/reconciliation/snapshot  live check + record today's row (7-day rolling)
 *   GET  /api/reconciliation/history   last 7 daily rows
 */
const LEDGER_CTE = `
  WITH app_ledger AS (
    SELECT product_id, location_id, SUM(qty_change) AS ledger_qty
    FROM (
      SELECT product_id, to_location_id   AS location_id,  quantity AS qty_change
        FROM stock_movements
       WHERE is_cancelled = false AND to_location_id IS NOT NULL
         AND movement_type NOT IN ('DEMAND','EDIT','CANCEL')
      UNION ALL
      SELECT product_id, from_location_id AS location_id, -quantity AS qty_change
        FROM stock_movements
       WHERE is_cancelled = false AND from_location_id IS NOT NULL
         AND movement_type NOT IN ('DEMAND','EDIT','CANCEL')
    ) m
    GROUP BY product_id, location_id
  )
`;

// Run the reconciliation and return the structured result (no DB writes).
async function runReconciliation(tolerance = 0.5) {
  tolerance = Math.abs(tolerance) || 0.5;

  const result = await query(`
    ${LEDGER_CTE}
    SELECT
      COALESCE(p.product_code, '?')            AS product_code,
      COALESCE(p.product_name, '(no product)') AS product_name,
      COALESCE(p.family_group, '')             AS family_group,
      COALESCE(l.location_code, '-')           AS stockpile,
      ROUND(COALESCE(cs.quantity, 0), 2)       AS soh,
      ROUND(COALESCE(a.ledger_qty, 0), 2)      AS ledger,
      ROUND(COALESCE(cs.quantity, 0) - COALESCE(a.ledger_qty, 0), 2) AS gap,
      (COALESCE(cs.quantity, 0) < 0)           AS negative
    FROM current_stock cs
    FULL OUTER JOIN app_ledger a
      ON cs.product_id = a.product_id AND cs.location_id = a.location_id
    LEFT JOIN products  p ON p.product_id  = COALESCE(cs.product_id, a.product_id)
    LEFT JOIN locations l ON l.location_id = COALESCE(cs.location_id, a.location_id)
    ORDER BY ABS(COALESCE(cs.quantity, 0) - COALESCE(a.ledger_qty, 0)) DESC,
             p.family_group, p.product_name
  `);

  const lines = result.rows.map((r) => ({
    product_code: r.product_code,
    product_name: r.product_name,
    family_group: r.family_group,
    stockpile: r.stockpile,
    soh: parseFloat(r.soh),
    ledger: parseFloat(r.ledger),
    gap: parseFloat(r.gap),
    negative: r.negative === true || r.negative === "t",
  }));

  const outOfSync = lines.filter((r) => Math.abs(r.gap) > tolerance);
  const negatives = lines.filter((r) => r.negative);
  const exceptions = lines.filter(
    (r) => Math.abs(r.gap) > tolerance || r.negative
  );

  return {
    as_at: new Date().toISOString(),
    tolerance,
    balanced: exceptions.length === 0,
    summary: {
      lines_checked: lines.length,
      out_of_sync: outOfSync.length,
      negatives: negatives.length,
      net_gap: Math.round(lines.reduce((s, r) => s + r.gap, 0) * 100) / 100,
    },
    exceptions,
    lines,
  };
}

// Run + record today's row (upsert one-per-day) + prune to a rolling 7 days.
// Reused by POST /snapshot and by the daily scheduler (step 3).
async function recordSnapshot(tolerance = 0.5) {
  const data = await runReconciliation(tolerance);

  await query(
    `INSERT INTO reconciliation_log
       (run_date, checked_at, balanced, lines_checked, out_of_sync, negatives, net_gap, exceptions)
     VALUES (CURRENT_DATE, NOW(), $1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (run_date) DO UPDATE SET
       checked_at    = EXCLUDED.checked_at,
       balanced      = EXCLUDED.balanced,
       lines_checked = EXCLUDED.lines_checked,
       out_of_sync   = EXCLUDED.out_of_sync,
       negatives     = EXCLUDED.negatives,
       net_gap       = EXCLUDED.net_gap,
       exceptions    = EXCLUDED.exceptions`,
    [
      data.balanced,
      data.summary.lines_checked,
      data.summary.out_of_sync,
      data.summary.negatives,
      data.summary.net_gap,
      JSON.stringify(data.exceptions),
    ]
  );

  // keep today + prior 6 = rolling 7 days
  await query(
    `DELETE FROM reconciliation_log WHERE run_date < CURRENT_DATE - INTERVAL '6 days'`
  );

  return data;
}

// GET /api/reconciliation  — live check, no write
router.get("/", async (req, res) => {
  try {
    const tolerance = Math.abs(parseFloat(req.query.tolerance)) || 0.5;
    res.json(await runReconciliation(tolerance));
  } catch (error) {
    console.error("Error running reconciliation:", error);
    res.status(500).json({ error: "Failed to run reconciliation" });
  }
});

// POST /api/reconciliation/snapshot  — live check + record today's row
router.post("/snapshot", async (req, res) => {
  try {
    const data = await recordSnapshot(0.5);
    res.json({ recorded: true, ...data });
  } catch (error) {
    console.error("Error recording reconciliation snapshot:", error);
    res.status(500).json({ error: "Failed to record reconciliation snapshot" });
  }
});

// GET /api/reconciliation/history  — last 7 daily rows (newest first)
router.get("/history", async (req, res) => {
  try {
    const r = await query(
      `SELECT run_date, checked_at, balanced, lines_checked,
              out_of_sync, negatives, net_gap, exceptions
       FROM reconciliation_log
       ORDER BY run_date DESC
       LIMIT 7`
    );
    res.json(r.rows);
  } catch (error) {
    console.error("Error fetching reconciliation history:", error);
    res.status(500).json({ error: "Failed to fetch reconciliation history" });
  }
});

module.exports = router;
// expose the helpers for the daily scheduler + email (step 3)
module.exports.runReconciliation = runReconciliation;
module.exports.recordSnapshot = recordSnapshot;