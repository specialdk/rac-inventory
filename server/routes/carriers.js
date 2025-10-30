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
    const {
      carrier_code,
      carrier_name,
      contact_person,
      phone,
      email,
      address,
      abn,
    } = req.body;

    if (!carrier_code || !carrier_name) {
      return res.status(400).json({
        error: "Missing required fields: carrier_code, carrier_name",
      });
    }

    const result = await query(
      `INSERT INTO carriers 
       (carrier_code, carrier_name, contact_person, phone, email, address, abn)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [carrier_code, carrier_name, contact_person, phone, email, address, abn]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating carrier:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Carrier code already exists" });
    } else {
      res.status(500).json({ error: "Failed to create carrier" });
    }
  }
});

// PUT update carrier
router.put("/carriers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      carrier_code,
      carrier_name,
      contact_person,
      phone,
      email,
      address,
      abn,
      is_active,
    } = req.body;

    const result = await query(
      `UPDATE carriers 
       SET carrier_code = COALESCE($1, carrier_code),
           carrier_name = COALESCE($2, carrier_name),
           contact_person = $3,
           phone = $4,
           email = $5,
           address = $6,
           abn = $7,
           is_active = COALESCE($8, is_active)
       WHERE carrier_id = $9
       RETURNING *`,
      [
        carrier_code,
        carrier_name,
        contact_person,
        phone,
        email,
        address,
        abn,
        is_active,
        id,
      ]
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
