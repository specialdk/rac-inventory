const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../public")));

// Test database connection
const { pool } = require("./config/database");

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
    });
  }
});

// Dashboard statistics endpoint
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    // Get products with stock
    const productsResult = await pool.query(
      "SELECT COUNT(DISTINCT product_id) as count FROM current_stock WHERE quantity > 0"
    );

    // Get total inventory value
    const valueResult = await pool.query(
      "SELECT COALESCE(SUM(total_value), 0) as total FROM current_stock"
    );

    // Get MTD production (current month)
    const productionResult = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) as total 
       FROM stock_movements 
       WHERE movement_type = 'PRODUCTION' 
       AND movement_date >= DATE_TRUNC('month', CURRENT_DATE)`
    );

    // Get MTD sales (current month)
    const salesResult = await pool.query(
      `SELECT COALESCE(SUM(ABS(quantity)), 0) as total 
       FROM stock_movements 
       WHERE movement_type = 'SALES' 
       AND movement_date >= DATE_TRUNC('month', CURRENT_DATE)`
    );

    res.json({
      productsWithStock: parseInt(productsResult.rows[0].count) || 0,
      totalInventoryValue: parseFloat(valueResult.rows[0].total) || 0,
      mtdProduction: parseFloat(productionResult.rows[0].total) || 0,
      mtdSales: parseFloat(salesResult.rows[0].total) || 0,
    });
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

// API Routes
app.use("/api", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/stock", require("./routes/stock"));
app.use("/api/movements", require("./routes/movements"));
app.use("/api/locations", require("./routes/locations"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/demand-orders", require("./routes/demand-order"));
app.use("/api/deliveries", require("./routes/deliveries"));
app.use("/api/delivery-hourly-rates", require("./routes/delivery-hourly-rates"));
app.use("/api/price-lists", require("./routes/price-lists"));
app.use("/api", require("./routes/carriers"));
app.use("/api", require("./routes/tare-weights"));
app.use("/api", require("./routes/inventory-api"));

// Report Routes
app.use("/api", require("./routes/account-detail-report-api"));
app.use("/api", require("./routes/weighbridge-docket-api"));
app.use("/api/dockets", require("./routes/docket-edit"));
// Audit Log Route
app.use("/api", require("./routes/audit-log").router);

// Serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 RAC Inventory System running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
  console.log(`📋 API Endpoints available:`);
  console.log(`   - GET  /api/health`);
  console.log(`   - /api/products`);
  console.log(`   - /api/stock`);
  console.log(`   - /api/movements`);
  console.log(`   - /api/locations`);
  console.log(`   - /api/customers`);
  console.log(`   - /api/vehicles`);
  console.log(`   - /api/drivers`);
  console.log(`   - /api/reports/account-detail (GET)`);
  console.log(`   - /api/reports/account-detail/email (POST)`);
  console.log(`   - POST /api/dockets/edit (Edit Docket)`);
});
