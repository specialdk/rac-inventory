const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET all drivers
router.get("/", async (req, res) => {
  try {
    const { is_active } = req.query;

    let sql = "SELECT * FROM drivers WHERE 1=1";
    const params = [];

    if (is_active !== undefined) {
      sql += " AND is_active = $1";
      params.push(is_active === "true");
    }

    sql += " ORDER BY driver_name";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});

// GET single driver
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM drivers WHERE driver_id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching driver:", error);
    res.status(500).json({ error: "Failed to fetch driver" });
  }
});

// POST create driver
router.post("/", async (req, res) => {
  try {
    const {
      driver_code,
      driver_name,
      license_number,
      license_class,
      license_expiry,
      certifications,
    } = req.body;

    if (!driver_code || !driver_name) {
      return res.status(400).json({
        error: "Missing required fields: driver_code, driver_name",
      });
    }

    const result = await query(
      `INSERT INTO drivers 
       (driver_code, driver_name, license_number, license_class, license_expiry, certifications)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        driver_code,
        driver_name,
        license_number,
        license_class,
        license_expiry,
        certifications,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating driver:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Driver code already exists" });
    } else {
      res.status(500).json({ error: "Failed to create driver" });
    }
  }
});

// PUT update driver
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      driver_code,
      driver_name,
      license_number,
      license_class,
      license_expiry,
      certifications,
      is_active,
    } = req.body;

    const result = await query(
      `UPDATE drivers 
       SET driver_code = COALESCE($1, driver_code),
           driver_name = COALESCE($2, driver_name),
           license_number = $3,
           license_class = $4,
           license_expiry = $5,
           certifications = $6,
           is_active = COALESCE($7, is_active)
       WHERE driver_id = $8
       RETURNING *`,
      [
        driver_code,
        driver_name,
        license_number,
        license_class,
        license_expiry,
        certifications,
        is_active,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating driver:", error);
    res.status(500).json({ error: "Failed to update driver" });
  }
});

// DELETE driver (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE drivers 
       SET is_active = false
       WHERE driver_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.json({
      message: "Driver deactivated successfully",
      driver: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting driver:", error);
    res.status(500).json({ error: "Failed to delete driver" });
  }
});

module.exports = router;
