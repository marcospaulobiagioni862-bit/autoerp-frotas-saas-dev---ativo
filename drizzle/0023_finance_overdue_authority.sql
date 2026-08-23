-- FINANCE-R12 — server-authoritative overdue late-charge rules and processing.
-- No business-rate defaults are seeded here. A tenant must explicitly configure
-- its RECEIVABLE and/or PAYABLE rule before overdue processing can mutate titles.

CREATE TABLE IF NOT EXISTS finance_late_charge_rules (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  obligation_type text NOT NULL CHECK (obligation_type IN ('RECEIVABLE','PAYABLE')),
  grace_period_days integer NOT NULL CHECK (grace_period_days >= 0 AND grace_period_days <= 365),
  fine_percent numeric(7,4) NOT NULL CHECK (fine_percent >= 0 AND fine_percent <= 100),
  daily_interest_percent numeric(9,6) NOT NULL CHECK (daily_interest_percent >= 0 AND daily_interest_percent <= 10),
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_late_charge_rules_company_fk FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT finance_late_charge_rules_company_type_unique UNIQUE (company_id, obligation_type)
);

CREATE INDEX IF NOT EXISTS idx_finance_late_charge_rules_company_active
  ON finance_late_charge_rules(company_id, obligation_type, active);

ALTER TABLE finance_late_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_late_charge_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_late_charge_rules_tenant_policy ON finance_late_charge_rules;
CREATE POLICY finance_late_charge_rules_tenant_policy
  ON finance_late_charge_rules
  FOR ALL
  USING (company_id = nullif(current_setting('app.current_tenant', true), ''))
  WITH CHECK (company_id = nullif(current_setting('app.current_tenant', true), ''));
