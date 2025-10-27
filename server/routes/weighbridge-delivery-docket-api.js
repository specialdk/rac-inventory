// ============================================
// WEIGHBRIDGE DELIVERY DOCKET API
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database");

// ============================================
// GET DOCKET DATA BY MOVEMENT ID
// ============================================
router.get("/dockets/:movementId", async (req, res) => {
  console.log("🔵 Weighbridge Docket API Called");
  console.log("📝 Movement ID:", req.params.movementId);

  try {
    const { movementId } = req.params;

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
        sm.delivery_id
      FROM stock_movements sm
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
      LEFT JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN locations l ON sm.to_location_id = l.location_id
      LEFT JOIN drivers d ON sm.driver_id = d.driver_id
      LEFT JOIN deliveries del ON sm.delivery_id = del.delivery_id
      WHERE sm.movement_id = $1
        AND sm.movement_type = 'SALES'
    `;

    console.log("🔍 Executing Query for Movement ID:", movementId);

    const result = await pool.query(query, [movementId]);

    if (result.rows.length === 0) {
      console.log("❌ No docket found for movement ID:", movementId);
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
      SELECT movement_id
      FROM stock_movements
      WHERE movement_type = 'SALES'
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
      movementId: result.rows[0].movement_id,
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
