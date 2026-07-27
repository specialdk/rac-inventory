const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

/*
 * Stock Reconciliation — current_stock (live SOH) vs the movement ledger.
 *
 * CANONICAL LEDGER = sum of movements EXCLUDING DEMAND / EDIT / CANCEL,
 * with is_cancelled = false.  This matches the /as-at endpoint in stock.js
 * and the book stock the dashboard/stocktake use.  EDIT/CANCEL are audit-only
 * (the original movement is edited in place), so including them double-counts.
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

// GET /api/reconciliation  — run the live reconciliation
// Optional ?tolerance=0.5 (tonnes) — a line counts as out-of-sync if |gap| > tolerance
router.get("/", async (req, res) => {
  try {
    const tolerance = Math.abs(parseFloat(req.query.tolerance)) || 0.5;

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
    // exceptions = any out-of-sync OR negative line (deduped)
    const exceptions = lines.filter(
      (r) => Math.abs(r.gap) > tolerance || r.negative
    );

    res.json({
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
      lines, // full detail — the page shows exceptions by default, all on demand
    });
  } catch (error) {
    console.error("Error running reconciliation:", error);
    res.status(500).json({ error: "Failed to run reconciliation" });
  }
});

module.exports = router;