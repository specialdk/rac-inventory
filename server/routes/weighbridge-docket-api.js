// ============================================
// WEIGHBRIDGE DELIVERY DOCKET API
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database");

// ============================================
// GET DOCKET DATA BY DOCKET NUMBER
// ============================================
router.get("/dockets/:docketNumber", async (req, res) => {
  console.log("🔵 Weighbridge Docket API Called");
  console.log("📝 Docket Number:", req.params.docketNumber);

  try {
    const { docketNumber } = req.params;

    // Get complete docket data with all joins
    const query = `
      SELECT 
        sm.movement_id,
        sm.movement_date,
        sm.docket_number,
        sm.quantity as net_weight,
        sm.tare_weight,
        (sm.quantity + COALESCE(sm.tare_weight, 0)) as gross_weight,
        sm.unit_price,
        sm.total_revenue as docket_fee,
        (sm.total_revenue * 0.10) as docket_gst,
        (sm.total_revenue * 1.10) as docket_total,
        sm.reference_number as po_number,
        sm.notes,
        c.customer_name,
        v.registration as vehicle_rego,
        p.product_name,
        p.product_code,
        l.location_code as stockpile_lot,
        d.driver_name,
        del.delivery_name as destination,
        sm.delivery_id,
        car.carrier_name
      FROM stock_movements sm
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
      LEFT JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN locations l ON sm.from_location_id = l.location_id
      LEFT JOIN drivers d ON sm.driver_id = d.driver_id
      LEFT JOIN deliveries del ON sm.delivery_id = del.delivery_id
      LEFT JOIN carriers car ON sm.carrier_id = car.carrier_id
      WHERE sm.docket_number = $1
        AND sm.movement_type = 'SALES'
    `;

    console.log("🔍 Executing Query for Docket Number:", docketNumber);

    const result = await pool.query(query, [docketNumber]);

    if (result.rows.length === 0) {
      console.log("❌ No docket found for docket number:", docketNumber);
      return res.status(404).json({
        success: false,
        message: "Docket not found",
      });
    }

    const docket = result.rows[0];
    console.log("✅ Docket data retrieved:", docket.docket_number);

    res.json({
      success: true,
      docket,
    });
  } catch (error) {
    console.error("❌ ERROR in Weighbridge Docket API:");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);

    res.status(500).json({
      success: false,
      message: "Error retrieving docket",
      error: error.message,
    });
  }
});

// ============================================
// GET LATEST DOCKET (for testing)
// ============================================
router.get("/dockets/latest/sales", async (req, res) => {
  try {
    const query = `
      SELECT docket_number
      FROM stock_movements
      WHERE movement_type = 'SALES'
        AND docket_number IS NOT NULL
      ORDER BY movement_date DESC, movement_id DESC
      LIMIT 1
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales dockets found",
      });
    }

    res.json({
      success: true,
      docketNumber: result.rows[0].docket_number,
    });
  } catch (error) {
    console.error("Error getting latest docket:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving latest docket",
      error: error.message,
    });
  }
});

module.exports = router;
