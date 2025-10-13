const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET all vehicles
router.get("/", async (req, res) => {
  try {
    const { is_active } = req.query;

    let sql = "SELECT * FROM vehicles WHERE 1=1";
    const params = [];

    if (is_active !== undefined) {
      sql += " AND is_active = $1";
      params.push(is_active === "true");
    }

    sql += " ORDER BY registration";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// GET single vehicle
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM vehicles WHERE vehicle_id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching vehicle:", error);
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
});

// POST create vehicle
router.post("/", async (req, res) => {
  try {
    const {
      registration,
      vehicle_type,
      capacity_tonnes,
      last_service_date,
      next_service_date,
      notes,
    } = req.body;

    if (!registration) {
      return res
        .status(400)
        .json({ error: "Missing required field: registration" });
    }

    const result = await query(
      `INSERT INTO vehicles 
       (registration, vehicle_type, capacity_tonnes, last_service_date, next_service_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        registration,
        vehicle_type,
        capacity_tonnes,
        last_service_date,
        next_service_date,
        notes,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating vehicle:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Vehicle registration already exists" });
    } else {
      res.status(500).json({ error: "Failed to create vehicle" });
    }
  }
});

// PUT update vehicle
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      registration,
      vehicle_type,
      capacity_tonnes,
      last_service_date,
      next_service_date,
      notes,
      is_active,
    } = req.body;

    const result = await query(
      `UPDATE vehicles 
       SET registration = COALESCE($1, registration),
           vehicle_type = $2,
           capacity_tonnes = $3,
           last_service_date = $4,
           next_service_date = $5,
           notes = $6,
           is_active = COALESCE($7, is_active)
       WHERE vehicle_id = $8
       RETURNING *`,
      [
        registration,
        vehicle_type,
        capacity_tonnes,
        last_service_date,
        next_service_date,
        notes,
        is_active,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating vehicle:", error);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

// DELETE vehicle (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE vehicles 
       SET is_active = false
       WHERE vehicle_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json({
      message: "Vehicle deactivated successfully",
      vehicle: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

module.exports = router;
