-- ============================================================
-- Migration 005 — Production Run Journal Tables
-- Replaces production_run_costs with a proper 3-table structure
-- Run manually against Railway PostgreSQL from VS Code
-- Date: March 2026
-- ============================================================

-- Drop the old single-product cost table (no data, safe to drop)
DROP TABLE IF EXISTS production_run_costs;

-- ------------------------------------------------------------
-- TABLE 1: production_runs
-- One row per production run / shift.
-- Header that machines and products hang off.
-- All hours logged here are FOR THIS RUN ONLY — not total
-- machine hours for the day.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_runs (
  run_id               SERIAL PRIMARY KEY,
  run_date             DATE          NOT NULL,
  operator             VARCHAR(50),
  reference_number     VARCHAR(50),
  entry_mode           VARCHAR(10)   NOT NULL DEFAULT 'BOM'
                         CHECK (entry_mode IN ('BOM', 'MANUAL')),

  -- Blast WIP (total tonnes consumed across all products this run)
  wip_tonnes_used      DECIMAL(10,3) NOT NULL DEFAULT 0,
  wip_rate_per_tonne   DECIMAL(10,2) NOT NULL DEFAULT 0,
  wip_total_cost       DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Labour (one pool for the whole run)
  labour_hours         DECIMAL(8,2)  NOT NULL DEFAULT 0,
  labour_rate_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0,
  labour_total_cost    DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Total (calculated by backend before insert)
  total_run_cost       DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Variance / override tracking
  variance_zone        VARCHAR(10)   CHECK (variance_zone IN ('GREEN','AMBER','RED')),
  amber_check_confirmed BOOLEAN      DEFAULT FALSE,
  override_required    BOOLEAN       DEFAULT FALSE,
  override_code        VARCHAR(50),
  override_notes       TEXT,
  override_by          VARCHAR(50),
  override_at          TIMESTAMPTZ,

  -- Xero monthly WIP journal support
  xero_journal_ref     VARCHAR(50),

  notes                TEXT,
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TABLE 2: production_run_machines
-- One row per machine used in a run.
-- Multiple machines can run concurrently in the same run.
-- Hours = hours this machine was used FOR THIS RUN ONLY.
-- Rates are snapshotted at time of run — permanent record.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_run_machines (
  run_machine_id            SERIAL PRIMARY KEY,
  run_id                    INTEGER       NOT NULL
                              REFERENCES production_runs(run_id) ON DELETE CASCADE,
  machine_id                INTEGER       NOT NULL
                              REFERENCES machines(machine_id),

  -- Actual hours entered by operator
  hours_used                DECIMAL(8,2)  NOT NULL DEFAULT 0,

  -- Snapshot of machine rates at time of run
  rate_per_hour             DECIMAL(10,2) NOT NULL DEFAULT 0,
  maintenance_rate_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0,
  fuel_litres_per_hour      DECIMAL(6,2)  NOT NULL DEFAULT 0,
  fuel_rate_per_litre       DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Costs calculated by backend
  machine_cost              DECIMAL(12,2) NOT NULL DEFAULT 0,
  maintenance_cost          DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_litres_total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  fuel_cost                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cost                DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Variance vs BOM default hours
  bom_hours_expected        DECIMAL(8,2),
  variance_pct              DECIMAL(6,2),
  variance_zone             VARCHAR(10)   CHECK (variance_zone IN ('GREEN','AMBER','RED')),

  created_at                TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prm_run_id ON production_run_machines (run_id);

-- ------------------------------------------------------------
-- TABLE 3: production_run_products
-- One row per product produced in a run.
-- Cost split proportionally by weight — same $/tonne for all
-- products in a run regardless of grade.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_run_products (
  run_product_id  SERIAL PRIMARY KEY,
  run_id          INTEGER       NOT NULL
                    REFERENCES production_runs(run_id) ON DELETE CASCADE,
  product_id      INTEGER       NOT NULL
                    REFERENCES products(product_id),
  to_location_id  INTEGER       REFERENCES locations(location_id),

  tonnes_produced DECIMAL(10,3) NOT NULL,
  cost_share_pct  DECIMAL(8,4)  NOT NULL DEFAULT 0,  -- e.g. 45.4545 for 50t of 110t total
  cost_allocated  DECIMAL(12,2) NOT NULL DEFAULT 0,  -- $ share of total run cost
  cost_per_tonne  DECIMAL(10,4) NOT NULL DEFAULT 0,  -- cost_allocated / tonnes_produced

  -- Links to stock_movements entry (created when run is saved)
  movement_id     INTEGER       REFERENCES stock_movements(movement_id),

  -- Weighted avg cost audit trail
  prev_avg_cost   DECIMAL(10,4),
  new_avg_cost    DECIMAL(10,4),

  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prp_run_id     ON production_run_products (run_id);
CREATE INDEX IF NOT EXISTS idx_prp_product_id ON production_run_products (product_id);

-- ------------------------------------------------------------
-- Clean up bom_templates
-- maintenance_hours_per_tonne is redundant — maintenance cost
-- is now derived per-machine from the machines table
-- ------------------------------------------------------------
ALTER TABLE bom_templates
  DROP COLUMN IF EXISTS maintenance_hours_per_tonne;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT 'production_runs'          AS table_name, COUNT(*) AS rows FROM production_runs
UNION ALL
SELECT 'production_run_machines',  COUNT(*) FROM production_run_machines
UNION ALL
SELECT 'production_run_products',  COUNT(*) FROM production_run_products;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'bom_templates'
ORDER BY ordinal_position;
