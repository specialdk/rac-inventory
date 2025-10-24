// ============================================
// BACKEND API ENDPOINT FOR ACCOUNT DETAIL REPORT
// Add this to your existing server.js or API routes
// ============================================

const express = require("express");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// ============================================
// GET ACCOUNT DETAIL REPORT DATA
// ============================================
router.get("/reports/account-detail", async (req, res) => {
  try {
    const { dateFrom, dateTo, customerId, productId } = req.query;

    // Build SQL query with filters
    let query = `
            SELECT 
                sm.movement_id,
                sm.movement_date,
                sm.reference_no as docket_no,
                sm.quantity as net_weight,
                sm.unit_cost,
                sm.total_cost as fee,
                sm.gst_amount as gst,
                (sm.total_cost + sm.gst_amount) as total,
                c.customer_name,
                p.product_name
            FROM stock_movements sm
            LEFT JOIN customers c ON sm.customer_id = c.customer_id
            LEFT JOIN products p ON sm.product_id = p.product_id
            WHERE sm.movement_type = 'Sale'
                AND sm.movement_date BETWEEN ? AND ?
        `;

    const params = [dateFrom, dateTo];

    if (customerId) {
      query += " AND sm.customer_id = ?";
      params.push(customerId);
    }

    if (productId) {
      query += " AND sm.product_id = ?";
      params.push(productId);
    }

    query += " ORDER BY sm.movement_date ASC, sm.reference_no ASC";

    // Execute query (adjust based on your database connection)
    const dockets = await db.query(query, params);

    // Get customer name for report header if filtered
    let accountName = "All Accounts";
    if (customerId) {
      const customer = await db.query(
        "SELECT customer_name FROM customers WHERE customer_id = ?",
        [customerId]
      );
      accountName = customer[0]?.customer_name || "Unknown Customer";
    }

    res.json({
      success: true,
      accountName,
      dateFrom,
      dateTo,
      dockets,
    });
  } catch (error) {
    console.error("Error fetching account detail report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating report",
      error: error.message,
    });
  }
});

// ============================================
// EMAIL ACCOUNT DETAIL REPORT
// ============================================
router.post("/reports/account-detail/email", async (req, res) => {
  try {
    const { dateFrom, dateTo, customerId, productId, email } = req.query;

    // Fetch report data (reuse the query from above)
    const dataResponse = await fetch(
      `${req.protocol}://${req.get("host")}/api/reports/account-detail?` +
        new URLSearchParams({ dateFrom, dateTo, customerId, productId })
    );
    const reportData = await dataResponse.json();

    if (!reportData.success || reportData.dockets.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data available for the selected period",
      });
    }

    // Generate PDF
    const pdfPath = await generateAccountDetailPDF(reportData);

    // Send email
    await sendEmailWithAttachment(email, pdfPath, reportData);

    // Clean up PDF file
    fs.unlinkSync(pdfPath);

    res.json({
      success: true,
      message: "Report sent successfully",
    });
  } catch (error) {
    console.error("Error emailing report:", error);
    res.status(500).json({
      success: false,
      message: "Error sending email",
      error: error.message,
    });
  }
});

