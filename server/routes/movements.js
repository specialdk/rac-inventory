const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// ============================================
// VALIDATION: Single Product Per Location
// ============================================
async function validateSingleProductPerLocation(client, locationId, productId) {
  try {
    // Check if location has a DIFFERENT product already
    const query = `
      SELECT 
        p.product_code,
        p.product_name,
        cs.quantity
      FROM current_stock cs
      JOIN products p ON cs.product_id = p.product_id
      WHERE cs.location_id = $1
        AND cs.product_id != $2
        AND cs.quantity > 0
      LIMIT 1
    `;

    const result = await client.query(query, [locationId, productId]);

    if (result.rows.length > 0) {
      const existingProduct = result.rows[0];
      return {
        valid: false,
        error: `LOCATION CONFLICT: This location already contains ${existingProduct.product_name} (${existingProduct.product_code}) - ${existingProduct.quantity} tonnes. You cannot mix products in the same location. Please clear the existing product first or choose a different location.`,
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("Error validating single product per location:", error);
    throw error;
  }
}

// ============================================
// Rest of your code continues here...
// ============================================

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

    // BUSINESS RULE: Check if destination stockpile already has a different product
    // CRITICAL: Validate single product per location
    const validation = await validateSingleProductPerLocation(
      client,
      to_location_id,
      product_id
    );

    if (!validation.valid) {
      throw new Error(validation.error);
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
      from_location_id,
      gross_weight,
      tare_weight,
      quantity, // This is NET weight calculated by frontend
      unit_price,
      customer_id,
      vehicle_id,
      driver_id,
      delivery_id,
     trailer_count = 1,
    price_list_id,
      carrier_id,
      del_ct = "TONNES",
      del_hours,
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

    // AUTO-ASSIGN DOCKET NUMBER
    // Get the latest docket number that matches DN##### format
    const latestDocketResult = await client.query(
      `SELECT docket_number 
       FROM stock_movements 
       WHERE movement_type = 'SALES' 
         AND docket_number LIKE 'DN%'
         AND docket_number IS NOT NULL 
       ORDER BY movement_id DESC 
       LIMIT 1`
    );

    let docket_number;
    if (latestDocketResult.rows.length === 0) {
      // First docket ever with DN format
      docket_number = "DN00001";
    } else {
      const lastDocket = latestDocketResult.rows[0].docket_number;
      // Extract the numeric part (e.g., "DN00005" -> "00005" -> 5)
      const numericPart = parseInt(lastDocket.replace("DN", ""));

      // Handle invalid formats gracefully
      if (isNaN(numericPart)) {
        console.warn(
          `⚠️ Invalid docket format found: ${lastDocket}. Starting from DN00001`
        );
        docket_number = "DN00001";
      } else {
        // Increment and format back to DN00006
        const nextNumber = numericPart + 1;
        docket_number = `DN${nextNumber.toString().padStart(5, "0")}`;
      }
    }

    console.log(`🎫 Auto-assigned docket number: ${docket_number}`);

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
    driver_id, delivery_id, trailer_count, carrier_id, gross_weight, tare_weight, docket_number, reference_number, notes, created_by, price_list_id, del_ct, del_hours)
   VALUES ($1, 'SALES', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
   RETURNING *`,
      [
        movement_date,
        product_id,
        from_location_id,
        quantity, // NET weight
        unit_cost,
        total_cost,
        unit_price,
        total_revenue,
        customer_id,
        vehicle_id,
        driver_id,
        delivery_id,
        trailer_count,
        carrier_id,
        gross_weight, 
        tare_weight, 
        docket_number,
        reference_number,
        notes,
        created_by,
        price_list_id || null,
        del_ct,
        del_hours || null,
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
      quantity,
      unit_cost,
      reason,
      notes,
      created_by = "system",
    } = req.body;

    // Parse quantity safely
    const adjustmentQty = parseFloat(quantity);

    if (
      !movement_date ||
      !product_id ||
      !location_id ||
      isNaN(adjustmentQty)
    ) {
      throw new Error("Missing required fields");
    }

    // Get current average cost
    const stockResult = await client.query(
      "SELECT average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [product_id, location_id]
    );

    const avgCostFromDB =
      stockResult.rows.length > 0
        ? parseFloat(stockResult.rows[0].average_cost)
        : 0;

    const finalCost = parseFloat(unit_cost) || avgCostFromDB;

    // Store ABSOLUTE quantity in movement, use from/to location for direction
    const absQty = Math.abs(adjustmentQty);
    const from_location_id = adjustmentQty < 0 ? location_id : null;
    const to_location_id = adjustmentQty > 0 ? location_id : null;
    const total_cost = absQty * finalCost;

    // Insert movement record
    const movementResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, from_location_id, to_location_id, quantity, 
        unit_cost, total_cost, reference_number, notes, created_by)
       VALUES ($1, 'ADJUSTMENT', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        movement_date,
        product_id,
        from_location_id,
        to_location_id,
        absQty,
        finalCost,
        total_cost,
        reason,
        notes,
        created_by,
      ]
    );

    // Update current stock - DIRECT update, no weighted average for stocktake
    const stockCheck = await client.query(
      `SELECT quantity FROM current_stock WHERE product_id = $1 AND location_id = $2`,
      [product_id, location_id]
    );

    const oldQty = parseFloat(stockCheck.rows[0]?.quantity || 0);
    const newQty = oldQty + adjustmentQty;

    // Calculate total_value safely
    const totalValue = Math.abs(newQty) * finalCost * (newQty < 0 ? -1 : 1);

    console.log(`📊 Stocktake adjustment: ${oldQty} + (${adjustmentQty}) = ${newQty} @ $${finalCost}/t`);

    if (stockCheck.rows.length > 0) {
      // Update existing - SET cost directly, don't blend
      await client.query(
        `UPDATE current_stock 
         SET quantity = $1,
             average_cost = $2,
             total_value = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $4 AND location_id = $5`,
        [newQty, finalCost, totalValue, product_id, location_id]
      );
    } else {
      // Insert new
      await client.query(
        `INSERT INTO current_stock (product_id, location_id, quantity, average_cost, total_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [product_id, location_id, newQty, finalCost, totalValue]
      );
    }

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
      search, // ADD THIS LINE
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
      sql += ` AND sm.movement_date::date >= $${paramCount}::date`;
      params.push(date_from);
      paramCount++;
    }

    if (date_to) {
      sql += ` AND sm.movement_date::date <= $${paramCount}::date`;
      params.push(date_to);
      paramCount++;
    }

    // ADD TEXT SEARCH - searches across product name, family, location, customer
    if (search) {
      sql += ` AND (
        UPPER(p.product_name) LIKE UPPER($${paramCount})
        OR UPPER(p.family_group) LIKE UPPER($${paramCount})
        OR UPPER(p.product_code) LIKE UPPER($${paramCount})
        OR UPPER(fl.location_name) LIKE UPPER($${paramCount})
        OR UPPER(tl.location_name) LIKE UPPER($${paramCount})
        OR UPPER(c.customer_name) LIKE UPPER($${paramCount})
        OR UPPER(sm.reference_number) LIKE UPPER($${paramCount})
      )`;
      params.push(`%${search}%`);
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

// POST demand entry
router.post("/demand", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      movement_date,
      product_id,
      quantity,
      customer_id,
      po_number,
      reference_number,
      notes,
      created_by = "system",
    } = req.body;

    // Validation
    if (
      !movement_date ||
      !product_id ||
      !quantity ||
      !customer_id ||
      !po_number
    ) {
      throw new Error("Missing required fields");
    }

    // Insert demand record (no stock impact - just tracking future orders)
    const movementResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, quantity, customer_id, reference_number, notes, created_by)
       VALUES ($1, 'DEMAND', $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        movement_date,
        product_id,
        quantity,
        customer_id,
        po_number,
        notes,
        created_by,
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Demand entry recorded successfully",
      movement: movementResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error recording demand:", error);
    res.status(500).json({ error: error.message || "Failed to record demand" });
  } finally {
    client.release();
  }
});


