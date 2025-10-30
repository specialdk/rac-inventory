const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET all carriers
router.get("/carriers", async (req, res) => {
  try {
    const { is_active } = req.query;

    let sql = "SELECT * FROM carriers WHERE 1=1";
    const params = [];

    if (is_active !== undefined) {
      sql += " AND is_active = $1";
      params.push(is_active === "true");
    }

    sql += " ORDER BY carrier_name";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching carriers:", error);
    res.status(500).json({ error: "Failed to fetch carriers" });
  }
});

// GET single carrier
router.get("/carriers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM carriers WHERE carrier_id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Carrier not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching carrier:", error);
    res.status(500).json({ error: "Failed to fetch carrier" });
  }
});

// POST create carrier
router.post("/carriers", async (req, res) => {
  try {
    const { carrier_name } = req.body;

    if (!carrier_name) {
      return res.status(400).json({
        error: "Missing required field: carrier_name",
      });
    }

    const result = await query(
      `INSERT INTO carriers (carrier_name)
       VALUES ($1)
       RETURNING *`,
      [carrier_name]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating carrier:", error);
    res.status(500).json({ error: "Failed to create carrier" });
  }
});

// PUT update carrier
router.put("/carriers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { carrier_name, is_active } = req.body;

    const result = await query(
      `UPDATE carriers 
       SET carrier_name = COALESCE($1, carrier_name),
           is_active = COALESCE($2, is_active)
       WHERE carrier_id = $3
       RETURNING *`,
      [carrier_name, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Carrier not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating carrier:", error);
    res.status(500).json({ error: "Failed to update carrier" });
  }
});

// DELETE carrier (soft delete)
router.delete("/carriers/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE carriers 
       SET is_active = false
       WHERE carrier_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Carrier not found" });
    }

    res.json({
      message: "Carrier deactivated successfully",
      carrier: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting carrier:", error);
    res.status(500).json({ error: "Failed to delete carrier" });
  }
});

module.exports = router;
