-- ============================================================
-- RAC Inventory System - Migration 004
-- BOM / Production Costing Tables
-- Run manually against Railway PostgreSQL from VS Code
-- Date: March 2026
-- ============================================================

-- ------------------------------------------------------------
-- TABLE 1: production_rates
-- Stores the standard rates used to calculate production costs.
-- All rates are manually maintained by admin/manager.
-- Rates are month-stable but can be updated with a new effective_from date.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_rates (
  rate_id         SERIAL PRIMARY KEY,
  rate_type       VARCHAR(20)   NOT NULL,   -- BLAST_WIP | LABOUR | MACHINE | MAINTENANCE | FUEL
  rate_description VARCHAR(100) NOT NULL,   -- Human-readable label shown in UI
  rate_per_unit   DECIMAL(10,2) NOT NULL,   -- Dollar value per unit
  rate_unit       VARCHAR(20)   NOT NULL,   -- $/tonne | $/hr | $/litre
  effective_from  DATE          NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,                     -- NULL = currently active
  is_active       BOOLEAN       DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Seed initial rates (update values to match actual RAC figures before go-live)
INSERT INTO production_rates (rate_type, rate_description, rate_per_unit, rate_unit, effective_from, notes) VALUES
  ('BLAST_WIP',    'Blast WIP Material Cost',       0.00, '$/tonne', CURRENT_DATE, 'Cost per tonne of Blast WIP consumed. Source from Xero. Update when Xero WIP cost changes.'),
  ('LABOUR',       'Labour Rate',                   0.00, '$/hr',    CURRENT_DATE, 'Operator labour cost per hour'),
  ('MACHINE',      'Machine Hours Provision',        0.00, '$/hr',    CURRENT_DATE, 'Crusher/plant machine hour provision rate'),
  ('MAINTENANCE',  'Maintenance Hours Provision',    0.00, '$/hr',    CURRENT_DATE, 'Equipment maintenance provision rate per hour'),
  ('FUEL',         'Fuel Cost',                     0.00, '$/litre',  CURRENT_DATE, 'Fuel cost per litre. Alternatively use flat $ per run in BOM template.');

-- ------------------------------------------------------------
-- TABLE 2: bom_templates
-- Bill of Materials template per product.
-- Defines standard input quantities per tonne produced.
-- Operators confirm or override actuals on each run.
-- By-products: wip_tonnes_per_tonne = 0 (no material component).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bom_templates (
  bom_id                      SERIAL PRIMARY KEY,
  product_id                  INTEGER       NOT NULL REFERENCES products(product_id),
  is_by_product               BOOLEAN       DEFAULT FALSE,
  -- Standard quantities per tonne of finished product
  wip_tonnes_per_tonne        DECIMAL(6,3)  DEFAULT 1.000,  -- 0.000 for by-products
  labour_hours_per_tonne      DECIMAL(6,3)  DEFAULT 1.000,
  machine_hours_per_tonne     DECIMAL(6,3)  DEFAULT 1.000,
  maintenance_hours_per_tonne DECIMAL(6,3)  DEFAULT 1.000,
  fuel_litres_per_tonne       DECIMAL(6,3)  DEFAULT 0.000,  -- 0 = not used
  fuel_flat_per_run           DECIMAL(10,2) DEFAULT 0.00,   -- flat $ per run (overrides litres if > 0)
  notes                       TEXT,
  is_active                   BOOLEAN       DEFAULT TRUE,
  created_at                  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   DEFAULT NOW()
);

-- One active BOM per product
CREATE UNIQUE INDEX IF NOT EXISTS bom_templates_product_active
  ON bom_templates (product_id) WHERE is_active = TRUE;

-- ------------------------------------------------------------
-- TABLE 3: production_run_costs
-- Full cost breakdown for each production run.
-- Linked to stock_movements (movement_type = PRODUCTION).
-- Keeps the movements table clean - all cost detail lives here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_run_costs (
  run_id                    SERIAL PRIMARY KEY,
  movement_id               INTEGER       REFERENCES stock_movements(movement_id),
  product_id                INTEGER       NOT NULL REFERENCES products(product_id),
  to_location_id            INTEGER       REFERENCES locations(location_id),
  production_date           DATE          NOT NULL,
  tonnes_produced           DECIMAL(10,3) NOT NULL,

  -- Blast WIP (primary products only; 0 for by-products)
  wip_tonnes_used           DECIMAL(10,3) DEFAULT 0,
  wip_rate_per_tonne        DECIMAL(10,2) DEFAULT 0,
  wip_total_cost            DECIMAL(12,2) DEFAULT 0,   -- calculated by backend: wip_tonnes_used * wip_rate_per_tonne

  -- Labour
  labour_hours              DECIMAL(8,2)  DEFAULT 0,
  labour_rate_per_hour      DECIMAL(10,2) DEFAULT 0,
  labour_total_cost         DECIMAL(12,2) DEFAULT 0,   -- calculated by backend

  -- Machine Hours
  machine_hours             DECIMAL(8,2)  DEFAULT 0,
  machine_rate_per_hour     DECIMAL(10,2) DEFAULT 0,
  machine_total_cost        DECIMAL(12,2) DEFAULT 0,   -- calculated by backend

  -- Maintenance
  maintenance_hours         DECIMAL(8,2)  DEFAULT 0,
  maintenance_rate_per_hour DECIMAL(10,2) DEFAULT 0,
  maintenance_total_cost    DECIMAL(12,2) DEFAULT 0,   -- calculated by backend

  -- Fuel (litres x rate OR flat dollar)
  fuel_litres               DECIMAL(8,2)  DEFAULT 0,
  fuel_rate_per_litre       DECIMAL(10,2) DEFAULT 0,
  fuel_flat_cost            DECIMAL(10,2) DEFAULT 0,   -- overrides litres x rate if > 0
  fuel_total_cost           DECIMAL(12,2) DEFAULT 0,   -- calculated by backend

  -- Summary
  total_cost                DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_per_tonne            DECIMAL(10,4) NOT NULL DEFAULT 0,

  -- Xero support: monthly WIP journal tracking
  xero_journal_ref          VARCHAR(50),               -- populated when accountant posts journal

  operator                  VARCHAR(50),
  reference_number          VARCHAR(50),
  notes                     TEXT,
  created_at                TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prc_production_date ON production_run_costs (production_date);
CREATE INDEX IF NOT EXISTS idx_prc_movement_id     ON production_run_costs (movement_id);

-- ============================================================
-- VERIFY - run this to confirm tables created successfully
-- ============================================================
SELECT 'production_rates'     AS table_name, COUNT(*) AS rows FROM production_rates
UNION ALL
SELECT 'bom_templates',        COUNT(*) FROM bom_templates
UNION ALL
SELECT 'production_run_costs', COUNT(*) FROM production_run_costs;
