-- SECURITY-2K — Tracker server authority + recurring financial atomicity
-- Expand the legacy tracker table in place. Existing incomplete rows stay readable,
-- but no financial recurring rule is invented for them.

ALTER TABLE trackers ALTER COLUMN serial_number DROP NOT NULL;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS equipment_model text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS imei text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS chip_carrier text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS chip_number text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS monthly_cost numeric(12,2);
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS installation_date date;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS supplier_id text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE trackers ADD CONSTRAINT trackers_status_chk
    CHECK (status IN ('ACTIVE','INACTIVE','REMOVED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trackers ADD CONSTRAINT trackers_monthly_cost_chk
    CHECK (monthly_cost IS NULL OR monthly_cost >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Never pick an arbitrary winner if legacy data already contains two ACTIVE trackers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM trackers
    WHERE status = 'ACTIVE'
    GROUP BY company_id, vehicle_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SECURITY-2K migration blocked: duplicate ACTIVE trackers for one vehicle';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_trackers_company_imei
  ON trackers(company_id, imei)
  WHERE imei IS NOT NULL AND btrim(imei) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_trackers_active_vehicle
  ON trackers(company_id, vehicle_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_trackers_company_vehicle_status
  ON trackers(company_id, vehicle_id, status, created_at DESC);

ALTER TABLE trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trackers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_trackers ON trackers;
CREATE POLICY tenant_isolation_trackers ON trackers
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
