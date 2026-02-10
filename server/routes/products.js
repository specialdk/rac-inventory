const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET all products
router.get("/", async (req, res) => {
  try {
    const { is_active } = req.query;

    let sql = `SELECT 
      p.*,
      l.location_name as preferred_location_name
    FROM products p
    LEFT JOIN locations l ON p.preferred_location_id = l.location_id`;
    const params = [];

    if (is_active !== undefined) {
      sql += " WHERE p.is_active = $1";
      params.push(is_active === "true");
    }

    sql += " ORDER BY p.family_group, p.product_name";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// GET single product by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM products WHERE product_id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// POST create new product
router.post("/", async (req, res) => {
  try {
    const {
      product_code,
      product_name,
      family_group,
      unit = "tonnes",
      standard_cost,
      current_price,
      min_stock_level,
      max_stock_level,
      preferred_location_id,
    } = req.body;

    // Validation
    if (!product_code || !product_name || !family_group) {
      return res.status(400).json({
        error:
          "Missing required fields: product_code, product_name, family_group",
      });
    }

    const result = await query(
      `INSERT INTO products 
       (product_code, product_name, family_group, unit, standard_cost, 
        current_price, standard_sales_price, min_stock_level, max_stock_level, preferred_location_id)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)
       RETURNING *`,
      [
        product_code,
        product_name,
        family_group,
        unit,
        standard_cost,
        current_price,
        min_stock_level,
        max_stock_level,
        preferred_location_id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating product:", error);
    if (error.code === "23505") {
      // Unique violation
      res.status(409).json({ error: "Product code already exists" });
    } else {
      res.status(500).json({ error: "Failed to create product" });
    }
  }
});

// PUT update product
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      product_code,
      product_name,
      family_group,
      unit,
      standard_cost,
      current_price,
      min_stock_level,
      max_stock_level,
      preferred_location_id,
      is_active,
    } = req.body;

    const result = await query(
      `UPDATE products 
       SET product_code = COALESCE($1, product_code),
           product_name = COALESCE($2, product_name),
           family_group = COALESCE($3, family_group),
           unit = COALESCE($4, unit),
           standard_cost = COALESCE($5, standard_cost),
           current_price = COALESCE($6, current_price),
           standard_sales_price = COALESCE($6, current_price),
           min_stock_level = COALESCE($7, min_stock_level),
           max_stock_level = COALESCE($8, max_stock_level),
           preferred_location_id = COALESCE($9, preferred_location_id),
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
       WHERE product_id = $11
       RETURNING *`,
      [
        product_code,
        product_name,
        family_group,
        unit,
        standard_cost,
        current_price,
        min_stock_level,
        max_stock_level,
        preferred_location_id,
        is_active,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE product (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE products 
       SET is_active = false, updated_at = NOW()
       WHERE product_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      message: "Product deactivated successfully",
      product: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// GET products by family group
router.get("/family/:family", async (req, res) => {
  try {
    const { family } = req.params;

    const result = await query(
      `SELECT * FROM products 
       WHERE family_group = $1 AND is_active = true
       ORDER BY product_name`,
      [family]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching products by family:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

module.exports = router;
