const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// ============================================
// INVENTORY SUMMARY API
// External endpoint for Finance Dashboard, OPS App, etc.
// GET /api/inventory-summary
// ============================================
router.get("/inventory-summary", async (req, res) => {
  try {
    // 1. Stock on Hand - totals
    const stockTotals = await pool.query(`
      SELECT 
        COUNT(DISTINCT cs.product_id) as product_count,
        COALESCE(SUM(cs.quantity), 0) as total_tonnes,
        COALESCE(SUM(cs.total_value), 0) as total_value
      FROM current_stock cs
      JOIN products p ON cs.product_id = p.product_id
      WHERE p.is_active = true AND cs.quantity > 0
    `);

    // 2. MTD Production & Sales
    const mtdStats = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN movement_type = 'PRODUCTION' THEN quantity ELSE 0 END), 0) as mtd_production,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(quantity) ELSE 0 END), 0) as mtd_sales,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(total_cost) ELSE 0 END), 0) as mtd_sales_cost,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(total_revenue) ELSE 0 END), 0) as mtd_sales_revenue
      FROM stock_movements
      WHERE movement_date >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    // 3. QTD Production & Sales (current quarter)
    const qtdStats = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN movement_type = 'PRODUCTION' THEN quantity ELSE 0 END), 0) as qtd_production,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(quantity) ELSE 0 END), 0) as qtd_sales,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(total_cost) ELSE 0 END), 0) as qtd_sales_cost,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(total_revenue) ELSE 0 END), 0) as qtd_sales_revenue
      FROM stock_movements
      WHERE movement_date >= DATE_TRUNC('quarter', CURRENT_DATE)
    `);

    // 4. Today's Production
    const todayStats = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN movement_type = 'PRODUCTION' THEN quantity ELSE 0 END), 0) as today_production,
        COALESCE(SUM(CASE WHEN movement_type = 'SALES' THEN ABS(quantity) ELSE 0 END), 0) as today_sales
      FROM stock_movements
      WHERE movement_date = CURRENT_DATE
    `);

    // 5. Forward Orders (demand orders with PENDING or CONFIRMED status)
    const forwardOrders = await pool.query(`
      SELECT 
        COUNT(*) as order_count,
        COALESCE(SUM(d.quantity), 0) as total_tonnes,
        COALESCE(SUM(d.quantity * p.current_price), 0) as estimated_value
      FROM demand_orders d
      JOIN products p ON d.product_id = p.product_id
      WHERE d.status IN ('PENDING', 'CONFIRMED')
    `);

    // 6. Product-level breakdown (SOH + demand per product)
    const products = await pool.query(`
      SELECT 
        p.product_id,
        p.product_code,
        p.product_name,
        p.family_group,
        p.unit,
        p.current_price as sales_price,
        COALESCE(SUM(cs.quantity), 0) as soh_tonnes,
        COALESCE(AVG(cs.average_cost), p.standard_cost) as avg_cost,
        COALESCE(SUM(cs.total_value), 0) as stock_value,
        COALESCE(
          (SELECT SUM(quantity) FROM demand_orders 
           WHERE product_id = p.product_id AND status IN ('PENDING', 'CONFIRMED')),
          0
        ) as demand_tonnes,
        COALESCE(
          (SELECT SUM(quantity) FROM stock_movements 
           WHERE product_id = p.product_id AND movement_type = 'PRODUCTION'
           AND movement_date >= DATE_TRUNC('month', CURRENT_DATE)),
          0
        ) as mtd_production,
        COALESCE(
          (SELECT SUM(ABS(quantity)) FROM stock_movements 
           WHERE product_id = p.product_id AND movement_type = 'SALES'
           AND movement_date >= DATE_TRUNC('month', CURRENT_DATE)),
          0
        ) as mtd_sales
      FROM products p
      LEFT JOIN current_stock cs ON p.product_id = cs.product_id
      WHERE p.is_active = true
      GROUP BY p.product_id, p.product_code, p.product_name, p.family_group, 
               p.unit, p.standard_sales_price, p.standard_cost
      ORDER BY p.family_group, p.product_name
    `);

    // 7. Family group summaries (for Xero reconciliation: Sand vs Rock Products)
    const familyGroups = await pool.query(`
      SELECT 
        p.family_group,
        COUNT(DISTINCT p.product_id) as product_count,
        COALESCE(SUM(cs.quantity), 0) as total_tonnes,
        COALESCE(SUM(cs.total_value), 0) as total_value
      FROM products p
      LEFT JOIN current_stock cs ON p.product_id = cs.product_id
      WHERE p.is_active = true
      GROUP BY p.family_group
      ORDER BY p.family_group
    `);

    // Build response
    const totals = stockTotals.rows[0];
    const mtd = mtdStats.rows[0];
    const qtd = qtdStats.rows[0];
    const today = todayStats.rows[0];
    const forward = forwardOrders.rows[0];

    res.json({
      timestamp: new Date().toISOString(),
      system: "RAC Inventory Management",
      version: "1.0",
      
      totals: {
        sohTonnes: parseFloat(totals.total_tonnes) || 0,
        inventoryValue: parseFloat(totals.total_value) || 0,
        productCount: parseInt(totals.product_count) || 0,
        
        today: {
          production: parseFloat(today.today_production) || 0,
          sales: parseFloat(today.today_sales) || 0
        },

       mtd: {
          production: parseFloat(mtd.mtd_production) || 0,
          sales: parseFloat(mtd.mtd_sales) || 0,
          salesCost: parseFloat(mtd.mtd_sales_cost) || 0,
          salesRevenue: parseFloat(mtd.mtd_sales_revenue) || 0
        },

        qtd: {
          production: parseFloat(qtd.qtd_production) || 0,
          sales: parseFloat(qtd.qtd_sales) || 0,
          salesCost: parseFloat(qtd.qtd_sales_cost) || 0,
          salesRevenue: parseFloat(qtd.qtd_sales_revenue) || 0
        },

        forwardOrders: {
          orderCount: parseInt(forward.order_count) || 0,
          tonnes: parseFloat(forward.total_tonnes) || 0,
          estimatedValue: parseFloat(forward.estimated_value) || 0
        }
      },

      familyGroups: familyGroups.rows.map(fg => ({
        group: fg.family_group,
        productCount: parseInt(fg.product_count) || 0,
        totalTonnes: parseFloat(fg.total_tonnes) || 0,
        totalValue: parseFloat(fg.total_value) || 0
      })),

      products: products.rows.map(p => ({
        productId: p.product_id,
        code: p.product_code,
        name: p.product_name,
        group: p.family_group,
        unit: p.unit,
        salesPrice: parseFloat(p.sales_price) || 0,
        sohTonnes: parseFloat(p.soh_tonnes) || 0,
        avgCost: parseFloat(p.avg_cost) || 0,
        stockValue: parseFloat(p.stock_value) || 0,
        demandTonnes: parseFloat(p.demand_tonnes) || 0,
        mtdProduction: parseFloat(p.mtd_production) || 0,
        mtdSales: parseFloat(p.mtd_sales) || 0
      }))
    });

  } catch (error) {
    console.error("Error in inventory summary API:", error);
    res.status(500).json({ 
      error: "Failed to generate inventory summary",
      message: error.message 
    });
  }
});

