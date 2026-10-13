-- AUTOERP-52: Deduplicar politicas de RLS em 27 das 80 tabelas
-- Remove derivas de migracao mantendo uma politica canonica unica por tabela:
-- tenant_isolation_policy FOR ALL USING (company_id = current_setting('app.current_tenant', true)) WITH CHECK (...)
-- Preserva estritamente as politicas de imutabilidade de audit_logs (no_update_delete_al e no_update_delete_al2).

-- 1. account_payables (remove legada tenant_isolation_ap)
DROP POLICY IF EXISTS tenant_isolation_ap ON account_payables;

-- 2. account_receivables (remove legada tenant_isolation_ar)
DROP POLICY IF EXISTS tenant_isolation_ar ON account_receivables;

-- 3. audit_logs (remove legada tenant_isolation_al; preserva imutabilidade)
DROP POLICY IF EXISTS tenant_isolation_al ON audit_logs;

-- 4. bank_statement_entries (remove legada tenant_access_bank_statement_entries)
DROP POLICY IF EXISTS tenant_access_bank_statement_entries ON bank_statement_entries;

-- 5. communication_logs (remove legada authority_1_communication_tenant)
DROP POLICY IF EXISTS authority_1_communication_tenant ON communication_logs;

-- 6. contracts (remove legada tenant_isolation_ct)
DROP POLICY IF EXISTS tenant_isolation_ct ON contracts;

-- 7. credit_card_profiles (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_credit_card_profiles ON credit_card_profiles;
DROP POLICY IF EXISTS tenant_isolation_credit_card_profiles ON credit_card_profiles;
DROP POLICY IF EXISTS tenant_isolation_policy ON credit_card_profiles;
CREATE POLICY tenant_isolation_policy ON credit_card_profiles FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 8. credit_card_statement_adjustments (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_credit_card_statement_adjustments ON credit_card_statement_adjustments;
DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_adjustments ON credit_card_statement_adjustments;
DROP POLICY IF EXISTS tenant_isolation_policy ON credit_card_statement_adjustments;
CREATE POLICY tenant_isolation_policy ON credit_card_statement_adjustments FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 9. credit_card_statement_credits (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_credit_card_statement_credits ON credit_card_statement_credits;
DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_credits ON credit_card_statement_credits;
DROP POLICY IF EXISTS tenant_isolation_policy ON credit_card_statement_credits;
CREATE POLICY tenant_isolation_policy ON credit_card_statement_credits FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 10. credit_card_statement_items (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_credit_card_statement_items ON credit_card_statement_items;
DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_items ON credit_card_statement_items;
DROP POLICY IF EXISTS tenant_isolation_policy ON credit_card_statement_items;
CREATE POLICY tenant_isolation_policy ON credit_card_statement_items FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 11. credit_card_statement_payments (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_credit_card_statement_payments ON credit_card_statement_payments;
DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_payments ON credit_card_statement_payments;
DROP POLICY IF EXISTS tenant_isolation_policy ON credit_card_statement_payments;
CREATE POLICY tenant_isolation_policy ON credit_card_statement_payments FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 12. credit_card_statements (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_credit_card_statements ON credit_card_statements;
DROP POLICY IF EXISTS tenant_isolation_credit_card_statements ON credit_card_statements;
DROP POLICY IF EXISTS tenant_isolation_policy ON credit_card_statements;
CREATE POLICY tenant_isolation_policy ON credit_card_statements FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 13. driver_health_profiles (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_driver_health_profiles ON driver_health_profiles;
DROP POLICY IF EXISTS tenant_isolation_driver_health_profiles ON driver_health_profiles;
DROP POLICY IF EXISTS tenant_isolation_policy ON driver_health_profiles;
CREATE POLICY tenant_isolation_policy ON driver_health_profiles FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 14. drivers (remove legada tenant_isolation_dr)
DROP POLICY IF EXISTS tenant_isolation_dr ON drivers;

-- 15. financial_accounts (remove legadas tenant_access_financial_accounts e tenant_isolation_fa)
DROP POLICY IF EXISTS tenant_access_financial_accounts ON financial_accounts;
DROP POLICY IF EXISTS tenant_isolation_fa ON financial_accounts;

-- 16. financial_categories (remove legadas tenant_access_financial_categories e tenant_isolation_fc)
DROP POLICY IF EXISTS tenant_access_financial_categories ON financial_categories;
DROP POLICY IF EXISTS tenant_isolation_fc ON financial_categories;

-- 17. financial_periods (remove legada tenant_access_financial_periods)
DROP POLICY IF EXISTS tenant_access_financial_periods ON financial_periods;

-- 18. financial_transactions (remove legada tenant_isolation_ft)
DROP POLICY IF EXISTS tenant_isolation_ft ON financial_transactions;

-- 19. payment_methods (remove legada tenant_access_payment_methods)
DROP POLICY IF EXISTS tenant_access_payment_methods ON payment_methods;

-- 20. recurring_rules (remove legada tenant_isolation_recurring_rules)
DROP POLICY IF EXISTS tenant_isolation_recurring_rules ON recurring_rules;

-- 21. security_deposit_commands (padroniza para tenant_isolation_policy)
DROP POLICY IF EXISTS tenant_access_security_deposit_commands ON security_deposit_commands;
DROP POLICY IF EXISTS tenant_isolation_security_deposit_commands ON security_deposit_commands;
DROP POLICY IF EXISTS tenant_isolation_policy ON security_deposit_commands;
CREATE POLICY tenant_isolation_policy ON security_deposit_commands FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 22. security_deposit_movements (remove legada tenant_access_security_deposit_movements)
DROP POLICY IF EXISTS tenant_access_security_deposit_movements ON security_deposit_movements;

-- 23. security_deposits (remove legada tenant_access_security_deposits)
DROP POLICY IF EXISTS tenant_access_security_deposits ON security_deposits;

-- 24. trackers (remove legada tenant_isolation_trackers)
DROP POLICY IF EXISTS tenant_isolation_trackers ON trackers;

-- 25. traffic_tickets (remove legada tenant_isolation_traffic_tickets)
DROP POLICY IF EXISTS tenant_isolation_traffic_tickets ON traffic_tickets;

-- 26. users (remove legada tenant_isolation_us)
DROP POLICY IF EXISTS tenant_isolation_us ON users;

-- 27. vehicles (remove legada tenant_isolation_ve)
DROP POLICY IF EXISTS tenant_isolation_ve ON vehicles;
