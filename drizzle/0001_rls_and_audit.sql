ALTER TABLE account_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ap ON account_payables FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_ar ON account_receivables FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_al ON audit_logs FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_ct ON contracts FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_dr ON drivers FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_fa ON financial_accounts FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_fc ON financial_categories FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_ft ON financial_transactions FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_us ON users FOR ALL USING (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_isolation_ve ON vehicles FOR ALL USING (company_id = current_setting('app.current_tenant', true));

-- Prevent updates and deletes on audit_logs
-- Instead of using REVOKE (which affects the owner), we can create a restrictive policy.
-- Note: A Postgres table owner bypasses RLS by default, but we can set FORCE ROW LEVEL SECURITY.
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE account_payables FORCE ROW LEVEL SECURITY;
ALTER TABLE account_receivables FORCE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;

CREATE POLICY no_update_delete_al ON audit_logs FOR UPDATE USING (false);
CREATE POLICY no_update_delete_al2 ON audit_logs FOR DELETE USING (false);
