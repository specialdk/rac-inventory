#!/usr/bin/env node
// ============================================================
// RAC Inventory MCP Server  (READ-ONLY)
// ------------------------------------------------------------
// Exposes Sales & Production data from the RAC Inventory
// PostgreSQL database (Railway) to Claude as MCP "tools".
//
// It ONLY ever runs SELECT queries. It cannot change your data.
//
// It reuses the DATABASE_URL from the main project's .env file
// (the one your Express app already uses), so there are no
// extra passwords to manage.
//
// Run a quick connection test any time with:
//     node rac-inventory-mcp.js --test
// ============================================================

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const { Pool } = pg;

// ------------------------------------------------------------
// Load the SAME .env the main app uses (it lives one folder up)
// ------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL not found. Make sure ../.env exists and contains DATABASE_URL."
  );
  process.exit(1);
}

// Railway (and most cloud Postgres) require SSL. Local dev does not.
const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
function round(n, dp = 2) {
  if (n === null || n === undefined) return n;
  const v = Number(n);
  if (Number.isNaN(v)) return n;
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

// Work out the current financial year number (FY26 = Jul 2025 - Jun 2026)
function currentFyNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const fyFullYear = m >= 7 ? y + 1 : y; // Jul onwards belongs to next FY
  return fyFullYear - 2000; // e.g. 2026 -> 26
}

function fyToDates(fyNum, q) {
  const startYear = 2000 + fyNum - 1; // FY26 -> starts 2025
  const endYear = 2000 + fyNum; //        FY26 -> ends   2026
  if (!q) return { from: `${startYear}-07-01`, to: `${endYear}-06-30` };
  const quarters = {
    1: [`${startYear}-07-01`, `${startYear}-09-30`], // Jul-Sep
    2: [`${startYear}-10-01`, `${startYear}-12-31`], // Oct-Dec
    3: [`${endYear}-01-01`, `${endYear}-03-31`], //     Jan-Mar
    4: [`${endYear}-04-01`, `${endYear}-06-30`], //     Apr-Jun
  };
  const [from, to] = quarters[q];
  return { from, to };
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Turn a friendly "period" string into a { from, to } date range.
// Supports: FY26, FY26-Q3, Q3 (current FY), THIS-MONTH, LAST-MONTH,
// THIS-WEEK, TODAY, YESTERDAY, THIS-FY, LAST-FY, YTD (calendar year).
function resolvePeriod(period) {
  if (!period) return null;
  const p = String(period).trim().toUpperCase();

  let m = p.match(/^FY(\d{2})(?:[-\s]?Q([1-4]))?$/);
  if (m) return fyToDates(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : null);

  m = p.match(/^Q([1-4])$/);
  if (m) return fyToDates(currentFyNumber(), parseInt(m[1], 10));

  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth(); // 0-11

  switch (p) {
    case "TODAY":
      return { from: iso(now), to: iso(now) };
    case "YESTERDAY": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { from: iso(d), to: iso(d) };
    }
    case "THIS-WEEK": {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // Monday = 0
      d.setDate(d.getDate() - day);
      return { from: iso(d), to: iso(now) };
    }
    case "THIS-MONTH":
      return { from: iso(new Date(y, mo, 1)), to: iso(new Date(y, mo + 1, 0)) };
    case "LAST-MONTH":
      return {
        from: iso(new Date(y, mo - 1, 1)),
        to: iso(new Date(y, mo, 0)),
      };
    case "THIS-FY":
      return fyToDates(currentFyNumber(), null);
    case "LAST-FY":
      return fyToDates(currentFyNumber() - 1, null);
    case "YTD":
      return { from: `${y}-01-01`, to: iso(now) };
    default:
      return null; // unknown -> ignored (falls back to explicit dates or all-time)
  }
}

// Resolve the effective { from, to } from period + explicit overrides.
function effectiveRange(args) {
  let from = null;
  let to = null;
  if (args.period) {
    const r = resolvePeriod(args.period);
    if (r) {
      from = r.from;
      to = r.to;
    }
  }
  if (args.date_from) from = args.date_from;
  if (args.date_to) to = args.date_to;
  return { from, to };
}

