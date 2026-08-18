-- SECURITY-2G4: payment_methods was added to FORCE RLS in migration 0002 with
-- only a RESTRICTIVE tenant policy. PostgreSQL requires at least one
-- applicable PERMISSIVE policy; otherwise access is deny-all for non-bypass
-- roles. Add the missing permissive tenant policy without weakening the
-- existing restrictive policy.

DROP POLICY IF EXISTS tenant_access_payment_methods ON payment_methods;

CREATE POLICY tenant_access_payment_methods
ON payment_methods
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
