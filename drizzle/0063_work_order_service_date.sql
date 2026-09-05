-- Maintenance OS: explicit service date for history and buyer-facing records
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS service_date date;

UPDATE work_orders
SET service_date = COALESCE(service_date, opened_at::date)
WHERE service_date IS NULL;

ALTER TABLE work_orders ALTER COLUMN service_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_company_service_date
  ON work_orders(company_id, service_date DESC, id DESC);
