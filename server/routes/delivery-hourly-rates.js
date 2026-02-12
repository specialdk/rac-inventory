const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET all delivery hourly rates
router.get("/", async (req, res) => {
  try {
    const isActive = req.query.is_active !== undefined 
      ? req.query.is_active === "true" 
      : true;
    const result = await pool.query(
      `SELECT * FROM delivery_hourly_rates 
       WHERE is_active = $1
       ORDER BY trailer_count ASC`,
      [isActive]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching delivery hourly rates:", error);
    res.status(500).json({ error: "Failed to fetch delivery hourly rates" });
  }
});

// GET single rate by ID
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM delivery_hourly_rates WHERE rate_id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Rate not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching rate:", error);
    res.status(500).json({ error: "Failed to fetch rate" });
  }
});

// POST create new rate
router.post("/", async (req, res) => {
  try {
    const { trailer_count, hourly_rate, description } = req.body;
    const result = await pool.query(
      `INSERT INTO delivery_hourly_rates (trailer_count, hourly_rate, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [trailer_count, hourly_rate, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating rate:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Trailer count already exists" });
    } else {
      res.status(500).json({ error: "Failed to create rate" });
    }
  }
});

// PUT update rate
router.put("/:id", async (req, res) => {
  try {
    const { trailer_count, hourly_rate, description, is_active } = req.body;
    const result = await pool.query(
      `UPDATE delivery_hourly_rates 
       SET trailer_count = COALESCE($1, trailer_count),
           hourly_rate = COALESCE($2, hourly_rate),
           description = $3,
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE rate_id = $5
       RETURNING *`,
      [trailer_count, hourly_rate, description, is_active, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Rate not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating rate:", error);
    res.status(500).json({ error: "Failed to update rate" });
  }
});

// DELETE (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE delivery_hourly_rates 
       SET is_active = false, updated_at = NOW()
       WHERE rate_id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Rate not found" });
    }
    res.json({ message: "Rate deactivated", rate: result.rows[0] });
  } catch (error) {
    console.error("Error deleting rate:", error);
    res.status(500).json({ error: "Failed to delete rate" });
  }
});

module.exports = router;