// Build shared WHERE clause for movement queries.
function movementFilters(args, movementType) {
  const conds = [];
  const params = [];
  conds.push(`sm.movement_type = $${params.length + 1}`);
  params.push(movementType);

  const { from, to } = effectiveRange(args);
  if (from) {
    conds.push(`sm.movement_date >= $${params.length + 1}`);
    params.push(from);
  }
  if (to) {
    conds.push(`sm.movement_date <= $${params.length + 1}`);
    params.push(to);
  }
  if (args.product) {
    conds.push(
      `(p.product_code ILIKE $${params.length + 1} OR p.product_name ILIKE $${
        params.length + 1
      })`
    );
    params.push(`%${args.product}%`);
  }
  if (args.family) {
    conds.push(`p.family_group ILIKE $${params.length + 1}`);
    params.push(`%${args.family}%`);
  }
  if (args.customer) {
    conds.push(`c.customer_name ILIKE $${params.length + 1}`);
    params.push(`%${args.customer}%`);
  }
  return { where: conds.join(" AND "), params, from, to };
}

// Whitelisted "group by" buckets for the summary tools.
const GROUPERS = {
  day: {
    sel: `sm.movement_date::text AS bucket`,
    grp: `sm.movement_date`,
    ord: `sm.movement_date`,
  },
  week: {
    sel: `TO_CHAR(DATE_TRUNC('week', sm.movement_date),'YYYY-MM-DD') AS bucket`,
    grp: `DATE_TRUNC('week', sm.movement_date)`,
    ord: `DATE_TRUNC('week', sm.movement_date)`,
  },
  month: {
    sel: `TO_CHAR(DATE_TRUNC('month', sm.movement_date),'YYYY-MM') AS bucket`,
    grp: `DATE_TRUNC('month', sm.movement_date)`,
    ord: `DATE_TRUNC('month', sm.movement_date)`,
  },
  product: {
    sel: `p.product_code || ' - ' || p.product_name AS bucket`,
    grp: `p.product_code, p.product_name`,
    ord: `p.product_code`,
  },
  family: {
    sel: `p.family_group AS bucket`,
    grp: `p.family_group`,
    ord: `p.family_group`,
  },
  customer: {
    sel: `COALESCE(c.customer_name,'(no customer)') AS bucket`,
    grp: `c.customer_name`,
    ord: `c.customer_name`,
  },
};

