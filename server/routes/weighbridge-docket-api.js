// ============================================
// WEIGHBRIDGE DELIVERY DOCKET API
// NO LOGIN REQUIRED - Uses backend credentials
// All emails from quarry@rirratjingu.com
// ============================================

const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const { logAuditEvent } = require("./audit-log");

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
        sm.is_cancelled,
        sm.cancelled_at,
        sm.cancelled_by,
        sm.cancel_reason,
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

// ============================================
// EMAIL WEIGHBRIDGE DOCKET
// NO LOGIN REQUIRED - Uses backend credentials
// ============================================
router.post("/dockets/:docketNumber/email", async (req, res) => {
  console.log("📧 Email Weighbridge Docket API Called");
  console.log("📝 Docket Number:", req.params.docketNumber);

  try {
    const { docketNumber } = req.params;
    const { recipientEmail, sentBy } = req.body; // sentBy is optional operator name

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: "Recipient email is required",
      });
    }

    // Get complete docket data
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
        sm.is_cancelled,
        c.customer_name,
        v.registration as vehicle_rego,
        p.product_name,
        p.product_code,
        l.location_code as stockpile_lot,
        d.driver_name,
        del.delivery_name as destination,
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

    const result = await pool.query(query, [docketNumber]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Docket not found",
      });
    }

    const docket = result.rows[0];

    // Don't email cancelled dockets
    if (docket.is_cancelled) {
      return res.status(400).json({
        success: false,
        message: "Cannot email cancelled docket",
      });
    }

    console.log("✅ Docket data retrieved, generating PDF...");

    // Generate PDF
    const pdfDoc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    const pdfBuffers = [];
    pdfDoc.on("data", (chunk) => pdfBuffers.push(chunk));

    // Generate PDF content
    generateWeighbridgeDocketPDF(pdfDoc, docket);
    pdfDoc.end();

    // Wait for PDF to finish
    await new Promise((resolve) => pdfDoc.on("end", resolve));
    const pdfBuffer = Buffer.concat(pdfBuffers);

    console.log("✅ PDF generated, sending email...");

    // Format date for email
    const movementDate = new Date(docket.movement_date);
    const dateStr = movementDate.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    // ============================================
    // EMAIL CONFIGURATION - BACKEND CREDENTIALS
    // Automatically use SSL for port 465, TLS for 587
    // ============================================
    const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
    const useSSL = smtpPort === 465;

    console.log(`🔧 SMTP Configuration:`);
    console.log(`   Host: ${process.env.SMTP_HOST || "smtp.office365.com"}`);
    console.log(`   Port: ${smtpPort}`);
    console.log(`   SSL: ${useSSL}`);
    console.log(`   User: ${process.env.SMTP_USER}`);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.office365.com",
      port: smtpPort,
      secure: useSSL, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    console.log(
      `📧 Sending email from: ${process.env.SMTP_FROM || process.env.SMTP_USER}`
    );
    if (sentBy) {
      console.log(`👤 Sent by operator: ${sentBy}`);
    }

    // Email content
    const mailOptions = {
      from: process.env.SMTP_FROM || "quarry@rirratjingu.com",
      to: recipientEmail,
      replyTo: process.env.SMTP_FROM || "quarry@rirratjingu.com",
      subject: `Weighbridge Delivery Docket #${docketNumber} - ${dateStr}`,
      text: `Dear Customer,

Please find attached Weighbridge Delivery Docket #${docketNumber} dated ${dateStr}.

Net Weight: ${parseFloat(docket.net_weight).toFixed(2)} tonnes
Product: ${docket.product_name}
Total Amount: $${parseFloat(docket.docket_total).toFixed(2)}

Kind regards,
Rirratjingu Mining Pty Ltd
Melville Rd, Nhulunbuy NT 0881
Ph. 08 8987 3433`,
      html: `<p>Dear Customer,</p>

<p>Please find attached Weighbridge Delivery Docket #<strong>${docketNumber}</strong> dated <strong>${dateStr}</strong>.</p>

<table style="margin: 20px 0; border-collapse: collapse;">
  <tr>
    <td style="padding: 5px;"><strong>Net Weight:</strong></td>
    <td style="padding: 5px;">${parseFloat(docket.net_weight).toFixed(
      2
    )} tonnes</td>
  </tr>
  <tr>
    <td style="padding: 5px;"><strong>Product:</strong></td>
    <td style="padding: 5px;">${docket.product_name}</td>
  </tr>
  <tr>
    <td style="padding: 5px;"><strong>Total Amount:</strong></td>
    <td style="padding: 5px;">$${parseFloat(docket.docket_total).toFixed(
      2
    )}</td>
  </tr>
</table>

<p>Kind regards,<br>
<strong>Rirratjingu Mining Pty Ltd</strong><br>
Melville Rd, Nhulunbuy NT 0881<br>
Ph. 08 8987 3433</p>`,
      attachments: [
        {
          filename: `Weighbridge_Docket_${docketNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent successfully to ${recipientEmail}`);

    // Log email sent (optional tracking of who sent it)
    await logAuditEvent({
      user_email: sentBy || "quarry@rirratjingu.com",
      action_type: "EMAIL_SENT",
      entity_type: "DOCKET",
      entity_id: parseInt(docketNumber.replace(/[^\d]/g, "")),
      description: `Weighbridge Docket emailed to ${recipientEmail}${
        sentBy ? ` by ${sentBy}` : ""
      }`,
      new_values: {
        docket_number: docketNumber,
        recipient: recipientEmail,
        sent_from: process.env.SMTP_FROM,
        sent_by: sentBy || "System",
        net_weight: parseFloat(docket.net_weight).toFixed(2),
        total_amount: parseFloat(docket.docket_total).toFixed(2),
      },
      ip_address:
        req.headers["x-forwarded-for"] || req.connection.remoteAddress,
      success: true,
    });

    res.json({
      success: true,
      message: "Email sent successfully",
      recipientEmail,
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
  doc.font("Helvetica").text(docket.customer_name || "-", leftCol + 100, yPos);

  // Vehicle Rego
  doc.font("Helvetica-Bold").text("Vehicle Rego:", rightCol, yPos);
  doc.font("Helvetica").text(docket.vehicle_rego || "-", rightCol + 100, yPos);
  yPos += lineHeight;

  // Product
  doc.font("Helvetica-Bold").text("Product:", leftCol, yPos);
  doc.font("Helvetica").text(docket.product_name || "-", leftCol + 100, yPos);

  // Stockpile Lot
  doc.font("Helvetica-Bold").text("Stockpile Lot:", rightCol, yPos);
  doc.font("Helvetica").text(docket.stockpile_lot || "-", rightCol + 100, yPos);
  yPos += lineHeight;

  // Gross Weight
  doc.font("Helvetica-Bold").text("Gross Weight:", leftCol, yPos);
  doc
    .font("Helvetica")
    .text(
      `${parseFloat(docket.gross_weight || 0).toFixed(2)} tonnes`,
      leftCol + 100,
      yPos
    );

  // Driver
  doc.font("Helvetica-Bold").text("Driver:", rightCol, yPos);
  doc.font("Helvetica").text(docket.driver_name || "-", rightCol + 100, yPos);
  yPos += lineHeight;

  // Tare Weight
  doc.font("Helvetica-Bold").text("Tare Weight:", leftCol, yPos);
  doc
    .font("Helvetica")
    .text(
      `${parseFloat(docket.tare_weight || 0).toFixed(2)} tonnes`,
      leftCol + 100,
      yPos
    );

  // Destination
  doc.font("Helvetica-Bold").text("Destination:", rightCol, yPos);
  doc.font("Helvetica").text(docket.destination || "-", rightCol + 100, yPos);
  yPos += lineHeight;

  // Net Weight (highlighted)
  doc.fontSize(11).font("Helvetica-Bold").text("Net Weight:", leftCol, yPos);
  doc
    .font("Helvetica-Bold")
    .text(
      `${parseFloat(docket.net_weight || 0).toFixed(2)} tonnes`,
      leftCol + 100,
      yPos
    );
  yPos += lineHeight + 10;

  // Financial Section
  doc.fontSize(10).font("Helvetica");

  // PO Number
  if (docket.po_number) {
    doc.font("Helvetica-Bold").text("PO Number:", leftCol, yPos);
    doc.font("Helvetica").text(docket.po_number, leftCol + 100, yPos);
    yPos += lineHeight;
  }

  // Price breakdown
  const docketFee = parseFloat(docket.docket_fee || 0);
  const docketGST = parseFloat(docket.docket_gst || 0);
  const docketTotal = parseFloat(docket.docket_total || 0);

  doc.font("Helvetica-Bold").text("Fee (ex GST):", leftCol, yPos);
  doc.font("Helvetica").text(`$${docketFee.toFixed(2)}`, leftCol + 100, yPos);
  yPos += lineHeight;

  doc.font("Helvetica-Bold").text("GST:", leftCol, yPos);
  doc.font("Helvetica").text(`$${docketGST.toFixed(2)}`, leftCol + 100, yPos);
  yPos += lineHeight;

  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .text("Total (inc GST):", leftCol, yPos);
  doc
    .font("Helvetica-Bold")
    .text(`$${docketTotal.toFixed(2)}`, leftCol + 100, yPos);
  yPos += lineHeight + 10;

  // Notes section
  if (docket.notes) {
    doc.fontSize(9).font("Helvetica-Bold").text("Notes:", leftCol, yPos);
    yPos += 15;
    doc.font("Helvetica").text(docket.notes, leftCol, yPos, { width: 500 });
    yPos += 30;
  }

  // Footer
  yPos = 700;
  doc
    .fontSize(8)
    .font("Helvetica")
    .text(
      "This docket represents the official record of the transaction.",
      50,
      yPos,
      { align: "center", width: 500 }
    );
}

module.exports = router;
