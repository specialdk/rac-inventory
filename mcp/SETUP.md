# RAC Inventory MCP — Setup Guide

This is a small **MCP server**. Think of it as a translator that sits between
Claude and your Inventory database. It gives Claude a set of "tools" (like
`get_sales` and `production_summary`), and each tool knows how to fetch that
data. It is **read-only** — it can look at your data but never change it.

It reads from the **same Railway PostgreSQL database** your app already uses,
reusing the `DATABASE_URL` in your project's `.env` file. So there are no new
passwords to set up.

---

## Step 1 — Install the dependencies (one time)

Open a terminal **in VS Code** (Terminal → New Terminal) and run:

```bash
cd mcp
npm install
```

This downloads the three libraries it needs (`@modelcontextprotocol/sdk`,
`pg`, `dotenv`) into `mcp/node_modules`.

## Step 2 — Test the database connection (recommended)

Still in the `mcp` folder:

```bash
npm run test-connection
```

If it works you'll see the database time and row counts, e.g.:

```
{
  "summary": "Connected to the RAC Inventory database.",
  "server_time": "2026-07-16T...",
  "row_counts": { "products": 9, "customers": 5, "movements": 0, ... }
}
```

If it fails, the most likely cause is that `../.env` doesn't have a working
`DATABASE_URL`. That's the same value your app uses, so if the app runs, this
should too.

## Step 3 — Register it with Claude Desktop

Open your Claude Desktop config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
  (paste that into the File Explorer address bar)

Add a `rac-inventory` entry inside `mcpServers`. If you already have other
servers there (xero, mex, etc.), just add this one alongside them — **mind the
commas** between entries:

```json
{
  "mcpServers": {
    "rac-inventory": {
      "command": "node",
      "args": [
        "C:\\Users\\speci\\OneDrive\\RAC-Projects\\rac-inventory\\mcp\\rac-inventory-mcp.js"
      ]
    }
  }
}
```

> The server finds your database on its own (via `../.env`), so no `env`
> block is needed here.

## Step 4 — Restart Claude Desktop

Fully quit and reopen the Claude Desktop app so it picks up the new server.
When it comes back, `rac-inventory` should appear in your connected tools.

## Step 5 — Ask questions

Try things like:

- "Test the inventory connection."
- "What did we sell in FY26-Q1?"
- "Show me sales to Nhulunbuy Corporation this financial year."
- "How much 20mm Aggregate did we produce last month?"
- "Give me a sales summary by product for this FY."
- "Who are our top 5 customers by revenue this year?"

---

## The tools it provides

| Tool | What it answers |
|------|-----------------|
| `inventory_test_connection` | Is the database reachable? Row counts. |
| `list_products` | Product catalogue (codes, names, families, prices). |
| `list_customers` | Customer directory. |
| `get_sales` | Individual sales dockets (filter by period/product/customer/family). |
| `sales_summary` | Sales totals, grouped by day/week/month/product/family/customer. |
| `get_production` | Individual production movements. |
| `production_summary` | Production totals + average cost per tonne. |
| `top_customers` | Customers ranked by revenue. |
| `run_readonly_query` | A safe SELECT-only escape hatch for anything else. |

**Periods** you can use: `FY26`, `FY26-Q1`, `Q3` (current FY), `THIS-MONTH`,
`LAST-MONTH`, `THIS-WEEK`, `TODAY`, `YESTERDAY`, `THIS-FY`, `LAST-FY`, `YTD`.
FY26 = July 2025 → June 2026. You can also pass exact `date_from` / `date_to`.

## A note on safety

Every tool only runs `SELECT` statements. The free-form `run_readonly_query`
tool actively rejects anything that isn't a single `SELECT`/`WITH` (no INSERT,
UPDATE, DELETE, DROP, etc.) and applies an 8-second timeout and a row cap. It
cannot modify your inventory.