// Wrap a result in the MCP "content" shape Claude expects.
function ok(summary, data) {
  const payload = data === undefined ? { summary } : { summary, ...data };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
function fail(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// ------------------------------------------------------------
// Guard for the free-form read-only SQL tool
// ------------------------------------------------------------
function assertReadOnly(sql) {
  let s = String(sql || "").trim();
  s = s.replace(/;+\s*$/, ""); // allow one trailing semicolon
  if (s.includes(";")) {
    throw new Error("Only a single statement is allowed (remove extra ';').");
  }
  if (!/^(select|with)\b/i.test(s)) {
    throw new Error("Only SELECT (or WITH ... SELECT) queries are allowed.");
  }
  if (
    /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge|vacuum|comment)\b/i.test(
      s
    )
  ) {
    throw new Error("Write / DDL keywords are not allowed in this tool.");
  }
  return s;
}

// ============================================================
// Tool definitions (schemas advertised to Claude)
// ============================================================
const TOOLS = [
  {
    name: "inventory_test_connection",
    description:
      "Check the connection to the RAC Inventory database and return the server time plus row counts for key tables. Use this first if anything seems wrong.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_products",
    description:
      "List products in the catalogue (code, name, family group, unit, standard cost, current price). Useful for translating a product name into a code before other queries.",
    inputSchema: {
      type: "object",
      properties: {
        family: {
          type: "string",
          description: "Optional family filter, e.g. AGGREGATES, SAND, ROCK_ARMOR, ROAD_BASE, DUST",
        },
        active_only: { type: "boolean", description: "Only active products (default true)" },
      },
    },
  },
  {
    name: "list_customers",
    description: "List customers (code, name, type). Optional text search on the name.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional text to match in the customer name" },
        active_only: { type: "boolean", description: "Only active customers (default true)" },
      },
    },
  },
  {
    name: "get_sales",
    description:
      "List individual SALES dockets with product, customer, quantity (tonnes), unit price, revenue, cost and margin. Filter by period/date range, product, customer or family. Returns most recent first.",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description:
            "Friendly period: FY26, FY26-Q3, Q3, THIS-MONTH, LAST-MONTH, THIS-WEEK, TODAY, YESTERDAY, THIS-FY, LAST-FY, YTD. FY26 = Jul 2025-Jun 2026.",
        },
        date_from: { type: "string", description: "Start date YYYY-MM-DD (overrides period)" },
        date_to: { type: "string", description: "End date YYYY-MM-DD (overrides period)" },
        product: { type: "string", description: "Match on product code or name" },
        customer: { type: "string", description: "Match on customer name" },
        family: { type: "string", description: "Match on family group" },
        limit: { type: "number", description: "Max rows (default 50, max 500)" },
      },
    },
  },
  {
    name: "sales_summary",
    description:
      "Aggregate SALES totals (docket count, tonnes, revenue, cost, margin) over a period, optionally grouped by day/week/month/product/family/customer.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Friendly period (see get_sales)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
        group_by: {
          type: "string",
          enum: ["none", "day", "week", "month", "product", "family", "customer"],
          description: "How to break down the totals (default none = grand total only)",
        },
        product: { type: "string", description: "Filter by product code or name" },
        customer: { type: "string", description: "Filter by customer name" },
        family: { type: "string", description: "Filter by family group" },
      },
    },
  },
  {
    name: "get_production",
    description:
      "List individual PRODUCTION movements with product, quantity produced (tonnes), unit cost and total cost. Filter by period/date range, product or family.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Friendly period (see get_sales)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
        product: { type: "string", description: "Match on product code or name" },
        family: { type: "string", description: "Match on family group" },
        limit: { type: "number", description: "Max rows (default 50, max 500)" },
      },
    },
  },
  {
    name: "production_summary",
    description:
      "Aggregate PRODUCTION totals (movement count, tonnes produced, total cost, average cost per tonne) over a period, optionally grouped by day/week/month/product/family.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Friendly period (see get_sales)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
        group_by: {
          type: "string",
          enum: ["none", "day", "week", "month", "product", "family"],
          description: "How to break down the totals (default none = grand total only)",
        },
        product: { type: "string", description: "Filter by product code or name" },
        family: { type: "string", description: "Filter by family group" },
      },
    },
  },
  {
    name: "top_customers",
    description:
      "Rank customers by total sales revenue over a period. Returns revenue, tonnes, docket count and margin per customer.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Friendly period (see get_sales)" },
        date_from: { type: "string", description: "Start date YYYY-MM-DD" },
        date_to: { type: "string", description: "End date YYYY-MM-DD" },
        limit: { type: "number", description: "How many customers (default 10, max 100)" },
      },
    },
  },
  {
    name: "run_readonly_query",
    description:
      "Run a custom READ-ONLY SQL SELECT against the inventory database for anything the other tools don't cover. Only a single SELECT/WITH statement is allowed; writes and DDL are rejected. Key tables: products, current_stock, stock_movements, locations, customers, vehicles, drivers, production_runs, production_run_products, production_run_machines.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "A single SELECT (or WITH ... SELECT) statement" },
        max_rows: { type: "number", description: "Row cap applied on top of your query (default 200, max 2000)" },
      },
      required: ["sql"],
    },
  },
];

