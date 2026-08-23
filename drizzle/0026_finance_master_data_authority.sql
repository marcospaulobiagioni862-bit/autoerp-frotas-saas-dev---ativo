-- FINANCE-R23: authoritative financial master-data administration.
-- Existing migration 0002 establishes FORCE RLS + RESTRICTIVE tenant isolation.
-- PostgreSQL also needs an applicable PERMISSIVE policy for normal roles.

DROP POLICY IF EXISTS tenant_access_financial_accounts ON financial_accounts;
CREATE POLICY tenant_access_financial_accounts
ON financial_accounts
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_access_financial_categories ON financial_categories;
CREATE POLICY tenant_access_financial_categories
ON financial_categories
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- payment_methods already receives the equivalent PERMISSIVE tenant policy
-- in migration 0004_payment_methods_rls_permissive.sql. Do not duplicate it.
