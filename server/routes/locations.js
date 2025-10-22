const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET all locations
router.get("/", async (req, res) => {
  try {
    const { location_type, is_active } = req.query;

    let sql = `
      SELECT 
        l.*,
        p.product_code,
        p.product_name
      FROM locations l
      LEFT JOIN products p ON l.assigned_product_id = p.product_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (location_type) {
      sql += ` AND l.location_type = $${paramCount}`;
      params.push(location_type);
      paramCount++;
    }

    if (is_active !== undefined) {
      sql += ` AND l.is_active = $${paramCount}`;
      params.push(is_active === "true");
      paramCount++;
    }

    sql += " ORDER BY l.location_code";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

// GET single location
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT 
         l.*,
         p.product_code,
         p.product_name
       FROM locations l
       LEFT JOIN products p ON l.assigned_product_id = p.product_id
       WHERE l.location_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching location:", error);
    res.status(500).json({ error: "Failed to fetch location" });
  }
});

// POST create location
router.post("/", async (req, res) => {
  try {
    const {
      location_code,
      location_name,
      location_type,
      assigned_product_id,
      capacity_tonnes,
      description,
    } = req.body;

    if (!location_code || !location_name || !location_type) {
      return res.status(400).json({
        error:
          "Missing required fields: location_code, location_name, location_type",
      });
    }

    const result = await query(
      `INSERT INTO locations 
       (location_code, location_name, location_type, assigned_product_id, capacity_tonnes, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        location_code,
        location_name,
        location_type,
        assigned_product_id,
        capacity_tonnes,
        description,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating location:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Location code already exists" });
    } else {
      res.status(500).json({ error: "Failed to create location" });
    }
  }
});

// PUT update location
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      location_code,
      location_name,
      location_type,
      assigned_product_id,
      capacity_tonnes,
      description,
      is_active,
    } = req.body;

    const result = await query(
      `UPDATE locations 
       SET location_code = COALESCE($1, location_code),
           location_name = COALESCE($2, location_name),
           location_type = COALESCE($3, location_type),
           assigned_product_id = $4,
           capacity_tonnes = COALESCE($5, capacity_tonnes),
           description = $6,
           is_active = COALESCE($7, is_active)
       WHERE location_id = $8
       RETURNING *`,
      [
        location_code,
        location_name,
        location_type,
        assigned_product_id,
        capacity_tonnes,
        description,
        is_active,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ error: "Failed to update location" });
  }
});

// DELETE location (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE locations 
       SET is_active = false
       WHERE location_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json({
      message: "Location deactivated successfully",
      location: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ error: "Failed to delete location" });
  }
});

// GET suggested location for a product (for auto-suggest in production entry)
router.get("/suggest/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    console.log(`🔍 Looking for location with product ${productId}`);

    // Find location where this product currently has stock
    const result = await query(
      `SELECT 
        l.location_id,
        l.location_code,
        l.location_name,
        l.location_type,
        cs.quantity
      FROM current_stock cs
      JOIN locations l ON l.location_id = cs.location_id
      WHERE cs.product_id = $1 
        AND l.is_active = true 
        AND cs.quantity > 0
      ORDER BY cs.quantity DESC
      LIMIT 1`,
      [productId]
    );

    console.log(`📦 Found ${result.rows.length} locations`);

    if (result.rows.length > 0) {
      console.log(`✅ Suggesting location_id: ${result.rows[0].location_id}`);

      res.json({
        suggested: true,
        location: result.rows[0],
        message: `Suggested: ${result.rows[0].location_name} (currently holds this product)`,
      });
    } else {
      console.log(`ℹ️ No stock found for product ${productId}`);

      res.json({
        suggested: false,
        location: null,
        message: "No stockpile assigned yet. Please select a location.",
      });
    }
  } catch (error) {
    console.error("Error getting suggested location:", error);
    res.status(500).json({ error: "Failed to get suggested location" });
  }
});

module.exports = router;
