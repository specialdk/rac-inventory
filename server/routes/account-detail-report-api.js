// ============================================
// ACCOUNT DETAIL REPORT API - WITH PDF GENERATION
// Updated to support PDF downloads
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

// ============================================
// GET ACCOUNT DETAIL REPORT DATA (JSON)
// ============================================
router.get("/reports/account-detail", async (req, res) => {
  console.log("🔵 Account Detail Report API Called");
  console.log("📝 Query Parameters:", req.query);

  try {
    const { dateFrom, dateTo, customerId, productId } = req.query;

    console.log("📅 Date Range:", { dateFrom, dateTo });
    console.log("👤 Customer ID:", customerId || "All Customers");
    console.log("📦 Product ID:", productId || "All Products");

    // Build SQL query with proper joins and Net Weight calculation
    let query = `
      SELECT 
        sm.movement_id,
        sm.movement_date,
        sm.docket_number as docket_no,
        v.registration as rego,
        p.product_name,
        del.delivery_name as destination,
        (sm.quantity - COALESCE(sm.tare_weight, 0)) as net_weight,
        sm.unit_price,
        sm.total_revenue as fee,
        (sm.total_revenue * 0.10) as gst,
        (sm.total_revenue * 1.10) as total,
        c.customer_name as account
      FROM stock_movements sm
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
      LEFT JOIN deliveries del ON sm.delivery_id = del.delivery_id
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

    // Execute query
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

// ============================================
// DOWNLOAD ACCOUNT DETAIL REPORT AS PDF
// ============================================
router.get("/reports/account-detail/pdf", async (req, res) => {
  console.log("📄 Account Detail Report PDF Download Requested");
  console.log("📝 Query Parameters:", req.query);

  try {
    const { dateFrom, dateTo, customerId, productId } = req.query;

    // Build SQL query (same as JSON endpoint)
    let query = `
      SELECT 
        sm.movement_id,
        sm.movement_date,
        sm.docket_number as docket_no,
        v.registration as rego,
        p.product_name,
        del.delivery_name as destination,
        (sm.quantity - COALESCE(sm.tare_weight, 0)) as net_weight,
        sm.unit_price,
        sm.total_revenue as fee,
        (sm.total_revenue * 0.10) as gst,
        (sm.total_revenue * 1.10) as total,
        c.customer_name as account
      FROM stock_movements sm
      LEFT JOIN customers c ON sm.customer_id = c.customer_id
      LEFT JOIN products p ON sm.product_id = p.product_id
      LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
      LEFT JOIN deliveries del ON sm.delivery_id = del.delivery_id
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

    // Execute query
    const docketsResult = await pool.query(query, params);
    const dockets = docketsResult.rows;

    console.log(`✅ Query returned ${dockets.length} dockets`);

    // Get customer name for report header if filtered
    let accountName = "All Accounts";
    if (customerId) {
      const customerResult = await pool.query(
        "SELECT customer_name FROM customers WHERE customer_id = $1",
        [customerId]
      );
      accountName = customerResult.rows[0]?.customer_name || "Unknown Customer";
    }

    // Create PDF
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
    });

    // Set response headers for PDF download
    const filename = `Account_Detail_Report_${dateFrom}_to_${dateTo}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add company header
    doc.fontSize(18).text("Rirratjingu Mining Pty Ltd", 50, 50);
    doc.fontSize(10).text("Melville Rd, Nhulunbuy NT 0881", 50, 75);
    doc.text("Ph. 08 8987 3433", 50, 90);
    doc.text("ABN 15 129 907 660", 50, 105);

    // Add logo (if exists)
    const logoPath = path.join(
      __dirname,
      "../../public/RAC_Mining_Logo.png.png"
    );
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 650, 50, { width: 100 });
    }

    // Report title
    doc.fontSize(16).fillColor("black").text("Account Detail Report", 50, 140, {
      align: "center",
    });

    // Date range subtitle
    doc
      .fontSize(12)
      .text(
        `Completed Dockets for: ${formatDate(dateFrom)} to ${formatDate(
          dateTo
        )}`,
        50,
        165,
        { align: "center" }
      );

    // Printed date
    doc.fontSize(10).text(`Printed on: ${formatDate(new Date())}`, 650, 140);

    // Table headers
    let yPos = 200;
    doc.fontSize(9).fillColor("black");

    const headers = [
      { text: "Account", x: 50, width: 80 },
      { text: "Date", x: 135, width: 60 },
      { text: "Docket #", x: 200, width: 50 },
      { text: "Rego", x: 255, width: 50 },
      { text: "Product", x: 310, width: 100 },
      { text: "Destination", x: 415, width: 80 },
      { text: "Net Wt", x: 500, width: 45 },
      { text: "Fee", x: 550, width: 50 },
      { text: "GST", x: 605, width: 45 },
      { text: "Total", x: 655, width: 50 },
    ];

    // Draw header line
    doc
      .moveTo(50, yPos + 15)
      .lineTo(750, yPos + 15)
      .stroke();

    // Print headers
    headers.forEach((header) => {
      doc.text(header.text, header.x, yPos, { width: header.width });
    });

    yPos += 25;
    doc.moveTo(50, yPos).lineTo(750, yPos).stroke();

    // Print data rows
    let totalNetWt = 0,
      totalFee = 0,
      totalGST = 0,
      totalAmount = 0;

    dockets.forEach((docket, index) => {
      // Check if we need a new page
      if (yPos > 520) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 50 });
        yPos = 50;
      }

      yPos += 5;

      const netWt = parseFloat(docket.net_weight) || 0;
      const fee = parseFloat(docket.fee) || 0;
      const gst = parseFloat(docket.gst) || 0;
      const total = parseFloat(docket.total) || 0;

      // Accumulate totals
      totalNetWt += netWt;
      totalFee += fee;
      totalGST += gst;
      totalAmount += total;

      // Print row data
      doc.fontSize(8);
      doc.text(docket.account || "-", 50, yPos, { width: 80 });
      doc.text(formatDateShort(docket.movement_date), 135, yPos, { width: 60 });
      doc.text(docket.docket_no || "-", 200, yPos, { width: 50 });
      doc.text(docket.rego || "-", 255, yPos, { width: 50 });
      doc.text(docket.product_name || "-", 310, yPos, { width: 100 });
      doc.text(docket.destination || "-", 415, yPos, { width: 80 });
      doc.text(`${netWt.toFixed(2)} t`, 500, yPos, { width: 45 });
      doc.text(`$${fee.toFixed(2)}`, 550, yPos, { width: 50 });
      doc.text(`$${gst.toFixed(2)}`, 605, yPos, { width: 45 });
      doc.text(`$${total.toFixed(2)}`, 655, yPos, { width: 50 });

      yPos += 18;
    });

    // Draw totals row
    yPos += 5;
    doc
      .moveTo(50, yPos)
      .lineTo(750, yPos)
      .strokeColor("black")
      .lineWidth(2)
      .stroke();
    yPos += 8;

    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Grand Total", 50, yPos);
    doc.text(`${totalNetWt.toFixed(1)} t`, 500, yPos, { width: 45 });
    doc.text(`$${totalFee.toFixed(2)}`, 550, yPos, { width: 50 });
    doc.text(`$${totalGST.toFixed(2)}`, 605, yPos, { width: 45 });
    doc.text(`$${totalAmount.toFixed(2)}`, 655, yPos, { width: 50 });

    yPos += 15;
    doc.moveTo(50, yPos).lineTo(750, yPos).stroke();

    // Finalize PDF
    doc.end();

    console.log("✅ PDF generated successfully");
  } catch (error) {
    console.error("❌ ERROR generating PDF:", error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Error generating PDF",
        error: error.message,
      });
    }
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateShort(dateString) {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    " " +
    date.toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

module.exports = router;