// ============================================================
// Tool handlers
// ============================================================
async function handleTool(name, args = {}) {
  switch (name) {
    case "inventory_test_connection": {
      const t = await pool.query("SELECT NOW() AS now");
      const counts = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM products)         AS products,
          (SELECT COUNT(*) FROM customers)        AS customers,
          (SELECT COUNT(*) FROM stock_movements)  AS movements,
          (SELECT COUNT(*) FROM stock_movements WHERE movement_type='SALES')      AS sales_movements,
          (SELECT COUNT(*) FROM stock_movements WHERE movement_type='PRODUCTION') AS production_movements
      `);
      return ok("Connected to the RAC Inventory database.", {
        server_time: t.rows[0].now,
        row_counts: counts.rows[0],
      });
    }

    case "list_products": {
      const conds = [];
      const params = [];
      if (args.active_only !== false) conds.push("is_active = true");
      if (args.family) {
        conds.push(`family_group ILIKE $${params.length + 1}`);
        params.push(`%${args.family}%`);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const r = await pool.query(
        `SELECT product_code, product_name, family_group, unit,
                standard_cost, current_price, min_stock_level, max_stock_level, is_active
         FROM products ${where}
         ORDER BY family_group, product_code`,
        params
      );
      return ok(`${r.rowCount} product(s).`, { products: r.rows });
    }

    case "list_customers": {
      const conds = [];
      const params = [];
      if (args.active_only !== false) conds.push("is_active = true");
      if (args.search) {
        conds.push(`customer_name ILIKE $${params.length + 1}`);
        params.push(`%${args.search}%`);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const r = await pool.query(
        `SELECT customer_code, customer_name, customer_type, contact_person, phone, email, is_active
         FROM customers ${where}
         ORDER BY customer_name`,
        params
      );
      return ok(`${r.rowCount} customer(s).`, { customers: r.rows });
    }

    case "get_sales": {
      const { where, params, from, to } = movementFilters(args, "SALES");
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 50, 1), 500);
      const r = await pool.query(
        `SELECT sm.movement_date, sm.docket_number, p.product_code, p.product_name,
                p.family_group, c.customer_name,
                sm.quantity AS tonnes, sm.unit_price, sm.total_revenue,
                sm.total_cost, (COALESCE(sm.total_revenue,0)-COALESCE(sm.total_cost,0)) AS margin,
                fl.location_name AS from_location, v.registration AS vehicle, d.driver_name AS driver
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.product_id
         LEFT JOIN customers c ON sm.customer_id = c.customer_id
         LEFT JOIN locations fl ON sm.from_location_id = fl.location_id
         LEFT JOIN vehicles v ON sm.vehicle_id = v.vehicle_id
         LEFT JOIN drivers d ON sm.driver_id = d.driver_id
         WHERE ${where}
         ORDER BY sm.movement_date DESC, sm.created_at DESC
         LIMIT ${limit}`,
        params
      );
      const rows = r.rows.map((row) => ({
        ...row,
        tonnes: round(row.tonnes),
        unit_price: round(row.unit_price),
        total_revenue: round(row.total_revenue),
        total_cost: round(row.total_cost),
        margin: round(row.margin),
      }));
      return ok(
        `${r.rowCount} sales docket(s)${from || to ? ` for ${from || "start"} → ${to || "now"}` : ""}.`,
        { date_range: { from, to }, sales: rows }
      );
    }

    case "sales_summary": {
      const { where, params, from, to } = movementFilters(args, "SALES");
      const gb = (args.group_by || "none").toLowerCase();
      const metrics = `
        COUNT(*) AS dockets,
        SUM(sm.quantity) AS tonnes,
        SUM(COALESCE(sm.total_revenue,0)) AS revenue,
        SUM(COALESCE(sm.total_cost,0)) AS cost,
        SUM(COALESCE(sm.total_revenue,0)-COALESCE(sm.total_cost,0)) AS margin`;
      const base = `
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.product_id
        LEFT JOIN customers c ON sm.customer_id = c.customer_id
        WHERE ${where}`;
      let r;
      if (gb === "none") {
        r = await pool.query(`SELECT ${metrics} ${base}`, params);
      } else {
        const g = GROUPERS[gb];
        if (!g) return fail(`Unknown group_by: ${gb}`);
        r = await pool.query(
          `SELECT ${g.sel}, ${metrics} ${base} GROUP BY ${g.grp} ORDER BY ${g.ord}`,
          params
        );
      }
      const rows = r.rows.map((row) => ({
        ...row,
        dockets: parseInt(row.dockets, 10),
        tonnes: round(row.tonnes),
        revenue: round(row.revenue),
        cost: round(row.cost),
        margin: round(row.margin),
      }));
      return ok(
        `Sales summary (${gb})${from || to ? ` for ${from || "start"} → ${to || "now"}` : ""}.`,
        { date_range: { from, to }, group_by: gb, results: rows }
      );
    }

    case "get_production": {
      const { where, params, from, to } = movementFilters(args, "PRODUCTION");
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 50, 1), 500);
      const r = await pool.query(
        `SELECT sm.movement_date, sm.docket_number, p.product_code, p.product_name,
                p.family_group, sm.quantity AS tonnes, sm.unit_cost, sm.total_cost,
                tl.location_name AS to_location, sm.notes
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.product_id
         LEFT JOIN locations tl ON sm.to_location_id = tl.location_id
         WHERE ${where}
         ORDER BY sm.movement_date DESC, sm.created_at DESC
         LIMIT ${limit}`,
        params
      );
      const rows = r.rows.map((row) => ({
        ...row,
        tonnes: round(row.tonnes),
        unit_cost: round(row.unit_cost),
        total_cost: round(row.total_cost),
      }));
      return ok(
        `${r.rowCount} production movement(s)${from || to ? ` for ${from || "start"} → ${to || "now"}` : ""}.`,
        { date_range: { from, to }, production: rows }
      );
    }

    case "production_summary": {
      const { where, params, from, to } = movementFilters(args, "PRODUCTION");
      const gb = (args.group_by || "none").toLowerCase();
      const metrics = `
        COUNT(*) AS movements,
        SUM(sm.quantity) AS tonnes,
        SUM(COALESCE(sm.total_cost,0)) AS cost,
        (SUM(COALESCE(sm.total_cost,0)) / NULLIF(SUM(sm.quantity),0)) AS avg_cost_per_tonne`;
      const base = `
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.product_id
        WHERE ${where}`;
      let r;
      if (gb === "none") {
        r = await pool.query(`SELECT ${metrics} ${base}`, params);
      } else {
        const g = GROUPERS[gb];
        if (!g || gb === "customer") return fail(`Unknown group_by for production: ${gb}`);
        r = await pool.query(
          `SELECT ${g.sel}, ${metrics} ${base} GROUP BY ${g.grp} ORDER BY ${g.ord}`,
          params
        );
      }
      const rows = r.rows.map((row) => ({
        ...row,
        movements: parseInt(row.movements, 10),
        tonnes: round(row.tonnes),
        cost: round(row.cost),
        avg_cost_per_tonne: round(row.avg_cost_per_tonne),
      }));
      return ok(
        `Production summary (${gb})${from || to ? ` for ${from || "start"} → ${to || "now"}` : ""}.`,
        { date_range: { from, to }, group_by: gb, results: rows }
      );
    }

    case "top_customers": {
      const { where, params, from, to } = movementFilters(args, "SALES");
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 10, 1), 100);
      const r = await pool.query(
        `SELECT c.customer_code, c.customer_name,
                COUNT(*) AS dockets,
                SUM(sm.quantity) AS tonnes,
                SUM(COALESCE(sm.total_revenue,0)) AS revenue,
                SUM(COALESCE(sm.total_revenue,0)-COALESCE(sm.total_cost,0)) AS margin
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.product_id
         LEFT JOIN customers c ON sm.customer_id = c.customer_id
         WHERE ${where}
         GROUP BY c.customer_code, c.customer_name
         ORDER BY revenue DESC NULLS LAST
         LIMIT ${limit}`,
        params
      );
      const rows = r.rows.map((row) => ({
        ...row,
        dockets: parseInt(row.dockets, 10),
        tonnes: round(row.tonnes),
        revenue: round(row.revenue),
        margin: round(row.margin),
      }));
      return ok(
        `Top ${rows.length} customer(s) by revenue${from || to ? ` for ${from || "start"} → ${to || "now"}` : ""}.`,
        { date_range: { from, to }, customers: rows }
      );
    }

    case "run_readonly_query": {
      let sql;
      try {
        sql = assertReadOnly(args.sql);
      } catch (e) {
        return fail(e.message);
      }
      const maxRows = Math.min(Math.max(parseInt(args.max_rows, 10) || 200, 1), 2000);
      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = 8000"); // 8s safety valve
        const r = await client.query(`SELECT * FROM (${sql}) AS _q LIMIT ${maxRows}`);
        return ok(`${r.rowCount} row(s) returned (capped at ${maxRows}).`, {
          row_count: r.rowCount,
          rows: r.rows,
        });
      } finally {
        client.release();
      }
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}

// ============================================================
// --test mode: quick connection check from the terminal
// ============================================================
if (process.argv.includes("--test")) {
  try {
    const res = await handleTool("inventory_test_connection", {});
    console.log(res.content[0].text);
    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error("❌ Connection test failed:", e.message);
    await pool.end();
    process.exit(1);
  }
}

// ============================================================
// Wire up the MCP server over stdio
// ============================================================
const server = new Server(
  { name: "rac-inventory", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleTool(name, args || {});
  } catch (err) {
    return fail(err.message || String(err));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("✅ RAC Inventory MCP server running (read-only, stdio).");
