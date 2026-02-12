// ============================================
// ACCOUNT DETAIL REPORT API - WITH PDF & ZIP GENERATION
// Phase 1: Single PDF download ✅
// Phase 2: ZIP with Report + All Dockets ✅
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const PDFDocument = require("pdfkit");
const archiver = require("archiver");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const { logAuditEvent } = require("./audit-log");

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
        (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0)) as delivery_fee,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 0.10) as gst,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 1.10) as total,
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
// DOWNLOAD ACCOUNT DETAIL REPORT AS PDF (PHASE 1)
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
        (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0)) as delivery_fee,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 0.10) as gst,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 1.10) as total,
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

    // Generate Account Detail Report PDF content
    generateAccountDetailPDF(doc, dockets, dateFrom, dateTo);

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
// DOWNLOAD ZIP WITH REPORT + ALL DOCKETS (PHASE 2)
// ============================================
router.get("/reports/account-detail/pdf-with-dockets", async (req, res) => {
  console.log(
    "📦 Account Detail Report ZIP Download Requested (with all dockets)"
  );
  console.log("📝 Query Parameters:", req.query);

  try {
    const { dateFrom, dateTo, customerId, productId } = req.query;

    // Build SQL query for report dockets
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
        (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0)) as delivery_fee,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 0.10) as gst,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 1.10) as total,
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
    const reportDockets = docketsResult.rows;

    console.log(`✅ Query returned ${reportDockets.length} dockets for ZIP`);

    if (reportDockets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No dockets found for the selected criteria",
      });
    }

    // Set response headers for ZIP download
    const zipFilename = `Account_Detail_Report_${dateFrom}_to_${dateTo}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipFilename}"`
    );

    // Create ZIP archive
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    // Handle archive errors
    archive.on("error", (err) => {
      console.error("❌ Archive Error:", err);
      throw err;
    });

    // Pipe archive to response
    archive.pipe(res);

    // 1. Generate and add Account Detail Report PDF
    console.log("📄 Generating Account Detail Report PDF...");
    const reportPDF = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
    });

    const reportBuffer = [];
    reportPDF.on("data", (chunk) => reportBuffer.push(chunk));
    reportPDF.on("end", () => {
      console.log("✅ Account Detail Report PDF buffered");
    });

    generateAccountDetailPDF(reportPDF, reportDockets, dateFrom, dateTo);
    reportPDF.end();

    // Wait for report PDF to finish
    await new Promise((resolve) => reportPDF.on("end", resolve));

    const reportPDFBuffer = Buffer.concat(reportBuffer);
    archive.append(reportPDFBuffer, {
      name: `Account_Detail_Report_${dateFrom}_to_${dateTo}.pdf`,
    });

    console.log("✅ Account Detail Report added to ZIP");

    // 2. Generate and add individual Weighbridge Dockets
    console.log(`📋 Generating ${reportDockets.length} Weighbridge Dockets...`);

    for (let i = 0; i < reportDockets.length; i++) {
      const docket = reportDockets[i];
      console.log(
        `  📄 Generating docket ${i + 1}/${reportDockets.length}: ${
          docket.docket_no
        }`
      );

      // Get full docket data with all details
      const fullDocketQuery = `
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

      const fullDocketResult = await pool.query(fullDocketQuery, [
        docket.docket_no,
      ]);

      if (fullDocketResult.rows.length > 0) {
        const fullDocket = fullDocketResult.rows[0];

        // Generate docket PDF
        const docketPDF = new PDFDocument({
          size: "A4",
          margin: 50,
        });

        const docketBuffer = [];
        docketPDF.on("data", (chunk) => docketBuffer.push(chunk));

        generateWeighbridgeDocketPDF(docketPDF, fullDocket);
        docketPDF.end();

        // Wait for docket PDF to finish
        await new Promise((resolve) => docketPDF.on("end", resolve));

        const docketPDFBuffer = Buffer.concat(docketBuffer);
        archive.append(docketPDFBuffer, {
          name: `Dockets/Docket_${fullDocket.docket_number}.pdf`,
        });

        console.log(`  ✅ Docket ${fullDocket.docket_number} added to ZIP`);
      }
    }

    console.log("📦 Finalizing ZIP archive...");

    // Finalize the archive
    await archive.finalize();

    console.log("✅ ZIP with all dockets generated successfully");
  } catch (error) {
    console.error("❌ ERROR generating ZIP:", error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Error generating ZIP with dockets",
        error: error.message,
      });
    }
  }
});

// ============================================
// EMAIL ACCOUNT DETAIL REPORT WITH ZIP
// ============================================
router.post("/reports/account-detail/email", async (req, res) => {
  console.log("📧 Account Detail Report Email Requested");
  console.log("📝 Request Body:", req.body);

  try {
    const {
      dateFrom,
      dateTo,
      customerId,
      productId,
      recipientEmail,
      ccEmail,
      customerName,
    } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: "Recipient email is required",
      });
    }

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer must be selected for email reports",
      });
    }

    console.log("📅 Date Range:", { dateFrom, dateTo });
    console.log("👤 Customer ID:", customerId);
    console.log("📧 Recipient:", recipientEmail);
    if (ccEmail) console.log("📧 CC:", ccEmail);

    // Build SQL query for report dockets (reuse existing logic)
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
        (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0)) as delivery_fee,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 0.10) as gst,
        ((sm.total_revenue + (sm.quantity * COALESCE(del.delivery_charge_per_tonne, 0))) * 1.10) as total,
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
    const reportDockets = docketsResult.rows;

    console.log(`✅ Query returned ${reportDockets.length} dockets for email`);

    if (reportDockets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No dockets found for the selected criteria",
      });
    }

    // Generate ZIP in memory (don't stream to response)
    console.log("📦 Generating ZIP file in memory...");

    const archiveBuffers = [];
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    // Collect archive data
    archive.on("data", (chunk) => archiveBuffers.push(chunk));
    archive.on("error", (err) => {
      throw err;
    });

    // 1. Generate and add Account Detail Report PDF
    console.log("📄 Generating Account Detail Report PDF...");
    const reportPDF = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 50,
    });

    const reportBuffer = [];
    reportPDF.on("data", (chunk) => reportBuffer.push(chunk));

    generateAccountDetailPDF(reportPDF, reportDockets, dateFrom, dateTo);
    reportPDF.end();

    await new Promise((resolve) => reportPDF.on("end", resolve));

    const reportPDFBuffer = Buffer.concat(reportBuffer);
    archive.append(reportPDFBuffer, {
      name: `Account_Detail_Report_${dateFrom}_to_${dateTo}.pdf`,
    });

    console.log("✅ Account Detail Report added to ZIP");

    // 2. Generate and add individual Weighbridge Dockets
    console.log(`📋 Generating ${reportDockets.length} Weighbridge Dockets...`);

    for (let i = 0; i < reportDockets.length; i++) {
      const docket = reportDockets[i];
      console.log(
        `  📄 Generating docket ${i + 1}/${reportDockets.length}: ${
          docket.docket_no
        }`
      );

      // Get full docket data
      const fullDocketQuery = `
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

      const fullDocketResult = await pool.query(fullDocketQuery, [
        docket.docket_no,
      ]);

      if (fullDocketResult.rows.length > 0) {
        const fullDocket = fullDocketResult.rows[0];

        const docketPDF = new PDFDocument({
          size: "A4",
          margin: 50,
        });

        const docketBuffer = [];
        docketPDF.on("data", (chunk) => docketBuffer.push(chunk));

        generateWeighbridgeDocketPDF(docketPDF, fullDocket);
        docketPDF.end();

        await new Promise((resolve) => docketPDF.on("end", resolve));

        const docketPDFBuffer = Buffer.concat(docketBuffer);
        archive.append(docketPDFBuffer, {
          name: `Dockets/Docket_${fullDocket.docket_number}.pdf`,
        });

        console.log(`  ✅ Docket ${fullDocket.docket_number} added to ZIP`);
      }
    }

    console.log("📦 Finalizing ZIP archive...");
    archive.finalize();

    // Wait for archive to finish
    await new Promise((resolve, reject) => {
      archive.on("end", resolve);
      archive.on("error", reject);
    });

    const zipBuffer = Buffer.concat(archiveBuffers);
    console.log(
      `✅ ZIP generated: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`
    );

    // Send email with ZIP attachment
    console.log("📧 Preparing email...");

    const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
    const useSSL = smtpPort === 465;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.office365.com",
      port: smtpPort,
      secure: useSSL,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    // Calculate totals for email
    let totalAmount = 0;
    reportDockets.forEach((docket) => {
      totalAmount += parseFloat(docket.total) || 0;
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || "quarry@rirratjingu.com",
      to: recipientEmail,
      cc: ccEmail || undefined,
      replyTo: process.env.SMTP_FROM || "quarry@rirratjingu.com",
      subject: `Account Detail Report - ${customerName} - ${formatDate(
        dateFrom
      )} to ${formatDate(dateTo)}`,
      text: `Dear ${customerName},

Please find attached your Account Detail Report for the period ${formatDate(
        dateFrom
      )} to ${formatDate(dateTo)}.

This ZIP file contains:
- Complete Account Detail Report (PDF)
- ${reportDockets.length} Individual Weighbridge Delivery Dockets (PDF)

Summary:
- Total Transactions: ${reportDockets.length}
- Total Amount: $${totalAmount.toFixed(2)}

Kind regards,
Rirratjingu Mining Pty Ltd
Melville Rd, Nhulunbuy NT 0881
Ph. 08 8987 3433`,
      html: `<p>Dear <strong>${customerName}</strong>,</p>

<p>Please find attached your Account Detail Report for the period <strong>${formatDate(
        dateFrom
      )} to ${formatDate(dateTo)}</strong>.</p>

<p><strong>This ZIP file contains:</strong></p>
<ul>
  <li>Complete Account Detail Report (PDF)</li>
  <li>${reportDockets.length} Individual Weighbridge Delivery Dockets (PDF)</li>
</ul>

<table style="margin: 20px 0; border-collapse: collapse;">
  <tr>
    <td style="padding: 5px;"><strong>Total Transactions:</strong></td>
    <td style="padding: 5px;">${reportDockets.length}</td>
  </tr>
  <tr>
    <td style="padding: 5px;"><strong>Total Amount:</strong></td>
    <td style="padding: 5px;">$${totalAmount.toFixed(2)}</td>
  </tr>
</table>

<p>Kind regards,<br>
<strong>Rirratjingu Mining Pty Ltd</strong><br>
Melville Rd, Nhulunbuy NT 0881<br>
Ph. 08 8987 3433</p>`,
      attachments: [
        {
          filename: `Account_Detail_Report_${dateFrom}_to_${dateTo}.zip`,
          content: zipBuffer,
          contentType: "application/zip",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    console.log(
      `✅ Email sent successfully to ${recipientEmail}${
        ccEmail ? ` (CC: ${ccEmail})` : ""
      }`
    );

    // Log email sent
    await logAuditEvent({
      user_email: process.env.SMTP_FROM || "quarry@rirratjingu.com",
      action_type: "EMAIL_SENT",
      entity_type: "ACCOUNT_DETAIL_REPORT",
      entity_id: parseInt(customerId),
      description: `Account Detail Report emailed to ${recipientEmail}${
        ccEmail ? ` (CC: ${ccEmail})` : ""
      }`,
      new_values: {
        customer_name: customerName,
        date_range: `${dateFrom} to ${dateTo}`,
        recipient: recipientEmail,
        cc_recipient: ccEmail || null,
        docket_count: reportDockets.length,
        total_amount: totalAmount.toFixed(2),
      },
      ip_address:
        req.headers["x-forwarded-for"] || req.connection.remoteAddress,
      success: true,
    });

    res.json({
      success: true,
      message: "Email sent successfully",
      recipientEmail,
      ccEmail: ccEmail || null,
      docketCount: reportDockets.length,
      sentFrom: process.env.SMTP_FROM || "quarry@rirratjingu.com",
    });
  } catch (error) {
    console.error("❌ ERROR sending email:", error);
    res.status(500).json({
      success: false,
      message: "Error sending email",
      error: error.message,
    });
  }
});

// ============================================
// HELPER FUNCTION: GENERATE WEIGHBRIDGE DOCKET PDF
// IMPROVED VERSION - Matches direct print quality
// ============================================
function generateWeighbridgeDocketPDF(doc, docket) {
  // Company Header
  doc.fontSize(14).text("Rirratjingu Mining Pty Ltd", 50, 50);
  doc.fontSize(9).text("Melville Rd, Nhulunbuy NT 0881", 50, 70);
  doc.text("Ph. 08 8987 3433", 50, 82);
  doc.text("Fax 08 8987 2304", 50, 94);
  doc.text("ABN 15 129 907 660", 50, 106);

  // Logo
  const logoPath = path.join(__dirname, "../../public/RAC_Mining_Logo.png.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 450, 50, { width: 100 });
  }

  // Title Box
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Weighbridge Delivery Docket", 50, 140, {
      align: "center",
      width: 500,
    });

  // Thick line under title
  doc.moveTo(50, 160).lineTo(550, 160).lineWidth(2).stroke();

  // Date/Time and Docket Number
  let yPos = 180;
  doc.fontSize(10).font("Helvetica");

  const movementDate = new Date(docket.movement_date);
  const dateStr = movementDate.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = movementDate.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  doc.text(`Date / Time: ${dateStr} ${timeStr}`, 50, yPos);
  doc.text(`Docket No. ${docket.docket_number}`, 400, yPos);

  // Main Content Section
  yPos += 30;
  const leftCol = 50;
  const rightCol = 300;
  const lineHeight = 22;

  // Customer
  doc.font("Helvetica-Bold").text("Customer:", leftCol, yPos);
  doc.font("Helvetica").text(docket.customer_name || "-", leftCol + 120, yPos);
  yPos += lineHeight;

  // Destination/Job
  doc.font("Helvetica-Bold").text("Destination/Job:", leftCol, yPos);
  doc.font("Helvetica").text(docket.destination || "-", leftCol + 120, yPos);
  yPos += lineHeight + 5;

  // Carrier
  doc.font("Helvetica-Bold").text("Carrier:", leftCol, yPos);
  doc.font("Helvetica").text(docket.carrier_name || "-", leftCol + 120, yPos);
  yPos += lineHeight;

  // Vehicle
  doc.font("Helvetica-Bold").text("Vehicle:", leftCol, yPos);
  doc.font("Helvetica").text(docket.vehicle_rego || "-", leftCol + 120, yPos);
  yPos += lineHeight;

  // Product
  doc.font("Helvetica-Bold").text("Product:", leftCol, yPos);
  doc.font("Helvetica").text(docket.product_name || "-", leftCol + 120, yPos);
  yPos += lineHeight;

  // Stockpile Lot No
  doc.font("Helvetica-Bold").text("Stockpile Lot No:", leftCol, yPos);
  doc.font("Helvetica").text(docket.stockpile_lot || "-", leftCol + 120, yPos);
  yPos += lineHeight;

  // Purchase Order / Job No
  if (docket.po_number) {
    doc.font("Helvetica-Bold").text("Purchase Order | Job :", leftCol, yPos);
    doc.font("Helvetica").text(docket.po_number, leftCol + 120, yPos);
    yPos += lineHeight;
  }

  // Notes
  if (docket.notes) {
    doc.font("Helvetica-Bold").text("Notes:", leftCol, yPos);
    doc.font("Helvetica").text(docket.notes, leftCol + 120, yPos);
    yPos += lineHeight;
  }

  // ============================================
  // WEIGHTS BOX (Right side)
  // ============================================
  const weightsBoxX = 380;
  const weightsBoxY = 230;
  const weightsBoxWidth = 170;
  const weightsBoxHeight = 90;

  // Draw weights box
  doc
    .rect(weightsBoxX, weightsBoxY, weightsBoxWidth, weightsBoxHeight)
    .lineWidth(1)
    .stroke();

  // Weights content
  let weightsY = weightsBoxY + 12;
  doc.fontSize(10).font("Helvetica-Bold");

  // Gross Wt
  doc.text("Gross Wt :", weightsBoxX + 10, weightsY);
  doc
    .font("Helvetica")
    .text(
      `${parseFloat(docket.gross_weight || 0).toFixed(2)} t`,
      weightsBoxX + 85,
      weightsY
    );
  weightsY += 20;

  // Tare Wt
  doc.font("Helvetica-Bold").text("Tare Wt :", weightsBoxX + 10, weightsY);
  doc
    .font("Helvetica")
    .text(
      `${parseFloat(docket.tare_weight || 0).toFixed(2)} t`,
      weightsBoxX + 85,
      weightsY
    );
  weightsY += 20;

  // Horizontal line before Net Wt
  doc
    .moveTo(weightsBoxX + 5, weightsY - 5)
    .lineTo(weightsBoxX + weightsBoxWidth - 5, weightsY - 5)
    .lineWidth(1)
    .stroke();

  // Net Wt (bold and larger)
  doc.fontSize(11).font("Helvetica-Bold");
  doc.text("Net Wt :", weightsBoxX + 10, weightsY);
  doc.text(
    `${parseFloat(docket.net_weight || 0).toFixed(2)} t`,
    weightsBoxX + 85,
    weightsY
  );

  // ============================================
  // PRICES BOX (Right side, below weights)
  // ============================================
  const pricesBoxY = weightsBoxY + weightsBoxHeight + 20;
  const pricesBoxHeight = 90;

  // Draw prices box
  doc
    .rect(weightsBoxX, pricesBoxY, weightsBoxWidth, pricesBoxHeight)
    .lineWidth(1)
    .stroke();

  // Prices content
  let pricesY = pricesBoxY + 12;
  doc.fontSize(10).font("Helvetica-Bold");

  const docketFee = parseFloat(docket.docket_fee || 0);
  const docketGST = parseFloat(docket.docket_gst || 0);
  const docketTotal = parseFloat(docket.docket_total || 0);

  // Docket Fee
  doc.text("Docket Fee $", weightsBoxX + 10, pricesY);
  doc
    .font("Helvetica")
    .text(`$${docketFee.toFixed(2)}`, weightsBoxX + 100, pricesY);
  pricesY += 20;

  // Docket GST
  doc.font("Helvetica-Bold").text("Docket GST $", weightsBoxX + 10, pricesY);
  doc
    .font("Helvetica")
    .text(`$${docketGST.toFixed(2)}`, weightsBoxX + 100, pricesY);
  pricesY += 20;

  // Horizontal line before Total
  doc
    .moveTo(weightsBoxX + 5, pricesY - 5)
    .lineTo(weightsBoxX + weightsBoxWidth - 5, pricesY - 5)
    .lineWidth(1)
    .stroke();

  // Docket Total (bold and larger)
  doc.fontSize(11).font("Helvetica-Bold");
  doc.text("Docket Total $", weightsBoxX + 10, pricesY);
  doc.text(`$${docketTotal.toFixed(2)}`, weightsBoxX + 100, pricesY);

  // ============================================
  // SIGNATURE SECTIONS (Bottom)
  // ============================================
  const signaturesY = 620;
  const signaturesLineLength = 200;

  doc.fontSize(10).font("Helvetica-Bold");

  // Receivers section (left)
  doc.text("Receivers Name :", leftCol, signaturesY);
  // Line for receivers name
  doc
    .moveTo(leftCol, signaturesY + 35)
    .lineTo(leftCol + signaturesLineLength, signaturesY + 35)
    .lineWidth(1)
    .stroke();

  doc.text("Receivers Signature :", leftCol, signaturesY + 50);
  // Line for receivers signature
  doc
    .moveTo(leftCol, signaturesY + 85)
    .lineTo(leftCol + signaturesLineLength, signaturesY + 85)
    .lineWidth(1)
    .stroke();

  // Drivers section (right)
  doc.text("Drivers Name :", rightCol + 50, signaturesY);
  // Driver name filled in
  doc
    .font("Helvetica")
    .text(docket.driver_name || "", rightCol + 50, signaturesY + 20);
  // Line for drivers name
  doc
    .moveTo(rightCol + 50, signaturesY + 35)
    .lineTo(rightCol + 50 + signaturesLineLength, signaturesY + 35)
    .lineWidth(1)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .text("Drivers Signature :", rightCol + 50, signaturesY + 50);
  // Line for drivers signature
  doc
    .moveTo(rightCol + 50, signaturesY + 85)
    .lineTo(rightCol + 50 + signaturesLineLength, signaturesY + 85)
    .lineWidth(1)
    .stroke();

  // ============================================
  // BOTTOM SEPARATOR LINE
  // ============================================
  doc
    .moveTo(50, signaturesY - 20)
    .lineTo(550, signaturesY - 20)
    .lineWidth(2)
    .stroke();
}

