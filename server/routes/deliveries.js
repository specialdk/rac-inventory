const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET all deliveries with optional is_active filter
router.get("/", async (req, res) => {
  try {
    const isActive = req.query.is_active === "true";
    const result = await pool.query(
      `
      SELECT * FROM deliveries 
      WHERE is_active = $1
      ORDER BY delivery_name ASC
    `,
      [isActive]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching deliveries:", error);
    res.status(500).json({ error: "Failed to fetch deliveries" });
  }
});

// GET active deliveries only
router.get("/active", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM deliveries 
      WHERE is_active = true
      ORDER BY delivery_name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching active deliveries:", error);
    res.status(500).json({ error: "Failed to fetch active deliveries" });
  }
});

// GET single delivery by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM deliveries WHERE delivery_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching delivery:", error);
    res.status(500).json({ error: "Failed to fetch delivery" });
  }
});

// POST create new delivery
router.post("/", async (req, res) => {
  try {
    const { delivery_name, description } = req.body;

    if (!delivery_name) {
      return res.status(400).json({ error: "Delivery name is required" });
    }

    const result = await pool.query(
      `INSERT INTO deliveries (delivery_name, description) 
       VALUES ($1, $2) 
       RETURNING *`,
      [delivery_name, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating delivery:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Delivery name already exists" });
    } else {
      res.status(500).json({ error: "Failed to create delivery" });
    }
  }
});

// PUT update delivery
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_name, description, is_active } = req.body;

    const result = await pool.query(
      `UPDATE deliveries 
       SET delivery_name = COALESCE($1, delivery_name),
           description = $2,
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE delivery_id = $4
       RETURNING *`,
      [delivery_name, description, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating delivery:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Delivery name already exists" });
    } else {
      res.status(500).json({ error: "Failed to update delivery" });
    }
  }
});

// DELETE delivery (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE deliveries 
       SET is_active = false, updated_at = NOW()
       WHERE delivery_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    res.json({
      message: "Delivery deactivated successfully",
      delivery: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting delivery:", error);
    res.status(500).json({ error: "Failed to delete delivery" });
  }
});

module.exports = router;
