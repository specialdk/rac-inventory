// ============================================================
// Stocktake Save / Resume / Post API
// Backs the "Save Draft" and "Resume" workflow on the stocktake screen.
// Nothing here touches live stock — that still happens via
// /api/movements/adjustment when the operator clicks Apply (Post).
// ============================================================

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// ------------------------------------------------------------
// POST /api/stocktakes
// Save a draft. Creates a new one, or updates an existing one
// when stocktake_id is supplied (so re-saving doesn't duplicate).
// ------------------------------------------------------------
router.post("/", async (req, res) => {
  const {
    stocktake_id, // present when updating an existing draft
    reference,
    as_at_date,
    operator,
    general_notes,
    created_by,
    total_qty_adjustment,
    total_value_adjustment,
    lines = [],
  } = req.body;

  if (!reference || !as_at_date) {
    return res
      .status(400)
      .json({ error: "reference and as_at_date are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let id = stocktake_id;

    if (id) {
      // Update the existing draft header (only if still SAVED, never a posted one)
      await client.query(
        `UPDATE stocktakes
            SET reference = $1, as_at_date = $2, operator = $3, general_notes = $4,
                total_qty_adjustment = $5, total_value_adjustment = $6, updated_at = now()
          WHERE stocktake_id = $7 AND status = 'SAVED'`,
        [
          reference, as_at_date, operator, general_notes,
          total_qty_adjustment, total_value_adjustment, id,
        ]
      );
      // Replace its lines wholesale (simplest reliable approach)
      await client.query(`DELETE FROM stocktake_lines WHERE stocktake_id = $1`, [id]);
    } else {
      // Create a brand new draft header
      const headerResult = await client.query(
        `INSERT INTO stocktakes
           (reference, as_at_date, operator, general_notes, status,
            total_qty_adjustment, total_value_adjustment, created_by)
         VALUES ($1, $2, $3, $4, 'SAVED', $5, $6, $7)
         RETURNING stocktake_id`,
        [
          reference, as_at_date, operator, general_notes,
          total_qty_adjustment, total_value_adjustment, created_by,
        ]
      );
      id = headerResult.rows[0].stocktake_id;
    }

    // Insert the counted lines
    for (const line of lines) {
      await client.query(
        `INSERT INTO stocktake_lines
           (stocktake_id, product_id, location_id, soh_snapshot, counted_qty,
            unit_cost, notes, is_manual)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          line.product_id || null,
          line.location_id || null,
          line.soh_snapshot ?? null,
          line.counted_qty ?? null,
          line.unit_cost ?? null,
          line.notes || null,
          line.is_manual || false,
        ]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, stocktake_id: id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error saving stocktake draft:", error);
    res
      .status(500)
      .json({ error: "Failed to save stocktake draft", detail: error.message });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------
// GET /api/stocktakes/drafts
// List saved (not yet posted) drafts for the Resume picker.
// (Declared before /:id so "drafts" isn't treated as an id.)
// ------------------------------------------------------------
router.get("/drafts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.stocktake_id, s.reference, s.as_at_date, s.operator,
              s.general_notes, s.total_qty_adjustment, s.total_value_adjustment,
              s.updated_at,
              COUNT(l.line_id) AS line_count
         FROM stocktakes s
         LEFT JOIN stocktake_lines l ON l.stocktake_id = s.stocktake_id
        WHERE s.status = 'SAVED'
        GROUP BY s.stocktake_id
        ORDER BY s.updated_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error listing stocktake drafts:", error);
    res.status(500).json({ error: "Failed to list stocktake drafts" });
  }
});

// ------------------------------------------------------------
// GET /api/stocktakes/:id
// Load one stocktake with its lines (to re-populate the screen).
// ------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const headerResult = await pool.query(
      `SELECT * FROM stocktakes WHERE stocktake_id = $1`,
      [id]
    );
    if (headerResult.rows.length === 0) {
      return res.status(404).json({ error: "Stocktake not found" });
    }
    const linesResult = await pool.query(
      `SELECT * FROM stocktake_lines WHERE stocktake_id = $1 ORDER BY line_id`,
      [id]
    );
    res.json({ ...headerResult.rows[0], lines: linesResult.rows });
  } catch (error) {
    console.error("Error loading stocktake:", error);
    res.status(500).json({ error: "Failed to load stocktake" });
  }
});

// ------------------------------------------------------------
// POST /api/stocktakes/:id/posted
// Mark a draft as POSTED once its adjustments have been applied,
// so it drops off the Resume list.
// ------------------------------------------------------------
router.post("/:id/posted", async (req, res) => {
  try {
    const { id } = req.params;
    const { posted_by } = req.body;
    await pool.query(
      `UPDATE stocktakes
          SET status = 'POSTED', posted_by = $1, posted_at = now(), updated_at = now()
        WHERE stocktake_id = $2`,
      [posted_by || null, id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking stocktake posted:", error);
    res.status(500).json({ error: "Failed to mark stocktake posted" });
  }
});

// ------------------------------------------------------------
// DELETE /api/stocktakes/:id
// Discard a draft (its lines go too, via ON DELETE CASCADE).
// ------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM stocktakes WHERE stocktake_id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting stocktake:", error);
    res.status(500).json({ error: "Failed to delete stocktake" });
  }
});

module.exports = router;