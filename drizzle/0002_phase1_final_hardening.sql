-- Migration 0002: Phase 1 Final Hardening (Financial Periods, Append-Only Audit Logs, RLS)

ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS end_date text;
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS reopened_at timestamp;
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS reopened_by text;
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS reopen_reason text;
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- Audit Log Append-Only Protection
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only. UPDATE and DELETE are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_modification();

-- Enable RLS and Force RLS on 21 Tenant-Owned Tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users', 'vehicles', 'drivers', 'contracts', 'financial_categories',
    'financial_accounts', 'account_receivables', 'account_payables',
    'financial_transactions', 'audit_logs', 'payment_methods', 'security_deposits',
    'security_deposit_movements', 'recurring_rules', 'bank_statement_entries',
    'financial_periods', 'maintenance', 'traffic_tickets', 'trackers',
    'file_attachments', 'communication_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    
    -- Drop existing policy if any
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', t);
    
    -- Create restrictive tenant isolation policy
    EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I AS RESTRICTIVE USING (company_id = current_setting(''app.current_tenant'', true)) WITH CHECK (company_id = current_setting(''app.current_tenant'', true));', t);
  END LOOP;
END
$$;
