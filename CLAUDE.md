# CLAUDE.md — RAC Inventory System

Shared context lives in ../CLAUDE.md (the RAC-Projects folder). This file adds only
what's specific to this repo.

## What this is
Quarry production & inventory system for Rirratjingu Mining Pty Ltd. Tracks
production and sales of rock, sand and aggregates at product level. Integrates with
the RAC Xero MCP via quarterly stocktake reconciliation.

## Stack specifics
Node.js + Express + PostgreSQL (`pg`) + HTML/CSS/JS. Email via nodemailer, PDFs via
pdfkit. Postgres only — the `mysql2` entry in package.json is an unused leftover.

## Folder map
- server/    Express app: config/ (database.js), routes/, middleware/, server.js
- public/    Front end: css/, js/, pages/
- database/  DB files; database-schema.sql is the full schema
- mcp/       MCP integration
- archive/   Old files — not the current source of truth
- .env       Secrets — never commit or edit without asking

## Key facts
- 8 core tables: products, locations, current_stock, stock_movements, customers,
  vehicles, drivers, product_cost_history.
- Local dev: `npm run dev`. Health check: /api/health.
- Finance / Xero integration endpoints live under /api/finance/*.

## Skills
None repo-specific yet. When we build a recurring workflow here (e.g. a quarterly
reconciliation report), turn it into a skill and point to it from here.