// ============================================
// HELPER FUNCTIONS - DATE FORMATTING
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

// ============================================
// HELPER FUNCTION: GENERATE ACCOUNT DETAIL REPORT PDF
// ============================================
function generateAccountDetailPDF(doc, dockets, dateFrom, dateTo) {
  // Add company header
  doc.fontSize(18).text("Rirratjingu Mining Pty Ltd", 50, 50);
  doc.fontSize(10).text("Melville Rd, Nhulunbuy NT 0881", 50, 75);
  doc.text("Ph. 08 8987 3433", 50, 90);
  doc.text("ABN 15 129 907 660", 50, 105);

  // Add logo (if exists)
  const logoPath = path.join(__dirname, "../../public/RAC_Mining_Logo.png.png");
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
      `Completed Dockets for: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`,
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
    { text: "Date", x: 135, width: 90 },
    { text: "Docket #", x: 230, width: 50 },
    { text: "Rego", x: 285, width: 50 },
    { text: "Product", x: 340, width: 100 },
    { text: "Destination", x: 445, width: 80 },
    { text: "Net Wt", x: 530, width: 45 },
    { text: "Fee", x: 580, width: 50 },
    { text: "GST", x: 635, width: 45 },
    { text: "Total", x: 685, width: 50 },
  ];

  // Print headers
  headers.forEach((header) => {
    doc.text(header.text, header.x, yPos, { width: header.width });
  });

  yPos += 25;
  // Draw line under headers
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
    doc.text(formatDateShort(docket.movement_date), 135, yPos, { width: 90 });
    doc.text(docket.docket_no || "-", 230, yPos, { width: 50 });
    doc.text(docket.rego || "-", 285, yPos, { width: 50 });
    doc.text(docket.product_name || "-", 340, yPos, { width: 100 });
    doc.text(docket.destination || "-", 445, yPos, { width: 80 });
    doc.text(`${netWt.toFixed(2)} t`, 530, yPos, { width: 45 });
    doc.text(`$${fee.toFixed(2)}`, 580, yPos, { width: 50 });
    doc.text(`$${gst.toFixed(2)}`, 635, yPos, { width: 45 });
    doc.text(`$${total.toFixed(2)}`, 685, yPos, { width: 50 });

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
  doc.text(`${totalNetWt.toFixed(1)} t`, 530, yPos, { width: 45 });
  doc.text(`$${totalFee.toFixed(2)}`, 580, yPos, { width: 50 });
  doc.text(`$${totalGST.toFixed(2)}`, 635, yPos, { width: 45 });
  doc.text(`$${totalAmount.toFixed(2)}`, 685, yPos, { width: 50 });

  yPos += 15;
  doc.moveTo(50, yPos).lineTo(750, yPos).stroke();
}

module.exports = router;
