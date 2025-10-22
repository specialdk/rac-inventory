const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// Helper function to update current stock with weighted average cost
async function updateCurrentStock(
  client,
  productId,
  locationId,
  quantityChange,
  unitCost,
  movementType
) {
  // Get current stock
  const stockResult = await client.query(
    "SELECT * FROM current_stock WHERE product_id = $1 AND location_id = $2",
    [productId, locationId]
  );

  if (stockResult.rows.length === 0) {
    // No existing stock - create new record
    if (quantityChange > 0) {
      await client.query(
        `INSERT INTO current_stock (product_id, location_id, quantity, average_cost, total_value, last_movement_date)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          productId,
          locationId,
          quantityChange,
          unitCost,
          quantityChange * unitCost,
        ]
      );
    }
  } else {
    const currentStock = stockResult.rows[0];
    const oldQty = parseFloat(currentStock.quantity);
    const oldCost = parseFloat(currentStock.average_cost);

    let newQty = oldQty + quantityChange;
    let newAvgCost = oldCost;

    // Calculate weighted average cost for PRODUCTION or OPENING (adding stock)
    if (
      movementType === "PRODUCTION" ||
      movementType === "OPENING" ||
      movementType === "ADJUSTMENT"
    ) {
      if (quantityChange > 0 && unitCost > 0) {
        // Adding stock - recalculate weighted average
        newAvgCost = (oldQty * oldCost + quantityChange * unitCost) / newQty;
      }
    }
    // For SALES - quantity decreases but average cost stays the same

    const newValue = newQty * newAvgCost;

    await client.query(
      `UPDATE current_stock 
       SET quantity = $1, average_cost = $2, total_value = $3, last_movement_date = NOW(), updated_at = NOW()
       WHERE product_id = $4 AND location_id = $5`,
      [newQty, newAvgCost, newValue, productId, locationId]
    );
  }
}

// POST production entry
router.post("/production", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      movement_date,
      product_id,
      from_location_id, // Production area (usually location 00)
      to_location_id, // Stockpile
      quantity,
      unit_cost,
      vehicle_id,
      driver_id,
      reference_number,
      notes,
      created_by = "system",
    } = req.body;

    // Validation
    if (
      !movement_date ||
      !product_id ||
      !to_location_id ||
      !quantity ||
      !unit_cost
    ) {
      throw new Error("Missing required fields");
    }

    const total_cost = quantity * unit_cost;

    // Insert movement record
    const movementResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, from_location_id, to_location_id, 
        quantity, unit_cost, total_cost, vehicle_id, driver_id, reference_number, notes, created_by)
       VALUES ($1, 'PRODUCTION', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        movement_date,
        product_id,
        from_location_id,
        to_location_id,
        quantity,
        unit_cost,
        total_cost,
        vehicle_id,
        driver_id,
        reference_number,
        notes,
        created_by,
      ]
    );

    // Update current stock at destination (stockpile)
    await updateCurrentStock(
      client,
      product_id,
      to_location_id,
      quantity,
      unit_cost,
      "PRODUCTION"
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Production entry recorded successfully",
      movement: movementResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error recording production:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to record production" });
  } finally {
    client.release();
  }
});

// POST sales entry
router.post("/sales", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      movement_date,
      product_id,
      from_location_id, // Stockpile
      quantity,
      unit_price,
      customer_id,
      vehicle_id,
      driver_id,
      docket_number,
      reference_number,
      notes,
      created_by = "system",
    } = req.body;

    // Validation
    if (
      !movement_date ||
      !product_id ||
      !from_location_id ||
      !quantity ||
      !unit_price
    ) {
      throw new Error("Missing required fields");
    }

    // Check if sufficient stock exists
    const stockCheck = await client.query(
      "SELECT quantity FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [product_id, from_location_id]
    );

    if (
      stockCheck.rows.length === 0 ||
      parseFloat(stockCheck.rows[0].quantity) < quantity
    ) {
      throw new Error("Insufficient stock for this sale");
    }

    // Get current average cost for this product/location
    const costResult = await client.query(
      "SELECT average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [product_id, from_location_id]
    );

    const unit_cost = parseFloat(costResult.rows[0].average_cost);
    const total_cost = quantity * unit_cost;
    const total_revenue = quantity * unit_price;

    // Insert movement record
    const movementResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, from_location_id, quantity, 
        unit_cost, total_cost, unit_price, total_revenue, customer_id, vehicle_id, 
        driver_id, docket_number, reference_number, notes, created_by)
       VALUES ($1, 'SALES', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        movement_date,
        product_id,
        from_location_id,
        quantity,
        unit_cost,
        total_cost,
        unit_price,
        total_revenue,
        customer_id,
        vehicle_id,
        driver_id,
        docket_number,
        reference_number,
        notes,
        created_by,
      ]
    );

    // Update current stock at source (decrease)
    await updateCurrentStock(
      client,
      product_id,
      from_location_id,
      -quantity,
      unit_cost,
      "SALES"
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Sale recorded successfully",
      movement: movementResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error recording sale:", error);
    res.status(500).json({ error: error.message || "Failed to record sale" });
  } finally {
    client.release();
  }
});

// POST stocktake adjustment
router.post("/adjustment", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      movement_date,
      product_id,
      location_id,
      quantity_adjustment, // positive or negative
      reason,
      notes,
      created_by = "system",
    } = req.body;

    if (
      !movement_date ||
      !product_id ||
      !location_id ||
      quantity_adjustment === undefined
    ) {
      throw new Error("Missing required fields");
    }

    // Get current average cost
    const stockResult = await client.query(
      "SELECT average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [product_id, location_id]
    );

    const unit_cost =
      stockResult.rows.length > 0
        ? parseFloat(stockResult.rows[0].average_cost)
        : 0;
    const total_cost = quantity_adjustment * unit_cost;

    // Insert movement record
    const movementResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, to_location_id, quantity, 
        unit_cost, total_cost, reference_number, notes, created_by)
       VALUES ($1, 'ADJUSTMENT', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        movement_date,
        product_id,
        location_id,
        quantity_adjustment,
        unit_cost,
        total_cost,
        reason,
        notes,
        created_by,
      ]
    );

    // Update current stock
    await updateCurrentStock(
      client,
      product_id,
      location_id,
      quantity_adjustment,
      unit_cost,
      "ADJUSTMENT"
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Stock adjustment recorded successfully",
      movement: movementResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error recording adjustment:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to record adjustment" });
  } finally {
    client.release();
  }
});

// GET all movements with filters
router.get("/", async (req, res) => {
  try {
    const {
      movement_type,
      product_id,
      customer_id,
      date_from,
      date_to,
      limit = 100,
    } = req.query;

    let sql = `
      SELECT 
        sm.*,
        p.product_code,
        p.product_name,
        p.family_group,
        fl.location_name as from_location_name,
        tl.location_name as to_location_name,
        c.customer_name,
        v.registration as vehicle_registration,
        d.driver_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN locations fl ON sm.from_location_id = fl.location_id
      LEFT JOIN locations tl ON sm.to_location_id = tl.location_id
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
      LEFT JOIN drivers d ON sm.driver_id = d.driver_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (movement_type) {
      sql += ` AND sm.movement_type = $${paramCount}`;
      params.push(movement_type);
      paramCount++;
    }

    if (product_id) {
      sql += ` AND sm.product_id = $${paramCount}`;
      params.push(product_id);
      paramCount++;
    }

    if (customer_id) {
      sql += ` AND sm.customer_id = $${paramCount}`;
      params.push(customer_id);
      paramCount++;
    }

    if (date_from) {
      sql += ` AND sm.movement_date >= $${paramCount}`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      sql += ` AND sm.movement_date <= $${paramCount}`;
      params.push(date_to);
      paramCount++;
    }

    sql += ` ORDER BY sm.movement_date DESC, sm.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(sql, params);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching movements:", error);
    res.status(500).json({ error: "Failed to fetch movements" });
  }
});

// GET movements summary (today's activity)
router.get("/today", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        movement_type,
        COUNT(*) as transaction_count,
        SUM(quantity) as total_quantity,
        SUM(COALESCE(total_revenue, 0)) as total_revenue,
        SUM(COALESCE(total_cost, 0)) as total_cost
      FROM stock_movements
      WHERE movement_date = CURRENT_DATE
      GROUP BY movement_type
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching today movements:", error);
    res.status(500).json({ error: "Failed to fetch today movements" });
  }
});

// GET recent movements (for operations page)
router.get("/recent", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await pool.query(
      `
      SELECT 
        sm.*,
        p.product_code,
        p.product_name,
        p.family_group,
        fl.location_name as from_location_name,
        tl.location_name as to_location_name,
        c.customer_name,
        v.registration as vehicle_registration,
        d.driver_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN locations fl ON sm.from_location_id = fl.location_id
      LEFT JOIN locations tl ON sm.to_location_id = tl.location_id
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
      LEFT JOIN drivers d ON sm.driver_id = d.driver_id
      ORDER BY sm.movement_date DESC, sm.created_at DESC 
      LIMIT $1
    `,
      [limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching recent movements:", error);
    res.status(500).json({ error: "Failed to fetch recent movements" });
  }
});

module.exports = router;
