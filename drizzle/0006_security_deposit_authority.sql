-- SECURITY-2G8: align security deposit persistence with the existing domain model.
-- No new business fields are introduced. FORCE RLS from 0002 remains authoritative.

ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS vehicle_id text;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS original_amount numeric(12,2);
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS received_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS used_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS returned_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS received_at timestamp;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS returned_at timestamp;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

UPDATE security_deposits
SET original_amount = amount
WHERE original_amount IS NULL;

ALTER TABLE security_deposits ALTER COLUMN original_amount SET NOT NULL;

ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS financial_transaction_id text;
ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS receivable_id text;
ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS created_by_id text;
ALTER TABLE security_deposit_movements ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();

-- Migration 0002 added these tables to FORCE RLS with only a RESTRICTIVE
-- tenant policy. PostgreSQL requires an applicable PERMISSIVE policy as the
-- granting side of RLS; keep the restrictive policy and add a tenant-scoped
-- permissive policy, matching the repairs already used for payment methods and
-- financial periods.
DROP POLICY IF EXISTS tenant_access_security_deposits ON security_deposits;
CREATE POLICY tenant_access_security_deposits
ON security_deposits
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_access_security_deposit_movements ON security_deposit_movements;
CREATE POLICY tenant_access_security_deposit_movements
ON security_deposit_movements
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
