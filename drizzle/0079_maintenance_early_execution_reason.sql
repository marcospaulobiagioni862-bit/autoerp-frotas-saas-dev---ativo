-- V2: preserve why a preventive work order was linked before the configured KM/date was reached.
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS maintenance_early_execution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_early_reason text;