// POST /api/movements/transfer - Transfer stock between locations
router.post("/transfer", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      movement_date,
      product_id,
      from_location_id,
      to_location_id,
      quantity,
      reference_number,
      notes,
    } = req.body;

    // Validate
    if (
      !movement_date ||
      !product_id ||
      !from_location_id ||
      !to_location_id ||
      !quantity
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (from_location_id === to_location_id) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Cannot transfer to the same location" });
    }

    if (quantity <= 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Transfer quantity must be positive" });
    }

    // Get FROM location stock
    const fromStockCheck = await client.query(
      `SELECT quantity, average_cost 
       FROM current_stock 
       WHERE product_id = $1 AND location_id = $2`,
      [product_id, from_location_id]
    );

    if (fromStockCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No stock at source location" });
    }

    const fromQty = parseFloat(fromStockCheck.rows[0].quantity);
    const avgCost = parseFloat(fromStockCheck.rows[0].average_cost);

    // Check if enough stock (allow negative as per requirement)
    if (fromQty < quantity) {
      console.log(
        `⚠️ Warning: Insufficient stock. Available: ${fromQty}t, Requested: ${quantity}t`
      );
    }

    // CRITICAL: Validate single product per location
    const validation = await validateSingleProductPerLocation(
      client,
      to_location_id,
      product_id
    );

    if (!validation.valid) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: validation.error,
      });
    }

    // Create stock movement record
    const movementResult = await client.query(
      `INSERT INTO stock_movements (
        movement_date, 
        movement_type,
        product_id,
        from_location_id,
        to_location_id,
        quantity,
        unit_cost,
        reference_number,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING movement_id`,
      [
        movement_date,
        "TRANSFER",
        product_id,
        from_location_id,
        to_location_id,
        quantity,
        avgCost,
        reference_number || `TRF-${Date.now()}`,
        notes,
      ]
    );

    // Update FROM location (subtract)
    const newFromQty = fromQty - quantity;
    await client.query(
      `UPDATE current_stock 
       SET quantity = $1,
           total_value = $1 * average_cost,
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $2 AND location_id = $3`,
      [newFromQty, product_id, from_location_id]
    );

    // Update TO location (add)
    const toStock = await client.query(
      `SELECT quantity FROM current_stock WHERE product_id = $1 AND location_id = $2`,
      [product_id, to_location_id]
    );

    if (toStock.rows.length > 0) {
      const newToQty = parseFloat(toStock.rows[0].quantity) + quantity;
      await client.query(
        `UPDATE current_stock 
         SET quantity = $1,
             total_value = $1 * average_cost,
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $2 AND location_id = $3`,
        [newToQty, product_id, to_location_id]
      );
    } else {
      const totalValue = quantity * avgCost;
      await client.query(
        `INSERT INTO current_stock (product_id, location_id, quantity, average_cost, total_value)
   VALUES ($1, $2, $3, $4, $5)`,
        [product_id, to_location_id, quantity, avgCost, totalValue]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Stock transfer saved successfully",
      movement_id: movementResult.rows[0].movement_id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error saving transfer:", error);
    res.status(500).json({ error: "Failed to save transfer" });
  } finally {
    client.release();
  }
});

