-- AUTHORITY-1: harden existing audit/communication authority used by detail views.
-- No new business tables are introduced in this migration.

ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs FORCE ROW LEVEL SECURITY;

-- Migration 0002 added only a RESTRICTIVE tenant policy to communication_logs.
-- PostgreSQL requires at least one PERMISSIVE policy, so the table otherwise
-- remains fail-closed even for correctly tenant-scoped server transactions.
DROP POLICY IF EXISTS authority_1_communication_tenant ON communication_logs;
CREATE POLICY authority_1_communication_tenant
ON communication_logs
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

ALTER TABLE communication_logs ADD COLUMN IF NOT EXISTS created_by text;

CREATE INDEX IF NOT EXISTS idx_communication_logs_company_driver_sent
ON communication_logs(company_id, driver_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_entity_time
ON audit_logs(company_id, entity_type, entity_id, timestamp DESC);
