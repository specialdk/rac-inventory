const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET all demand orders with optional status filter
router.get("/", async (req, res) => {
  try {
    const status = req.query.status; // optional: PENDING, CONFIRMED, FULFILLED, CANCELLED

    let query = `
  SELECT 
    dord.*,
    p.product_code,
    p.product_name,
    p.family_group,
    c.customer_name,
    l.location_name as preferred_location
  FROM demand_orders dord
  JOIN products p ON dord.product_id = p.product_id
  LEFT JOIN customers c ON dord.customer_id = c.customer_id
  LEFT JOIN locations l ON dord.preferred_location_id = l.location_id
`;
    const params = [];
    if (status) {
      query += ` WHERE dord.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY dord.required_date ASC, dord.order_number DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching demand orders:", error);
    res.status(500).json({ error: "Failed to fetch demand orders" });
  }
});

// GET single demand order by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT 
  dord.*,
  p.product_code,
  p.product_name,
  p.family_group,
  c.customer_name,
  l.location_name as preferred_location
FROM demand_orders dord
JOIN products p ON dord.product_id = p.product_id
LEFT JOIN customers c ON dord.customer_id = c.customer_id
LEFT JOIN locations l ON dord.preferred_location_id = l.location_id
WHERE dord.demand_order_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Demand order not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching demand order:", error);
    res.status(500).json({ error: "Failed to fetch demand order" });
  }
});

// POST create new demand order
router.post("/", async (req, res) => {
  try {
    const {
      product_id,
      customer_id,
      quantity,
      required_date,
      preferred_location_id,
      notes,
      po_number,
      status = "PENDING",
    } = req.body;

    if (!product_id || !quantity || !required_date) {
      return res.status(400).json({
        error: "Product, quantity, and required date are required",
      });
    }

    // Generate order number
    const orderNumberResult = await pool.query(
      "SELECT generate_demand_order_number() as order_number"
    );
    const order_number = orderNumberResult.rows[0].order_number;

    const result = await pool.query(
      `INSERT INTO demand_orders (
        order_number,
        product_id,
        customer_id,
        quantity,
        required_date,
        preferred_location_id,
        notes,
        po_number,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [
        order_number,
        product_id,
        customer_id,
        quantity,
        required_date,
        preferred_location_id,
        notes,
        po_number || null,
        status,
        "Admin User",
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating demand order:", error);
    res.status(500).json({ error: "Failed to create demand order" });
  }
});

// PUT update demand order
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      product_id,
      customer_id,
      quantity,
      required_date,
      preferred_location_id,
      notes,
      po_number,
      status,
    } = req.body;

    // Check if order exists and is editable
    const checkResult = await pool.query(
      "SELECT status FROM demand_orders WHERE demand_order_id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Demand order not found" });
    }

    if (checkResult.rows[0].status === "FULFILLED") {
      return res.status(400).json({
        error: "Cannot edit fulfilled orders",
      });
    }

    const result = await pool.query(
      `UPDATE demand_orders 
       SET product_id = COALESCE($1, product_id),
           customer_id = COALESCE($2, customer_id),
           quantity = COALESCE($3, quantity),
           required_date = COALESCE($4, required_date),
           preferred_location_id = $5,
           notes = $6,
           po_number = $7,
           status = COALESCE($8, status),
           last_modified_at = NOW(),
           last_modified_by = $9
       WHERE demand_order_id = $10
       RETURNING *`,
      [
        product_id,
        customer_id,
        quantity,
        required_date,
        preferred_location_id,
        notes,
        po_number !== undefined ? po_number : null,
        status,
        "Admin User",
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating demand order:", error);
    res.status(500).json({ error: "Failed to update demand order" });
  }
});

// PUT cancel demand order
router.put("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE demand_orders 
       SET status = 'CANCELLED',
           cancelled_at = NOW(),
           cancelled_by = $1,
           cancelled_reason = $2,
           last_modified_at = NOW()
       WHERE demand_order_id = $3 AND status != 'FULFILLED'
       RETURNING *`,
      ["Admin User", reason, id] // TODO: Get user from session/auth
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Demand order not found or already fulfilled",
      });
    }

    res.json({
      message: "Demand order cancelled successfully",
      order: result.rows[0],
    });
  } catch (error) {
    console.error("Error cancelling demand order:", error);
    res.status(500).json({ error: "Failed to cancel demand order" });
  }
});

// DELETE demand order (hard delete - use sparingly)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM demand_orders WHERE demand_order_id = $1 AND status = 'PENDING' RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error:
          "Demand order not found or cannot be deleted (only PENDING orders can be deleted)",
      });
    }

    res.json({
      message: "Demand order deleted successfully",
      order: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting demand order:", error);
    res.status(500).json({ error: "Failed to delete demand order" });
  }
});

module.exports = router;