// PUT update delivery hours on a sale
router.put("/:id/delivery-hours", async (req, res) => {
  try {
    const { id } = req.params;
    const { del_hours } = req.body;

    if (del_hours === undefined || del_hours === null || del_hours <= 0) {
      return res.status(400).json({ error: "Hours must be a positive number" });
    }

    // Verify this is a SALES movement with HOURS charge type
    const check = await pool.query(
      `SELECT movement_id, del_ct, docket_number FROM stock_movements 
       WHERE movement_id = $1 AND movement_type = 'SALES'`,
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Sale not found" });
    }

    if (check.rows[0].del_ct !== 'HOURS') {
      return res.status(400).json({ error: "This sale uses per-tonne delivery charging, not hourly" });
    }

    // Update the hours
    const result = await pool.query(
      `UPDATE stock_movements SET del_hours = $1, updated_at = NOW() 
       WHERE movement_id = $2 RETURNING movement_id, docket_number, del_hours`,
      [parseFloat(del_hours), id]
    );

    console.log(`✅ Delivery hours updated: Docket ${result.rows[0].docket_number} = ${del_hours} hours`);

    res.json({
      success: true,
      message: "Delivery hours updated",
      movement: result.rows[0]
    });
  } catch (error) {
    console.error("Error updating delivery hours:", error);
    res.status(500).json({ error: "Failed to update delivery hours" });
  }
});

module.exports = router;
