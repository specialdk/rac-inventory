const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// ============================================
// PRICE LISTS
// ============================================

// GET all price lists
router.get("/", async (req, res) => {
  try {
    const { is_active } = req.query;
    let sql = "SELECT * FROM price_lists";
    const params = [];

    if (is_active !== undefined) {
      sql += " WHERE is_active = $1";
      params.push(is_active === "true");
    }

    sql += " ORDER BY sort_order, price_list_name";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching price lists:", error);
    res.status(500).json({ error: "Failed to fetch price lists" });
  }
});

// GET active price lists (shortcut)
router.get("/active", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM price_lists WHERE is_active = true ORDER BY sort_order, price_list_name"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching active price lists:", error);
    res.status(500).json({ error: "Failed to fetch active price lists" });
  }
});

// GET full pricing matrix (all products × all active price lists)
router.get("/matrix/all", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.product_id, p.product_name, p.product_code, p.family_group,
              pl.price_list_id, pl.price_list_name,
              pp.price_per_tonne
       FROM products p
       CROSS JOIN price_lists pl
       LEFT JOIN product_prices pp ON p.product_id = pp.product_id AND pl.price_list_id = pp.price_list_id
       WHERE p.is_active = true AND pl.is_active = true
       ORDER BY p.family_group, p.product_name, pl.sort_order`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching pricing matrix:", error);
    res.status(500).json({ error: "Failed to fetch pricing matrix" });
  }
});

// GET single price list by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "SELECT * FROM price_lists WHERE price_list_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Price list not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching price list:", error);
    res.status(500).json({ error: "Failed to fetch price list" });
  }
});

// POST create new price list
router.post("/", async (req, res) => {
  try {
    const { price_list_name, description, is_default, sort_order } = req.body;

    if (!price_list_name) {
      return res.status(400).json({ error: "Price list name is required" });
    }

    // If setting as default, unset any existing default
    if (is_default) {
      await query("UPDATE price_lists SET is_default = false WHERE is_default = true");
    }

    const result = await query(
      `INSERT INTO price_lists (price_list_name, description, is_default, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [price_list_name, description || null, is_default || false, sort_order || 10]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating price list:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Price list name already exists" });
    } else {
      res.status(500).json({ error: "Failed to create price list" });
    }
  }
});

// PUT update price list
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { price_list_name, description, is_default, is_active, sort_order } = req.body;

    // If setting as default, unset any existing default
    if (is_default) {
      await query("UPDATE price_lists SET is_default = false WHERE is_default = true AND price_list_id != $1", [id]);
    }

    const result = await query(
      `UPDATE price_lists 
       SET price_list_name = COALESCE($1, price_list_name),
           description = COALESCE($2, description),
           is_default = COALESCE($3, is_default),
           is_active = COALESCE($4, is_active),
           sort_order = COALESCE($5, sort_order),
           updated_at = NOW()
       WHERE price_list_id = $6
       RETURNING *`,
      [price_list_name, description, is_default, is_active, sort_order, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Price list not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating price list:", error);
    res.status(500).json({ error: "Failed to update price list" });
  }
});

// DELETE price list (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE price_lists SET is_active = false, updated_at = NOW()
       WHERE price_list_id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Price list not found" });
    }

    res.json({ message: "Price list deactivated", price_list: result.rows[0] });
  } catch (error) {
    console.error("Error deleting price list:", error);
    res.status(500).json({ error: "Failed to delete price list" });
  }
});

// ============================================
// PRODUCT PRICES (per price list)
// ============================================

// GET all prices for a specific price list
router.get("/:id/prices", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT pp.*, p.product_name, p.product_code, p.family_group
       FROM product_prices pp
       JOIN products p ON pp.product_id = p.product_id
       WHERE pp.price_list_id = $1
       ORDER BY p.family_group, p.product_name`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching product prices:", error);
    res.status(500).json({ error: "Failed to fetch product prices" });
  }
});

// GET price for a specific product + price list combo
router.get("/:id/prices/:productId", async (req, res) => {
  try {
    const { id, productId } = req.params;
    const result = await query(
      `SELECT pp.*, p.product_name, pl.price_list_name
       FROM product_prices pp
       JOIN products p ON pp.product_id = p.product_id
       JOIN price_lists pl ON pp.price_list_id = pl.price_list_id
       WHERE pp.price_list_id = $1 AND pp.product_id = $2`,
      [id, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Price not found for this product/price list" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching product price:", error);
    res.status(500).json({ error: "Failed to fetch product price" });
  }
});

// GET full pricing matrix (all products × all active price lists)
router.get("-matrix/all", async (req, res) => {
  try {
    const result = await query(
      `SELECT p.product_id, p.product_name, p.product_code, p.family_group,
              pl.price_list_id, pl.price_list_name,
              pp.price_per_tonne
       FROM products p
       CROSS JOIN price_lists pl
       LEFT JOIN product_prices pp ON p.product_id = pp.product_id AND pl.price_list_id = pp.price_list_id
       WHERE p.is_active = true AND pl.is_active = true
       ORDER BY p.family_group, p.product_name, pl.sort_order`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching pricing matrix:", error);
    res.status(500).json({ error: "Failed to fetch pricing matrix" });
  }
});

// PUT update/set a single product price
router.put("/:id/prices/:productId", async (req, res) => {
  try {
    const { id, productId } = req.params;
    const { price_per_tonne } = req.body;

    if (price_per_tonne === undefined || price_per_tonne === null) {
      return res.status(400).json({ error: "price_per_tonne is required" });
    }

    // Upsert - insert or update
    const result = await query(
      `INSERT INTO product_prices (product_id, price_list_id, price_per_tonne, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (product_id, price_list_id) 
       DO UPDATE SET price_per_tonne = $3, updated_at = NOW()
       RETURNING *`,
      [productId, id, price_per_tonne]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating product price:", error);
    res.status(500).json({ error: "Failed to update product price" });
  }
});

// PUT bulk update prices for a price list
router.put("/:id/prices", async (req, res) => {
  try {
    const { id } = req.params;
    const { prices } = req.body; // Array of { product_id, price_per_tonne }

    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ error: "prices array is required" });
    }

    let updated = 0;
    for (const price of prices) {
      await query(
        `INSERT INTO product_prices (product_id, price_list_id, price_per_tonne, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (product_id, price_list_id) 
         DO UPDATE SET price_per_tonne = $3, updated_at = NOW()`,
        [price.product_id, id, price.price_per_tonne]
      );
      updated++;
    }

    res.json({ message: `Updated ${updated} prices`, count: updated });
  } catch (error) {
    console.error("Error bulk updating prices:", error);
    res.status(500).json({ error: "Failed to bulk update prices" });
  }
});

module.exports = router;