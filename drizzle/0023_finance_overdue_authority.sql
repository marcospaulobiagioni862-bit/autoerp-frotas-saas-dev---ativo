CREATE TABLE IF NOT EXISTS finance_late_charge_rules (
  company_id text PRIMARY KEY,
  grace_period_days integer NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0 AND grace_period_days <= 365),
  fine_percent numeric(7,4) NOT NULL DEFAULT 2.0000 CHECK (fine_percent >= 0 AND fine_percent <= 100),
  daily_interest_percent numeric(9,6) NOT NULL DEFAULT 0.033000 CHECK (daily_interest_percent >= 0 AND daily_interest_percent <= 10),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_late_charge_rules_company_fk FOREIGN KEY (company_id) REFERENCES companies(id)
);

INSERT INTO finance_late_charge_rules (company_id, grace_period_days, fine_percent, daily_interest_percent, active)
SELECT id, 0, 2.0000, 0.033000, true
FROM companies
ON CONFLICT (company_id) DO NOTHING;

ALTER TABLE finance_late_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_late_charge_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_late_charge_rules_tenant_policy ON finance_late_charge_rules;
CREATE POLICY finance_late_charge_rules_tenant_policy
ON finance_late_charge_rules
AS PERMISSIVE
FOR ALL
USING (company_id = nullif(current_setting('app.current_tenant', true), ''))
WITH CHECK (company_id = nullif(current_setting('app.current_tenant', true), ''));

CREATE INDEX IF NOT EXISTS idx_finance_late_charge_rules_active
  ON finance_late_charge_rules(company_id, active);
