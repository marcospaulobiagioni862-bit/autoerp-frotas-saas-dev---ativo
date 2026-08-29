-- MAINT-SLA-1C: explicit work-order SLA and append-only delay reasons.
-- No default SLA is invented. NULL expected_duration_minutes means SEM_SLA.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS expected_duration_minutes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_expected_duration_minutes_chk'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_expected_duration_minutes_chk
      CHECK (expected_duration_minutes IS NULL OR expected_duration_minutes > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS maintenance_work_order_delay_reasons (
  id text NOT NULL,
  company_id text NOT NULL,
  work_order_id text NOT NULL REFERENCES work_orders(id),
  reason text NOT NULL,
  actor_user_id text NOT NULL,
  actor_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT maintenance_work_order_delay_reason_nonblank_chk CHECK (btrim(reason) <> '')
);

CREATE INDEX IF NOT EXISTS idx_maintenance_work_order_delay_reasons_order
  ON maintenance_work_order_delay_reasons(company_id, work_order_id, occurred_at DESC, created_at DESC);

ALTER TABLE maintenance_work_order_delay_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_work_order_delay_reasons FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_maintenance_work_order_delay_reasons ON maintenance_work_order_delay_reasons;
CREATE POLICY tenant_isolation_maintenance_work_order_delay_reasons ON maintenance_work_order_delay_reasons
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

CREATE OR REPLACE FUNCTION reject_maintenance_work_order_delay_reason_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'maintenance_work_order_delay_reasons is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS maintenance_work_order_delay_reasons_append_only ON maintenance_work_order_delay_reasons;
CREATE TRIGGER maintenance_work_order_delay_reasons_append_only
BEFORE UPDATE OR DELETE ON maintenance_work_order_delay_reasons
FOR EACH ROW EXECUTE FUNCTION reject_maintenance_work_order_delay_reason_mutation();
