// ============================================
// BACKEND API ENDPOINT FOR ACCOUNT DETAIL REPORT
// Fixed for PostgreSQL with proper syntax
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database"); // PostgreSQL connection pool

// ============================================
// GET ACCOUNT DETAIL REPORT DATA
// ============================================
router.get("/reports/account-detail", async (req, res) => {
  try {
    const { dateFrom, dateTo, customerId, productId } = req.query;

    // Build SQL query with filters
    let query = `
      SELECT 
        sm.movement_id,
        sm.movement_date,
        sm.docket_number as docket_no,
        sm.quantity as net_weight,
        sm.unit_price,
        sm.total_revenue as fee,
        (sm.total_revenue * 0.10) as gst,
        (sm.total_revenue * 1.10) as total,
        c.customer_name,
        p.product_name
      FROM stock_movements sm
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN products p ON sm.product_id = p.product_id
      WHERE sm.movement_type = 'SALES'
        AND sm.movement_date BETWEEN $1 AND $2
    `;

    const params = [dateFrom, dateTo];
    let paramCount = 2;

    if (customerId) {
      paramCount++;
      query += ` AND sm.customer_id = $${paramCount}`;
      params.push(customerId);
    }

    if (productId) {
      paramCount++;
      query += ` AND sm.product_id = $${paramCount}`;
      params.push(productId);
    }

    query += " ORDER BY sm.movement_date ASC, sm.reference_no ASC";

    // Execute query with PostgreSQL pool
    const docketsResult = await pool.query(query, params);
    const dockets = docketsResult.rows;

    // Get customer name for report header if filtered
    let accountName = "All Accounts";
    if (customerId) {
      const customerResult = await pool.query(
        "SELECT customer_name FROM customers WHERE customer_id = $1",
        [customerId]
      );
      accountName = customerResult.rows[0]?.customer_name || "Unknown Customer";
    }

    res.json({
      success: true,
      accountName,
      dateFrom,
      dateTo,
      dockets,
    });
  } catch (error) {
    console.error("Error fetching account detail report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating report",
      error: error.message,
    });
  }
});

module.exports = router;

// ============================================
// USAGE IN YOUR MAIN SERVER FILE (server.js)
// ============================================
/*
const accountDetailRoutes = require('./routes/account-detail-report-api');
app.use('/api', accountDetailRoutes);
*/
