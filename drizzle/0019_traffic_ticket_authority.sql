-- SECURITY-2M — Traffic Tickets server authority + AP/AR/NIC atomicity

ALTER TABLE traffic_tickets
  ADD COLUMN IF NOT EXISTS contract_id text,
  ADD COLUMN IF NOT EXISTS organ_name text,
  ADD COLUMN IF NOT EXISTS infraction_code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS infraction_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS discount_due_date date,
  ADD COLUMN IF NOT EXISTS original_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discounted_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS nic_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS responsibility text,
  ADD COLUMN IF NOT EXISTS base_payable_id text,
  ADD COLUMN IF NOT EXISTS receivable_id text,
  ADD COLUMN IF NOT EXISTS nic_payable_id text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS responsibility_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canonical_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Deterministic legacy backfill only. Missing business facts remain fail-closed.
UPDATE traffic_tickets
SET infraction_date = COALESCE(infraction_date, issue_date::date),
    original_amount = COALESCE(original_amount, amount)
WHERE canonical_ready = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_traffic_tickets_company_auto_canonical
  ON traffic_tickets(company_id, upper(auto_number))
  WHERE canonical_ready = true;

CREATE INDEX IF NOT EXISTS idx_traffic_tickets_company_vehicle_date
  ON traffic_tickets(company_id, vehicle_id, infraction_date DESC)
  WHERE canonical_ready = true;
CREATE INDEX IF NOT EXISTS idx_traffic_tickets_company_driver_status
  ON traffic_tickets(company_id, driver_id, status)
  WHERE canonical_ready = true;
CREATE INDEX IF NOT EXISTS idx_traffic_tickets_company_due_status
  ON traffic_tickets(company_id, due_date, status)
  WHERE canonical_ready = true;

ALTER TABLE traffic_tickets
  DROP CONSTRAINT IF EXISTS traffic_tickets_canonical_check;
ALTER TABLE traffic_tickets
  ADD CONSTRAINT traffic_tickets_canonical_check CHECK (
    canonical_ready = false OR (
      organ_name IS NOT NULL AND length(trim(organ_name)) > 0 AND
      infraction_code IS NOT NULL AND length(trim(infraction_code)) > 0 AND
      description IS NOT NULL AND length(trim(description)) > 0 AND
      infraction_date IS NOT NULL AND due_date IS NOT NULL AND
      original_amount IS NOT NULL AND original_amount > 0 AND
      points >= 0 AND
      responsibility IN ('DRIVER','COMPANY','UNIDENTIFIED') AND
      status IN (
        'PENDING_IDENTIFICATION','IDENTIFIED','CHARGED_DRIVER',
        'COMPANY_PAYABLE_CREATED','PAID_BY_COMPANY','APPEALED','CANCELLED'
      ) AND
      (discounted_amount IS NULL OR (discounted_amount > 0 AND discounted_amount < original_amount)) AND
      (nic_amount IS NULL OR nic_amount > 0)
    )
  );

ALTER TABLE traffic_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_tickets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_traffic_tickets ON traffic_tickets;
CREATE POLICY tenant_isolation_traffic_tickets ON traffic_tickets
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
