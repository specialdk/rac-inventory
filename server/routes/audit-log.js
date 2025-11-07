// ============================================
// AUDIT LOG API
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database");

// ============================================
// LOG AUDIT EVENT
// ============================================
async function logAuditEvent({
  user_email,
  action_type,
  entity_type = null,
  entity_id = null,
  description,
  old_values = null,
  new_values = null,
  ip_address = null,
  success = true,
}) {
  try {
    const query = `
      INSERT INTO audit_log (
        user_email,
        action_type,
        entity_type,
        entity_id,
        description,
        old_values,
        new_values,
        ip_address,
        success
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING log_id
    `;

    const values = [
      user_email,
      action_type,
      entity_type,
      entity_id,
      description,
      old_values ? JSON.stringify(old_values) : null,
      new_values ? JSON.stringify(new_values) : null,
      ip_address,
      success,
    ];

    const result = await pool.query(query, values);
    console.log(`📝 Audit log created: ${action_type} by ${user_email}`);
    return result.rows[0].log_id;
  } catch (error) {
    console.error("❌ Error logging audit event:", error);
    // Don't throw - we don't want audit logging to break the main operation
    return null;
  }
}

// ============================================
// PUBLIC ENDPOINT FOR CLIENT-SIDE LOGGING
// ============================================
router.post("/audit/log", async (req, res) => {
  try {
    const {
      user_email,
      action_type,
      entity_type,
      entity_id,
      description,
      old_values,
      new_values,
      success,
    } = req.body;

    // Get IP address
    const ip_address =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    const logId = await logAuditEvent({
      user_email,
      action_type,
      entity_type,
      entity_id,
      description,
      old_values,
      new_values,
      ip_address,
      success,
    });

    res.json({
      success: true,
      logId,
    });
  } catch (error) {
    console.error("Error in audit log endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Error logging audit event",
    });
  }
});

// ============================================
// GET AUDIT LOGS (for future admin page)
// ============================================
router.get("/audit/logs", async (req, res) => {
  try {
    const { user_email, action_type, limit = 100 } = req.query;

    let query = `
      SELECT 
        log_id,
        log_timestamp,
        user_email,
        action_type,
        entity_type,
        entity_id,
        description,
        success
      FROM audit_log
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (user_email) {
      paramCount++;
      query += ` AND user_email = $${paramCount}`;
      params.push(user_email);
    }

    if (action_type) {
      paramCount++;
      query += ` AND action_type = $${paramCount}`;
      params.push(action_type);
    }

    query += ` ORDER BY log_timestamp DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      logs: result.rows,
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching audit logs",
    });
  }
});

// Export both the router and the logging function
module.exports = {
  router,
  logAuditEvent,
};
