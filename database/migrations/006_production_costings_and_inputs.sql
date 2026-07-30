-- ============================================================
-- RAC Inventory System - Migration 006
-- Production ↔ Sandpit unification: shared costings + run inputs
-- Run manually against Railway PostgreSQL from VS Code
-- Date: 30 July 2026
--
-- Adds the two tables Phase 1 needs:
--   1. production_costings   - saved Sandpit costings, shared + searchable
--                              (replaces per-browser localStorage), with a
--                              Draft -> Posted lifecycle.
--   2. production_run_inputs - the CONSUMED side of a production run
--                              (reduce input products at their source pile),
--                              so a blend/premix posts two-directionally.
--
-- Nothing here changes existing tables or data. Safe to run once.
-- ============================================================

-- ------------------------------------------------------------
-- TABLE 1: production_costings
-- One row per saved costing from the Sandpit.
-- The full costing (materials / products / machines / rates /
-- totals) is kept in `payload` (the same JSON shape the Sandpit
-- already builds), with headline figures denormalised into
-- columns so the Production screen can search/list them.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_costings (
  costing_id      SERIAL PRIMARY KEY,
  costing_ref     VARCHAR(50),                 -- e.g. C0001 or a user reference
  run_date        DATE,
  operator        VARCHAR(50),
  entry_mode      VARCHAR(10),                 -- Blend | Crush | Manual (mirrors the Sandpit 'mode')
  notes           TEXT,

  -- Headline totals (denormalised from payload for fast search/list)
  input_tonnes    DECIMAL(12,3) NOT NULL DEFAULT 0,
  output_tonnes   DECIMAL(12,3) NOT NULL DEFAULT 0,
  total_run_cost  DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost_per_tonne  DECIMAL(12,4) NOT NULL DEFAULT 0,

  -- Full costing exactly as costed (materials, products, machines, rates, split)
  payload         JSONB         NOT NULL,

  -- Lifecycle: DRAFT while it's just a costing; POSTED once imported and posted
  -- to a real run (posted_run_id links to it); ARCHIVED to hide without deleting.
  status          VARCHAR(12)   NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','POSTED','ARCHIVED')),
  posted_run_id   INTEGER       REFERENCES production_runs(run_id),
  posted_at       TIMESTAMPTZ,

  created_by      VARCHAR(50),
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pc_status   ON production_costings (status);
CREATE INDEX IF NOT EXISTS idx_pc_run_date ON production_costings (run_date);
CREATE INDEX IF NOT EXISTS idx_pc_ref      ON production_costings (costing_ref);

-- ------------------------------------------------------------
-- TABLE 2: production_run_inputs
-- One row per material CONSUMED by a production run.
-- This is the half live Production never had — it lets a run
-- draw real product out of a source pile (e.g. -292 t 100 minus
-- @ Stockpile 36) as it makes the output product.
--
--   * Real product input : product_id set, from_location_id set,
--                           is_wip = FALSE, movement_id -> the
--                           CONSUMPTION stock_movement (a reduction
--                           at the source pile, drawn at current
--                           average cost — does NOT change the
--                           input product's standard cost).
--   * Blast WIP input     : is_wip = TRUE, product_id/location NULL,
--                           movement_id NULL — a cost-only line, no
--                           stock (a crush run behaves exactly as today).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_run_inputs (
  run_input_id      SERIAL PRIMARY KEY,
  run_id            INTEGER       NOT NULL
                      REFERENCES production_runs(run_id) ON DELETE CASCADE,
  product_id        INTEGER       REFERENCES products(product_id),   -- NULL for Blast WIP
  is_wip            BOOLEAN       NOT NULL DEFAULT FALSE,
  from_location_id  INTEGER       REFERENCES locations(location_id),  -- source pile (NULL for WIP)

  tonnes            DECIMAL(12,3) NOT NULL DEFAULT 0,
  cost_per_tonne    DECIMAL(12,4) NOT NULL DEFAULT 0,   -- avg cost drawn at (or the WIP rate)
  line_cost         DECIMAL(14,2) NOT NULL DEFAULT 0,   -- tonnes * cost_per_tonne

  -- Link to the negative CONSUMPTION stock_movement (NULL for WIP cost-only lines)
  movement_id       INTEGER       REFERENCES stock_movements(movement_id),
  prev_avg_cost     DECIMAL(12,4),                      -- avg cost at the pile before the draw (audit)

  created_at        TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pri_run_id     ON production_run_inputs (run_id);
CREATE INDEX IF NOT EXISTS idx_pri_product_id ON production_run_inputs (product_id);

-- ============================================================
-- NOTES FOR THE API WORK (Phase 1) — no schema change needed:
--   * Consumption movements will use movement_type = 'CONSUMPTION'
--     with from_location_id set (a reduction at the source pile).
--     stock_movements.movement_type has NO check constraint, so
--     no ALTER is required to introduce it.
--   * IMPORTANT: the daily reconciliation ledger (reconciliation.js /
--     stock.js /as-at) currently sums movements EXCLUDING
--     DEMAND, EDIT, CANCEL. 'CONSUMPTION' is a REAL stock reduction
--     and MUST be included (i.e. do NOT add it to the exclude list),
--     drawn from from_location_id like a sale. Confirm the /as-at
--     logic subtracts from_location movements before go-live.
-- ============================================================

-- ============================================================
-- VERIFY
-- ============================================================
SELECT 'production_costings'   AS table_name, COUNT(*) AS rows FROM production_costings
UNION ALL
SELECT 'production_run_inputs',  COUNT(*) FROM production_run_inputs;
