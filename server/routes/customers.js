const express = require("express");
const router = express.Router();
const { query } = require("../config/database");

// GET all customers
router.get("/", async (req, res) => {
  try {
    const { is_active, customer_type } = req.query;

    let sql = "SELECT * FROM customers WHERE 1=1";
    const params = [];
    let paramCount = 1;

    if (is_active !== undefined) {
      sql += ` AND is_active = $${paramCount}`;
      params.push(is_active === "true");
      paramCount++;
    }

    if (customer_type) {
      sql += ` AND customer_type = $${paramCount}`;
      params.push(customer_type);
      paramCount++;
    }

    sql += " ORDER BY customer_name";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// GET single customer
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      "SELECT * FROM customers WHERE customer_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

// POST create customer
router.post("/", async (req, res) => {
  try {
    const {
      customer_code,
      customer_name,
      contact_person,
      phone,
      email,
      address,
      customer_type,
    } = req.body;

    if (!customer_code || !customer_name) {
      return res.status(400).json({
        error: "Missing required fields: customer_code, customer_name",
      });
    }

    const result = await query(
      `INSERT INTO customers 
       (customer_code, customer_name, contact_person, phone, email, address, customer_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        customer_code,
        customer_name,
        contact_person,
        phone,
        email,
        address,
        customer_type,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating customer:", error);
    if (error.code === "23505") {
      res.status(409).json({ error: "Customer code already exists" });
    } else {
      res.status(500).json({ error: "Failed to create customer" });
    }
  }
});

// PUT update customer
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customer_code,
      customer_name,
      contact_person,
      phone,
      email,
      address,
      customer_type,
      is_active,
    } = req.body;

    const result = await query(
      `UPDATE customers 
       SET customer_code = COALESCE($1, customer_code),
           customer_name = COALESCE($2, customer_name),
           contact_person = $3,
           phone = $4,
           email = $5,
           address = $6,
           customer_type = $7,
           is_active = COALESCE($8, is_active)
       WHERE customer_id = $9
       RETURNING *`,
      [
        customer_code,
        customer_name,
        contact_person,
        phone,
        email,
        address,
        customer_type,
        is_active,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// DELETE customer (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE customers 
       SET is_active = false
       WHERE customer_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      message: "Customer deactivated successfully",
      customer: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

module.exports = router;
