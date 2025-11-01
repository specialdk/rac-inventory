// ============================================
// DOCKET EDIT API
// Handles editing weighbridge dockets with full audit trail
// ============================================

const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// ============================================
// POST /api/dockets/edit
// Edit a docket (creates REVERSAL + CORRECTION movements)
// ============================================
router.post("/edit", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      original_docket_number,
      product_id,
      from_location_id,
      customer_id,
      unit_price,
      vehicle_id,
      driver_id,
      carrier_id,
      delivery_id,
      reference_number,
      notes,
      edit_reason,
    } = req.body;

    console.log("🔵 Edit Docket API Called");
    console.log("📝 Original Docket:", original_docket_number);
    console.log("📝 Edit Reason:", edit_reason);

    // Validation
    if (
      !original_docket_number ||
      !product_id ||
      !from_location_id ||
      !customer_id ||
      !unit_price ||
      !edit_reason
    ) {
      throw new Error("Missing required fields");
    }

    // ============================================
    // STEP 1: Get original docket data
    // ============================================
    const originalResult = await client.query(
      `SELECT 
        sm.*,
        p.product_name,
        l.location_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN locations l ON sm.from_location_id = l.location_id
      WHERE sm.docket_number = $1 AND sm.movement_type = 'SALES'`,
      [original_docket_number]
    );

    if (originalResult.rows.length === 0) {
      throw new Error("Original docket not found");
    }

    const originalDocket = originalResult.rows[0];
    console.log("✅ Original docket found:", originalDocket.movement_id);

    // Get current average cost for original product/location
    const originalCostResult = await client.query(
      "SELECT average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [originalDocket.product_id, originalDocket.from_location_id]
    );

    const original_unit_cost =
      originalCostResult.rows.length > 0
        ? parseFloat(originalCostResult.rows[0].average_cost)
        : parseFloat(originalDocket.unit_cost);

    // ============================================
    // STEP 2: REVERSAL - Return stock to original location
    // ============================================
    const reversal_quantity = parseFloat(originalDocket.quantity); // Positive (returning)
    const reversal_cost = reversal_quantity * original_unit_cost;

    const reversalResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, to_location_id, 
        quantity, unit_cost, total_cost, customer_id, vehicle_id, driver_id,
        carrier_id, delivery_id, reference_number, notes, 
        original_docket_number, edit_reason, edited_by, created_by)
       VALUES ($1, 'EDIT', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING movement_id`,
      [
        originalDocket.movement_date, // Keep original date
        originalDocket.product_id, // Original product
        originalDocket.from_location_id, // Return to original location
        reversal_quantity, // Positive quantity (adding back)
        original_unit_cost,
        reversal_cost,
        originalDocket.customer_id,
        originalDocket.vehicle_id,
        originalDocket.driver_id,
        originalDocket.carrier_id,
        originalDocket.delivery_id,
        `REVERSAL of ${original_docket_number}`,
        `REVERSAL: ${edit_reason}`,
        original_docket_number,
        edit_reason,
        "system", // Could be updated to track actual user
        "system",
      ]
    );

    console.log(
      "✅ Reversal movement created:",
      reversalResult.rows[0].movement_id
    );

    // Update current_stock for reversal (add stock back)
    await updateCurrentStock(
      client,
      originalDocket.product_id,
      originalDocket.from_location_id,
      reversal_quantity,
      original_unit_cost
    );

    console.log("✅ Stock returned to original location");

    // ============================================
    // STEP 3: CORRECTION - Take stock from new location
    // ============================================

    // Get current average cost for corrected product/location
    const correctedCostResult = await client.query(
      "SELECT average_cost FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [product_id, from_location_id]
    );

    const corrected_unit_cost =
      correctedCostResult.rows.length > 0
        ? parseFloat(correctedCostResult.rows[0].average_cost)
        : 0;

    // Check if sufficient stock exists at new location
    const stockCheck = await client.query(
      "SELECT quantity FROM current_stock WHERE product_id = $1 AND location_id = $2",
      [product_id, from_location_id]
    );

    if (
      stockCheck.rows.length === 0 ||
      parseFloat(stockCheck.rows[0].quantity) < reversal_quantity
    ) {
      throw new Error(
        `Insufficient stock at corrected location. Available: ${
          stockCheck.rows[0]?.quantity || 0
        }t, Required: ${reversal_quantity}t`
      );
    }

    const correction_quantity = reversal_quantity; // Same quantity
    const correction_cost = correction_quantity * corrected_unit_cost;
    const correction_revenue = correction_quantity * unit_price;

    const correctionResult = await client.query(
      `INSERT INTO stock_movements 
       (movement_date, movement_type, product_id, from_location_id, 
        quantity, unit_cost, total_cost, unit_price, total_revenue,
        customer_id, vehicle_id, driver_id, carrier_id, delivery_id,
        gross_weight, tare_weight, reference_number, notes, 
        original_docket_number, edit_reason, edited_by, created_by)
       VALUES ($1, 'EDIT', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING movement_id`,
      [
        originalDocket.movement_date, // Keep original date
        product_id, // Corrected product
        from_location_id, // Corrected location
        correction_quantity, // Same quantity
        corrected_unit_cost,
        correction_cost,
        unit_price, // Corrected price
        correction_revenue,
        customer_id, // Corrected customer
        vehicle_id || null,
        driver_id || null,
        carrier_id || null,
        delivery_id || null,
        originalDocket.gross_weight, // Keep original weights
        originalDocket.tare_weight,
        reference_number || originalDocket.reference_number,
        notes || originalDocket.notes,
        original_docket_number,
        edit_reason,
        "system",
        "system",
      ]
    );

    console.log(
      "✅ Correction movement created:",
      correctionResult.rows[0].movement_id
    );

    // Update current_stock for correction (remove stock)
    await updateCurrentStock(
      client,
      product_id,
      from_location_id,
      -correction_quantity, // Negative (removing)
      corrected_unit_cost
    );

    console.log("✅ Stock taken from corrected location");

    // ============================================
    // STEP 4: Update original docket record
    // ============================================
    await client.query(
      `UPDATE stock_movements 
       SET product_id = $1,
           from_location_id = $2,
           customer_id = $3,
           unit_price = $4,
           total_revenue = quantity * $4,
           vehicle_id = $5,
           driver_id = $6,
           carrier_id = $7,
           delivery_id = $8,
           reference_number = $9,
           notes = $10,
           edited_at = NOW(),
           edited_by = $11,
           edit_reason = $12
       WHERE docket_number = $13`,
      [
        product_id,
        from_location_id,
        customer_id,
        unit_price,
        vehicle_id,
        driver_id,
        carrier_id,
        delivery_id,
        reference_number,
        notes,
        "system",
        edit_reason,
        original_docket_number,
      ]
    );

    console.log("✅ Original docket updated");

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Docket edited successfully",
      reversal_movement_id: reversalResult.rows[0].movement_id,
      correction_movement_id: correctionResult.rows[0].movement_id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR in Edit Docket API:");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);

    res.status(500).json({
      success: false,
      error: error.message || "Failed to edit docket",
    });
  } finally {
    client.release();
  }
});

// ============================================
// Helper function to update current stock
// ============================================
async function updateCurrentStock(
  client,
  productId,
  locationId,
  quantityChange,
  unitCost
) {
  // Get current stock
  const stockResult = await client.query(
    "SELECT * FROM current_stock WHERE product_id = $1 AND location_id = $2",
    [productId, locationId]
  );

  if (stockResult.rows.length === 0) {
    // No existing stock - create new record (only if adding stock)
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

    // For EDIT movements adding stock, recalculate weighted average
    if (quantityChange > 0 && unitCost > 0 && newQty > 0) {
      newAvgCost = (oldQty * oldCost + quantityChange * unitCost) / newQty;
    }

    const newValue = newQty * newAvgCost;

    await client.query(
      `UPDATE current_stock 
       SET quantity = $1, average_cost = $2, total_value = $3, last_movement_date = NOW(), updated_at = NOW()
       WHERE product_id = $4 AND location_id = $5`,
      [newQty, newAvgCost, newValue, productId, locationId]
    );
  }
}

module.exports = router;