// ============================================
// GENERATE PDF FUNCTION
// ============================================
async function generateAccountDetailPDF(reportData) {
  return new Promise((resolve, reject) => {
    const fileName = `account-detail-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, "temp", fileName);

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Company Header
    doc.fontSize(18).text("Rirratjingu Mining Pty Ltd", { align: "left" });
    doc
      .fontSize(10)
      .text("Melville Rd, Nhulunbuy NT 0881")
      .text("Ph. 08 8987 3433")
      .text("Fax 08 8987 2304")
      .text("ABN 15 129 907 660")
      .moveDown();

    // Report Title
    doc
      .fontSize(16)
      .fillColor("#000000")
      .text("Account Detail Report", { align: "center" })
      .moveDown();

    // Report Metadata
    doc
      .fontSize(10)
      .text(`Account: ${reportData.accountName}`, { align: "left" })
      .text(`Date: ${new Date().toLocaleDateString("en-AU")}`, {
        align: "right",
      })
      .text(
        `Period: ${formatDate(reportData.dateFrom)} to ${formatDate(
          reportData.dateTo
        )}`
      )
      .moveDown();

    // Table Header
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 100;
    const col3 = 150;
    const col4 = 250;
    const col5 = 350;
    const col6 = 400;
    const col7 = 450;
    const col8 = 500;

    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Date", col1, tableTop);
    doc.text("Docket", col2, tableTop);
    doc.text("Customer", col3, tableTop);
    doc.text("Product", col4, tableTop);
    doc.text("Net Wt", col5, tableTop);
    doc.text("Fee", col6, tableTop);
    doc.text("GST", col7, tableTop);
    doc.text("Total", col8, tableTop);

    // Draw line under header
    doc
      .moveTo(col1, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Table Data
    let y = tableTop + 25;
    let totalNetWt = 0;
    let totalFee = 0;
    let totalGST = 0;
    let totalAmount = 0;

    doc.font("Helvetica").fontSize(8);

    reportData.dockets.forEach((docket) => {
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      const netWt = parseFloat(docket.net_weight) || 0;
      const fee = parseFloat(docket.fee) || 0;
      const gst = parseFloat(docket.gst) || 0;
      const total = parseFloat(docket.total) || 0;

      doc.text(formatDate(docket.movement_date), col1, y);
      doc.text(docket.docket_no, col2, y);
      doc.text(docket.customer_name.substring(0, 15), col3, y);
      doc.text(docket.product_name.substring(0, 15), col4, y);
      doc.text(`${netWt.toFixed(2)} t`, col5, y);
      doc.text(`$${fee.toFixed(2)}`, col6, y);
      doc.text(`$${gst.toFixed(2)}`, col7, y);
      doc.text(`$${total.toFixed(2)}`, col8, y);

      totalNetWt += netWt;
      totalFee += fee;
      totalGST += gst;
      totalAmount += total;

      y += 20;
    });

    // Totals Section
    y += 20;
    doc.moveTo(col1, y).lineTo(550, y).stroke();

    y += 15;
    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Total Net Weight:", col4, y);
    doc.text(`${totalNetWt.toFixed(2)} t`, col5, y);

    y += 15;
    doc.text("Total Fee:", col4, y);
    doc.text(`$${totalFee.toFixed(2)}`, col6, y);

    y += 15;
    doc.text("Total GST:", col4, y);
    doc.text(`$${totalGST.toFixed(2)}`, col7, y);

    y += 15;
    doc.fontSize(12);
    doc.text("Grand Total:", col4, y);
    doc.text(`$${totalAmount.toFixed(2)}`, col8, y);

    doc.end();

    stream.on("finish", () => {
      resolve(filePath);
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}

// ============================================
// SEND EMAIL FUNCTION
// ============================================
async function sendEmailWithAttachment(toEmail, pdfPath, reportData) {
  // Configure your email transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || "noreply@rirratjingu.com.au",
    to: toEmail,
    subject: `Account Detail Report - ${formatDate(
      reportData.dateFrom
    )} to ${formatDate(reportData.dateTo)}`,
    html: `
            <h2>Account Detail Report</h2>
            <p><strong>Account:</strong> ${reportData.accountName}</p>
            <p><strong>Period:</strong> ${formatDate(
              reportData.dateFrom
            )} to ${formatDate(reportData.dateTo)}</p>
            <p><strong>Total Dockets:</strong> ${reportData.dockets.length}</p>
            <p>Please find the detailed report attached.</p>
            <br>
            <p>Best regards,<br>Rirratjingu Mining Pty Ltd</p>
        `,
    attachments: [
      {
        filename: `Account-Detail-Report-${reportData.dateFrom}-to-${reportData.dateTo}.pdf`,
        path: pdfPath,
      },
    ],
  };

  return transporter.sendMail(mailOptions);
}

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

module.exports = router;

// ============================================
// USAGE IN YOUR MAIN SERVER FILE
// ============================================
/*
const accountDetailRoutes = require('./routes/account-detail-report');
app.use('/api', accountDetailRoutes);
*/

// ============================================
// ENVIRONMENT VARIABLES NEEDED (.env file)
// ============================================
/*
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@rirratjingu.com.au
*/

// ============================================
// REQUIRED NPM PACKAGES
// ============================================
/*
npm install express nodemailer pdfkit
*/