// ============================================
// FORWARD ORDERS DETAIL
// GET /api/inventory-summary/forward-orders
// For OPS planning - detailed forward order list
// ============================================
router.get("/inventory-summary/forward-orders", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.demand_order_id,
        d.order_number,
        d.status,
        d.quantity,
        d.required_date,
        d.notes,
        p.product_code,
        p.product_name,
        p.family_group,
        p.current_price as unit_price,
         (d.quantity * p.current_price) as estimated_value,
        c.customer_name,
        c.customer_code,
        l.location_name as preferred_location
      FROM demand_orders d
      JOIN products p ON d.product_id = p.product_id
      LEFT JOIN customers c ON d.customer_id = c.customer_id
      LEFT JOIN locations l ON d.preferred_location_id = l.location_id
      WHERE d.status IN ('PENDING', 'CONFIRMED')
      ORDER BY d.required_date ASC, d.order_number DESC
    `);

    res.json({
      timestamp: new Date().toISOString(),
      orderCount: result.rows.length,
      orders: result.rows
    });

  } catch (error) {
    console.error("Error fetching forward orders:", error);
    res.status(500).json({ error: "Failed to fetch forward orders" });
  }
});

// ============================================
// PRODUCTION DAILY BREAKDOWN
// GET /api/inventory-summary/production?days=7
// For OPS timesheets / machine hours
// ============================================
router.get("/inventory-summary/production", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    const result = await pool.query(`
      SELECT 
        sm.movement_date,
        p.product_code,
        p.product_name,
        p.family_group,
        SUM(sm.quantity) as tonnes_produced,
        COUNT(*) as movement_count
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.product_id
      WHERE sm.movement_type = 'PRODUCTION'
        AND sm.movement_date >= CURRENT_DATE - $1::integer
      GROUP BY sm.movement_date, p.product_code, p.product_name, p.family_group
      ORDER BY sm.movement_date DESC, p.family_group, p.product_name
    `, [days]);

    // Also get daily totals
    const dailyTotals = await pool.query(`
      SELECT 
        movement_date,
        SUM(quantity) as total_tonnes,
        COUNT(*) as movement_count
      FROM stock_movements
      WHERE movement_type = 'PRODUCTION'
        AND movement_date >= CURRENT_DATE - $1::integer
      GROUP BY movement_date
      ORDER BY movement_date DESC
    `, [days]);

    res.json({
      timestamp: new Date().toISOString(),
      daysRequested: days,
      dailyTotals: dailyTotals.rows,
      productionDetail: result.rows
    });

  } catch (error) {
    console.error("Error fetching production data:", error);
    res.status(500).json({ error: "Failed to fetch production data" });
  }
});

// ============================================
// SALES DAILY BREAKDOWN  
// GET /api/inventory-summary/sales?days=30
// For sales reporting
// ============================================
router.get("/inventory-summary/sales", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await pool.query(`
      SELECT 
        sm.movement_date,
        p.product_code,
        p.product_name,
        p.family_group,
        c.customer_name,
        c.customer_code,
        SUM(ABS(sm.quantity)) as tonnes_sold,
        SUM(ABS(sm.total_cost)) as sales_value,
        COUNT(*) as docket_count
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      WHERE sm.movement_type = 'SALES'
        AND sm.movement_date >= CURRENT_DATE - $1::integer
      GROUP BY sm.movement_date, p.product_code, p.product_name, p.family_group,
               c.customer_name, c.customer_code
      ORDER BY sm.movement_date DESC, c.customer_name, p.product_name
    `, [days]);

    res.json({
      timestamp: new Date().toISOString(),
      daysRequested: days,
      salesDetail: result.rows
    });

  } catch (error) {
    console.error("Error fetching sales data:", error);
    res.status(500).json({ error: "Failed to fetch sales data" });
  }
});

module.exports = router;