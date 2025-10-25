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
  console.log("🔵 Account Detail Report API Called");
  console.log("📝 Query Parameters:", req.query);

  try {
    const { dateFrom, dateTo, customerId, productId } = req.query;

    console.log("📅 Date Range:", { dateFrom, dateTo });
    console.log("👤 Customer ID:", customerId || "All Customers");
    console.log("📦 Product ID:", productId || "All Products");

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

    query += " ORDER BY sm.movement_date ASC, sm.docket_number ASC";

    console.log("🔍 Executing Query:");
    console.log(query);
    console.log("📊 Parameters:", params);

    // Execute query with PostgreSQL pool
    const docketsResult = await pool.query(query, params);
    const dockets = docketsResult.rows;

    console.log(`✅ Query returned ${dockets.length} rows`);
    if (dockets.length > 0) {
      console.log("📋 First row sample:", dockets[0]);
    }

    // Get customer name for report header if filtered
    let accountName = "All Accounts";
    if (customerId) {
      console.log("🔍 Fetching customer name for ID:", customerId);
      const customerResult = await pool.query(
        "SELECT customer_name FROM customers WHERE customer_id = $1",
        [customerId]
      );
      accountName = customerResult.rows[0]?.customer_name || "Unknown Customer";
      console.log("👤 Customer Name:", accountName);
    }

    console.log("✅ Sending successful response");
    res.json({
      success: true,
      accountName,
      dateFrom,
      dateTo,
      dockets,
    });
  } catch (error) {
    console.error("❌ ERROR in Account Detail Report:");
    console.error("Error Message:", error.message);
    console.error("Error Code:", error.code);
    console.error("Error Detail:", error.detail);
    console.error("Error Stack:", error.stack);

    res.status(500).json({
      success: false,
      message: "Error generating report",
      error: error.message,
      errorCode: error.code,
      errorDetail: error.detail,
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
