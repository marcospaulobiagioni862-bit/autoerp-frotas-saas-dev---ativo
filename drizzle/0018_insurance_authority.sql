-- SECURITY-2L — Insurance server authority + AP installments + expiration alerts

CREATE TABLE IF NOT EXISTS insurances (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  insurance_company text NOT NULL,
  policy_number text NOT NULL,
  coverage_details text NOT NULL,
  deductible_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_premium_amount numeric(12,2) NOT NULL DEFAULT 0,
  installments_count integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  broker_name text,
  broker_phone text,
  cancellation_reason text,
  cancelled_at timestamptz,
  account_payable_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insurances_status_chk CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED')),
  CONSTRAINT insurances_deductible_chk CHECK (deductible_amount >= 0),
  CONSTRAINT insurances_premium_chk CHECK (total_premium_amount >= 0),
  CONSTRAINT insurances_installments_chk CHECK (installments_count BETWEEN 1 AND 60),
  CONSTRAINT insurances_dates_chk CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_insurances_company_policy
  ON insurances(company_id, policy_number);
CREATE INDEX IF NOT EXISTS idx_insurances_company_vehicle
  ON insurances(company_id, vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurances_company_status_expiration
  ON insurances(company_id, status, end_date);

ALTER TABLE insurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_insurances ON insurances;
CREATE POLICY tenant_isolation_insurances ON insurances
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
