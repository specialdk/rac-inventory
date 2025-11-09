// RAC Inventory - Tare Weights API Routes
const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

// GET /api/tare-weights - Get all tare weights (with filters)
router.get("/tare-weights", async (req, res) => {
  try {
    const {
      vehicle_id,
      carrier_id,
      is_used,
      hours = 24,
      limit = 50,
    } = req.query;

    let query = `
      SELECT 
        tw.tare_id,
        tw.vehicle_id,
        v.registration as vehicle_rego,
        v.vehicle_type,
        tw.tare_weight,
        tw.carrier_id,
        c.carrier_name,
        tw.recorded_at,
        tw.recorded_by,
        tw.notes,
        tw.is_used,
        tw.used_in_docket,
        tw.created_at
      FROM tare_weights tw
      LEFT JOIN vehicles v ON tw.vehicle_id = v.vehicle_id
      LEFT JOIN carriers c ON tw.carrier_id = c.carrier_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (vehicle_id) {
      query += ` AND tw.vehicle_id = $${paramCount}`;
      params.push(vehicle_id);
      paramCount++;
    }

    if (carrier_id) {
      query += ` AND tw.carrier_id = $${paramCount}`;
      params.push(carrier_id);
      paramCount++;
    }

    if (is_used !== undefined) {
      query += ` AND tw.is_used = $${paramCount}`;
      params.push(is_used === "true");
      paramCount++;
    }

    if (hours) {
      query += ` AND tw.recorded_at >= NOW() - INTERVAL '${parseInt(
        hours
      )} hours'`;
    }

    query += ` ORDER BY tw.recorded_at DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching tare weights:", error);
    res.status(500).json({ error: "Failed to fetch tare weights" });
  }
});

// GET /api/tare-weights/recent/:vehicle_id - Get most recent unused tare
router.get("/tare-weights/recent/:vehicle_id", async (req, res) => {
  try {
    const { vehicle_id } = req.params;
    const { hours = 12 } = req.query;

    const query = `
      SELECT 
        tw.tare_id,
        tw.vehicle_id,
        v.registration as vehicle_rego,
        tw.tare_weight,
        tw.carrier_id,
        c.carrier_name,
        tw.recorded_at,
        tw.recorded_by,
        tw.notes,
        tw.is_used,
        EXTRACT(EPOCH FROM (NOW() - tw.recorded_at))/3600 as hours_ago
      FROM tare_weights tw
      LEFT JOIN vehicles v ON tw.vehicle_id = v.vehicle_id
      LEFT JOIN carriers c ON tw.carrier_id = c.carrier_id
      WHERE tw.vehicle_id = $1
        AND tw.recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      ORDER BY tw.recorded_at DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [vehicle_id]);

    if (result.rows.length > 0) {
      res.json({
        success: true,
        tare: result.rows[0],
        message: `Recent tare found (${parseFloat(
          result.rows[0].hours_ago
        ).toFixed(1)} hours ago)`,
      });
    } else {
      res.json({
        success: false,
        message: "No recent unused tare weight found within time window",
      });
    }
  } catch (error) {
    console.error("Error fetching recent tare:", error);
    res.status(500).json({ error: "Failed to fetch recent tare weight" });
  }
});

// GET /api/tare-weights/:tare_id - Get single tare weight
router.get("/tare-weights/:tare_id", async (req, res) => {
  try {
    const { tare_id } = req.params;

    const query = `
      SELECT 
        tw.tare_id,
        tw.vehicle_id,
        v.registration as vehicle_rego,
        v.vehicle_type,
        tw.tare_weight,
        tw.carrier_id,
        c.carrier_name,
        tw.recorded_at,
        tw.recorded_by,
        tw.notes,
        tw.is_used,
        tw.used_in_docket,
        tw.created_at
      FROM tare_weights tw
      LEFT JOIN vehicles v ON tw.vehicle_id = v.vehicle_id
      LEFT JOIN carriers c ON tw.carrier_id = c.carrier_id
      WHERE tw.tare_id = $1
    `;

    const result = await pool.query(query, [tare_id]);

    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: "Tare weight not found" });
    }
  } catch (error) {
    console.error("Error fetching tare weight:", error);
    res.status(500).json({ error: "Failed to fetch tare weight" });
  }
});

// POST /api/tare-weights - Create new tare weight entry
router.post("/tare-weights", async (req, res) => {
  try {
    const { vehicle_id, tare_weight, carrier_id, recorded_by, notes } =
      req.body;

    if (!vehicle_id || !tare_weight) {
      return res.status(400).json({
        error: "Vehicle and tare weight are required",
      });
    }

    if (tare_weight <= 0) {
      return res.status(400).json({
        error: "Tare weight must be positive",
      });
    }

    const query = `
      INSERT INTO tare_weights (
        vehicle_id,
        tare_weight,
        carrier_id,
        recorded_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING tare_id, vehicle_id, tare_weight, recorded_at
    `;

    const result = await pool.query(query, [
      vehicle_id,
      tare_weight,
      carrier_id || null,
      recorded_by || "SYSTEM",
      notes || null,
    ]);

    res.status(201).json({
      success: true,
      message: "Tare weight recorded successfully",
      tare: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating tare weight:", error);
    res.status(500).json({ error: "Failed to record tare weight" });
  }
});

// PUT /api/tare-weights/:tare_id/mark-used - Mark tare as used
router.put("/tare-weights/:tare_id/mark-used", async (req, res) => {
  try {
    const { tare_id } = req.params;
    const { docket_number } = req.body;

    const query = `
      UPDATE tare_weights
      SET 
        is_used = true,
        used_in_docket = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE tare_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [docket_number, tare_id]);

    if (result.rows.length > 0) {
      res.json({
        success: true,
        message: "Tare weight marked as used",
        tare: result.rows[0],
      });
    } else {
      res.status(404).json({ error: "Tare weight not found" });
    }
  } catch (error) {
    console.error("Error marking tare as used:", error);
    res.status(500).json({ error: "Failed to mark tare as used" });
  }
});

// DELETE /api/tare-weights/:tare_id - Delete unused tare
router.delete("/tare-weights/:tare_id", async (req, res) => {
  try {
    const { tare_id } = req.params;

    const checkQuery = "SELECT is_used FROM tare_weights WHERE tare_id = $1";
    const checkResult = await pool.query(checkQuery, [tare_id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Tare weight not found" });
    }

    if (checkResult.rows[0].is_used) {
      return res.status(400).json({
        error: "Cannot delete tare weight that has been used in a sale",
      });
    }

    const deleteQuery = "DELETE FROM tare_weights WHERE tare_id = $1";
    await pool.query(deleteQuery, [tare_id]);

    res.json({
      success: true,
      message: "Tare weight deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tare weight:", error);
    res.status(500).json({ error: "Failed to delete tare weight" });
  }
});

module.exports = router;
