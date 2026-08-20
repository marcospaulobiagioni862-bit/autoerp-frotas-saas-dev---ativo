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

-- The original payable-installment invariant predates periodized expense recurrence.
-- It made installment #1 for October collide with installment #1 for September when
-- both belonged to the same TRACKER origin. Preserve the old invariant for ordinary
-- non-periodized titles and let the existing unq_payable_recurring index own periodic
-- uniqueness by (tenant, origin, period).
DROP INDEX IF EXISTS unq_payable_installments;
CREATE UNIQUE INDEX unq_payable_installments
  ON account_payables(company_id, origin_type, origin_id, installment_number)
  WHERE installment_number IS NOT NULL AND period_ref IS NULL;

-- TRACKER is a monthly recurring expense in SECURITY-2K. Stamp the canonical period
-- before PostgreSQL evaluates unique indexes, so the title is born periodized instead
-- of being inserted as NULL and patched afterwards by the scheduler.
CREATE OR REPLACE FUNCTION autoerp_set_tracker_payable_period_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin_type = 'TRACKER' AND NEW.period_ref IS NULL THEN
    NEW.period_ref := to_char(NEW.competence_date::date, 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracker_payable_period_ref ON account_payables;
CREATE TRIGGER trg_tracker_payable_period_ref
BEFORE INSERT OR UPDATE OF competence_date, origin_type, period_ref
ON account_payables
FOR EACH ROW
EXECUTE FUNCTION autoerp_set_tracker_payable_period_ref();
