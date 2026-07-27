// ============================================
// RECONCILIATION DAILY ALERT
// Runs the stock reconciliation once a day, records the row (via recordSnapshot),
// and emails the result to the quarry mailbox.
//   Subject: "BALANCED ✓"  or  "⚠ ALERT — OUT OF BALANCE"
// Reuses the same Office365 SMTP sender as the weighbridge docket emailer.
// ============================================

const express = require("express");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const { query } = require("../config/database");

const router = express.Router();

// ---- config (all overridable via Railway env vars) ----
const ALERT_TO = process.env.RECON_ALERT_TO || "quarry@rirratjingu.com";
const ALERT_CC = process.env.RECON_ALERT_CC || "it@rirratjingu.com";
const CRON_SPEC = process.env.RECON_CRON || "0 7 * * *"; // 7:00 each day
const CRON_TZ = process.env.RECON_TZ || "Australia/Darwin";
const APP_URL =
  process.env.APP_BASE_URL || "https://rac-inventory-production.up.railway.app";
const REPORT_PATH = "/pages/stock-reconciliation.html";

// ---- helpers ----
function buildTransporter() {
  const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

// How many consecutive days (ending today) have been out of balance, and since when.
async function daysOutOfBalance() {
  const r = await query(
    `SELECT run_date, balanced FROM reconciliation_log ORDER BY run_date DESC LIMIT 7`
  );
  let days = 0;
  let since = null;
  for (const row of r.rows) {
    if (row.balanced === false || row.balanced === "f") {
      days += 1;
      since = row.run_date;
    } else break;
  }
  return { days, since };
}

const fmt = (n) =>
  Number(n).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function exceptionsTableHtml(exceptions) {
  const rows = exceptions
    .map(
      (e) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${e.product_name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">SP ${e.stockpile}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(e.soh)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(e.ledger)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;font-weight:600">${e.gap > 0 ? "+" : ""}${fmt(e.gap)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${e.negative ? "NEG" : ""}</td>
      </tr>`
    )
    .join("");
  return `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:10px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:6px 10px;text-align:left">Product</th>
          <th style="padding:6px 10px;text-align:left">Stockpile</th>
          <th style="padding:6px 10px;text-align:right">SOH (t)</th>
          <th style="padding:6px 10px;text-align:right">Ledger (t)</th>
          <th style="padding:6px 10px;text-align:right">Gap (t)</th>
          <th style="padding:6px 10px;text-align:center">Flag</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function sendReconciliationEmail(data) {
  const dateStr = new Date().toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const s = data.summary;

  let subject, headline, colour, detailHtml, detailText;

  if (data.balanced) {
    subject = `RAC Stock Sync — BALANCED ✓ (${dateStr})`;
    headline = "✓ Stock Balanced";
    colour = "#16a34a";
    detailHtml = `<p>All ${s.lines_checked} product/location lines reconcile — Current Stock matches the movement ledger.</p>`;
    detailText = `BALANCED. All ${s.lines_checked} lines reconcile.`;
  } else {
    const { days, since } = await daysOutOfBalance();
    const sinceStr = since
      ? new Date(since).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
      : dateStr;
    const persist =
      days > 1
        ? `<p style="color:#b91c1c"><strong>Out of balance for ${days} consecutive days</strong> (since ${sinceStr}).</p>`
        : "";
    subject = `RAC Stock Sync — ⚠ ALERT: OUT OF BALANCE — ${s.out_of_sync} line${s.out_of_sync === 1 ? "" : "s"} (${dateStr})`;
    headline = "⚠ Out of Balance";
    colour = "#dc2626";
    detailHtml =
      `<p>${s.out_of_sync} line(s) out of sync${s.negatives ? `, ${s.negatives} negative` : ""} — tolerance ±0.5 t.</p>` +
      persist +
      exceptionsTableHtml(data.exceptions);
    detailText =
      `OUT OF BALANCE. ${s.out_of_sync} line(s) out of sync${s.negatives ? `, ${s.negatives} negative` : ""}.` +
      (days > 1 ? ` Out of balance for ${days} consecutive days (since ${sinceStr}).` : "") +
      "\n\n" +
      data.exceptions
        .map((e) => `  ${e.product_name} @ SP${e.stockpile}: SOH ${fmt(e.soh)}  Ledger ${fmt(e.ledger)}  Gap ${e.gap > 0 ? "+" : ""}${fmt(e.gap)}`)
        .join("\n");
  }

  const reportUrl = APP_URL + REPORT_PATH;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px">
      <div style="background:${colour};color:#fff;padding:16px 20px;border-radius:8px">
        <h2 style="margin:0">${headline}</h2>
        <p style="margin:4px 0 0;opacity:.9;font-size:13px">RAC Inventory — Stock Reconciliation · ${dateStr}</p>
      </div>
      <div style="padding:16px 4px">
        ${detailHtml}
        <p style="margin-top:16px"><a href="${reportUrl}" style="color:#1565c0">Open the Stock Reconciliation report &rarr;</a></p>
        <p style="color:#888;font-size:12px;margin-top:18px">
          Automated daily check. SOH vs movement ledger (excludes DEMAND/EDIT/CANCEL), tolerance ±0.5 t.
        </p>
      </div>
    </div>`;

  const text = `RAC Inventory — Stock Reconciliation (${dateStr})\n\n${detailText}\n\nReport: ${reportUrl}`;

  await buildTransporter().sendMail({
    from: process.env.SMTP_FROM || "quarry@rirratjingu.com",
    to: ALERT_TO,
    cc: ALERT_CC || undefined,
    subject,
    text,
    html,
  });

  console.log(`✉️  Reconciliation alert sent to ${ALERT_TO} (cc ${ALERT_CC}) — ${data.balanced ? "BALANCED" : "OUT OF BALANCE"}`);
  return { subject };
}

// Run the daily job: record the snapshot, then email the result.
async function runDailyReconciliation() {
  const { recordSnapshot } = require("../routes/reconciliation"); // lazy — avoids load-order issues
  const data = await recordSnapshot(0.5);
  await sendReconciliationEmail(data);
  return data;
}

// Start the scheduled daily tick (called once at server boot).
function startScheduler() {
  cron.schedule(
    CRON_SPEC,
    () => {
      runDailyReconciliation().catch((e) =>
        console.error("Daily reconciliation job failed:", e)
      );
    },
    { timezone: CRON_TZ }
  );
  console.log(`🗓️  Reconciliation alert scheduled: "${CRON_SPEC}" (${CRON_TZ}) → ${ALERT_TO}`);
}

// Manual trigger for testing: POST /api/reconciliation/email-now
router.post("/email-now", async (req, res) => {
  try {
    const data = await runDailyReconciliation();
    res.json({
      sent: true,
      balanced: data.balanced,
      out_of_sync: data.summary.out_of_sync,
      to: ALERT_TO,
      cc: ALERT_CC,
    });
  } catch (error) {
    console.error("email-now failed:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, startScheduler, runDailyReconciliation, sendReconciliationEmail };