const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET current stock summary (for dashboard)
router.get("/summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT 
  COUNT(DISTINCT cs.product_id) as products_with_stock,
  SUM(cs.total_value) as total_inventory_value,
  SUM(cs.quantity) as total_quantity
FROM current_stock cs
JOIN products p ON cs.product_id = p.product_id
WHERE p.is_active = true AND cs.quantity > 0
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching stock summary:", error);
    res.status(500).json({ error: "Failed to fetch stock summary" });
  }
});

// GET all current stock with product and location details
router.get("/current", async (req, res) => {
  try {
    const result = await query(`
  SELECT 
    cs.stock_id,
    cs.product_id,
    p.product_code,
    p.product_name,
    p.family_group,
    p.standard_sales_price,
    COALESCE(cs.location_id, (SELECT location_id FROM locations WHERE is_active = true LIMIT 1)) as location_id,
    COALESCE(l.location_code, '-') as location_code,
    COALESCE(l.location_name, 'No Location') as location_name,
    COALESCE(cs.quantity, 0) as quantity,
    COALESCE(cs.average_cost, p.standard_cost) as average_cost,
    COALESCE(cs.total_value, 0) as total_value,
    cs.last_movement_date,
    p.min_stock_level,
    p.max_stock_level,
    p.unit,
    COALESCE(
      (SELECT SUM(quantity) 
       FROM stock_movements 
       WHERE product_id = p.product_id 
         AND movement_type = 'DEMAND'
         AND movement_date >= CURRENT_DATE
      ), 0
    ) as demand,
    CASE 
      WHEN COALESCE(cs.quantity, 0) < p.min_stock_level THEN 'LOW'
      WHEN COALESCE(cs.quantity, 0) > p.max_stock_level THEN 'HIGH'
      ELSE 'NORMAL'
    END as status
  FROM products p
  LEFT JOIN current_stock cs ON p.product_id = cs.product_id
  LEFT JOIN locations l ON cs.location_id = l.location_id
  WHERE p.is_active = true 
    AND (cs.quantity > 0 OR 
         EXISTS (SELECT 1 FROM stock_movements 
                 WHERE product_id = p.product_id 
                   AND movement_type = 'DEMAND' 
                   AND movement_date >= CURRENT_DATE))
  ORDER BY p.family_group, p.product_name, l.location_name
`);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching current stock:", error);
    res.status(500).json({ error: "Failed to fetch current stock" });
  }
});

// GET stock for specific product
router.get("/by-product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await query(
      `
      SELECT 
        cs.stock_id,
        cs.location_id,
        l.location_code,
        l.location_name,
        l.location_type,
        cs.quantity,
        cs.average_cost,
        cs.total_value,
        cs.last_movement_date,
        l.capacity_tonnes
      FROM current_stock cs
      JOIN locations l ON cs.location_id = l.location_id
      WHERE cs.product_id = $1 AND cs.quantity > 0
      ORDER BY l.location_name
    `,
      [productId]
    );

    // Also get product details
    const productResult = await query(
      "SELECT * FROM products WHERE product_id = $1",
      [productId]
    );

    res.json({
      product: productResult.rows[0],
      stock_locations: result.rows,
      total_quantity: result.rows.reduce(
        (sum, row) => sum + parseFloat(row.quantity),
        0
      ),
      total_value: result.rows.reduce(
        (sum, row) => sum + parseFloat(row.total_value),
        0
      ),
    });
  } catch (error) {
    console.error("Error fetching stock by product:", error);
    res.status(500).json({ error: "Failed to fetch stock by product" });
  }
});

// GET stock at specific location
router.get("/by-location/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;

    const result = await query(
      `
      SELECT 
        cs.stock_id,
        cs.product_id,
        p.product_code,
        p.product_name,
        p.family_group,
        p.unit,
        cs.quantity,
        cs.average_cost,
        cs.total_value,
        cs.last_movement_date
      FROM current_stock cs
      JOIN products p ON cs.product_id = p.product_id
      WHERE cs.location_id = $1 AND cs.quantity > 0
      ORDER BY p.family_group, p.product_name
    `,
      [locationId]
    );

    // Also get location details
    const locationResult = await query(
      "SELECT * FROM locations WHERE location_id = $1",
      [locationId]
    );

    res.json({
      location: locationResult.rows[0],
      stock_items: result.rows,
      total_value: result.rows.reduce(
        (sum, row) => sum + parseFloat(row.total_value),
        0
      ),
    });
  } catch (error) {
    console.error("Error fetching stock by location:", error);
    res.status(500).json({ error: "Failed to fetch stock by location" });
  }
});

// GET stock levels for all products (aggregated across locations)
router.get("/levels", async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        p.product_id,
        p.product_code,
        p.product_name,
        p.family_group,
        p.unit,
        COALESCE(SUM(cs.quantity), 0) as total_quantity,
        COALESCE(AVG(cs.average_cost), p.standard_cost) as avg_cost,
        COALESCE(SUM(cs.total_value), 0) as total_value,
        p.min_stock_level,
        p.max_stock_level,
        CASE 
          WHEN COALESCE(SUM(cs.quantity), 0) < p.min_stock_level THEN 'LOW'
          WHEN COALESCE(SUM(cs.quantity), 0) > p.max_stock_level THEN 'HIGH'
          ELSE 'NORMAL'
        END as status
      FROM products p
      LEFT JOIN current_stock cs ON p.product_id = cs.product_id
      WHERE p.is_active = true
      GROUP BY p.product_id, p.product_code, p.product_name, p.family_group, 
               p.unit, p.min_stock_level, p.max_stock_level, p.standard_cost
      ORDER BY p.family_group, p.product_name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching stock levels:", error);
    res.status(500).json({ error: "Failed to fetch stock levels" });
  }
});

// GET low stock alerts
router.get("/alerts", async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        p.product_id,
        p.product_code,
        p.product_name,
        p.family_group,
        COALESCE(SUM(cs.quantity), 0) as current_quantity,
        p.min_stock_level,
        p.min_stock_level - COALESCE(SUM(cs.quantity), 0) as shortage
      FROM products p
      LEFT JOIN current_stock cs ON p.product_id = cs.product_id
      WHERE p.is_active = true
      GROUP BY p.product_id, p.product_code, p.product_name, 
               p.family_group, p.min_stock_level
      HAVING COALESCE(SUM(cs.quantity), 0) < p.min_stock_level
      ORDER BY shortage DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching stock alerts:", error);
    res.status(500).json({ error: "Failed to fetch stock alerts" });
  }
});

module.exports = router;
