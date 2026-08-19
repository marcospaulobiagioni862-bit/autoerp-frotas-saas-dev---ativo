-- SECURITY-2I3/G9: server-authoritative Contract core + atomic operational binding.
-- Expand the existing contracts table in place; never recreate or discard legacy rows.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_number text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rental_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_periodicity text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_due_day_of_week integer;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_due_day_of_month integer;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS security_deposit_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS security_deposit_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS franchise_km integer;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS excess_km_rate numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_method_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS generated_pdf_url text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_contract_url text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS is_archived boolean;

-- Deterministic, neutral backfill for legacy rows. Financial terms are never invented.
UPDATE contracts
SET contract_number = 'LEGACY-' || md5(company_id || ':' || id)
WHERE contract_number IS NULL OR btrim(contract_number) = '';

UPDATE contracts
SET start_date = to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
WHERE start_date IS NULL OR btrim(start_date) = '';

UPDATE contracts SET rental_amount = 0 WHERE rental_amount IS NULL;
UPDATE contracts SET billing_periodicity = 'WEEKLY' WHERE billing_periodicity IS NULL;
UPDATE contracts SET billing_due_day_of_week = 1 WHERE billing_due_day_of_week IS NULL;
UPDATE contracts SET billing_due_day_of_month = 1 WHERE billing_due_day_of_month IS NULL;
UPDATE contracts SET security_deposit_amount = 0 WHERE security_deposit_amount IS NULL;
UPDATE contracts SET franchise_km = 0 WHERE franchise_km IS NULL;
UPDATE contracts SET excess_km_rate = 0 WHERE excess_km_rate IS NULL;
UPDATE contracts SET is_archived = (status = 'ARCHIVED') WHERE is_archived IS NULL;

ALTER TABLE contracts ALTER COLUMN contract_number SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN rental_amount SET DEFAULT 0;
ALTER TABLE contracts ALTER COLUMN rental_amount SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN billing_periodicity SET DEFAULT 'WEEKLY';
ALTER TABLE contracts ALTER COLUMN billing_periodicity SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN billing_due_day_of_week SET DEFAULT 1;
ALTER TABLE contracts ALTER COLUMN billing_due_day_of_week SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN billing_due_day_of_month SET DEFAULT 1;
ALTER TABLE contracts ALTER COLUMN billing_due_day_of_month SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN security_deposit_amount SET DEFAULT 0;
ALTER TABLE contracts ALTER COLUMN security_deposit_amount SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN franchise_km SET DEFAULT 0;
ALTER TABLE contracts ALTER COLUMN franchise_km SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN excess_km_rate SET DEFAULT 0;
ALTER TABLE contracts ALTER COLUMN excess_km_rate SET NOT NULL;
ALTER TABLE contracts ALTER COLUMN is_archived SET DEFAULT false;
ALTER TABLE contracts ALTER COLUMN is_archived SET NOT NULL;

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('DRAFT','AWAITING_SIGNATURE','ACTIVE','SUSPENDED','FINISHED','CLOSED','CANCELLED','ARCHIVED'));

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_rental_amount_nonnegative;
ALTER TABLE contracts ADD CONSTRAINT contracts_rental_amount_nonnegative CHECK (rental_amount >= 0);
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_security_deposit_nonnegative;
ALTER TABLE contracts ADD CONSTRAINT contracts_security_deposit_nonnegative CHECK (security_deposit_amount >= 0);
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_franchise_km_nonnegative;
ALTER TABLE contracts ADD CONSTRAINT contracts_franchise_km_nonnegative CHECK (franchise_km >= 0);
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_excess_km_rate_nonnegative;
ALTER TABLE contracts ADD CONSTRAINT contracts_excess_km_rate_nonnegative CHECK (excess_km_rate >= 0);
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_billing_periodicity_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_billing_periodicity_check
  CHECK (billing_periodicity IN ('WEEKLY','MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL'));
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_billing_due_week_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_billing_due_week_check
  CHECK (billing_due_day_of_week BETWEEN 1 AND 7);
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_billing_due_month_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_billing_due_month_check
  CHECK (billing_due_day_of_month BETWEEN 1 AND 31);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_company_number
  ON contracts(company_id, upper(contract_number));
CREATE INDEX IF NOT EXISTS idx_contract_company_vehicle
  ON contracts(company_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_contract_company_driver
  ON contracts(company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_contract_company_archived
  ON contracts(company_id, is_archived);

-- Fail closed if legacy data already violates the one-active-binding invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE status = 'ACTIVE' AND is_archived = false
    GROUP BY company_id, vehicle_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SECURITY-2I3 migration blocked: duplicate ACTIVE contracts for vehicle';
  END IF;
  IF EXISTS (
    SELECT 1 FROM contracts
    WHERE status = 'ACTIVE' AND is_archived = false
    GROUP BY company_id, driver_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SECURITY-2I3 migration blocked: duplicate ACTIVE contracts for driver';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_active_vehicle
  ON contracts(company_id, vehicle_id)
  WHERE status = 'ACTIVE' AND is_archived = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_active_driver
  ON contracts(company_id, driver_id)
  WHERE status = 'ACTIVE' AND is_archived = false;

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_ct ON contracts;
CREATE POLICY tenant_isolation_ct ON contracts
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
