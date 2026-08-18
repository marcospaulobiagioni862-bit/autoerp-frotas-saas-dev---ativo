-- SECURITY-2G4: financial_periods was added to FORCE RLS in migration 0002
-- with only a RESTRICTIVE tenant policy. Without an applicable PERMISSIVE
-- policy, non-bypass application roles cannot see closed periods, which can
-- make period validation fail open. Add the matching permissive tenant policy.

DROP POLICY IF EXISTS tenant_access_financial_periods ON financial_periods;

CREATE POLICY tenant_access_financial_periods
ON financial_periods
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
