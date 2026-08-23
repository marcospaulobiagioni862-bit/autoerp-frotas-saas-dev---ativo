-- FINANCE-R16: durable command idempotency for security-deposit return/compensation.
-- Keeps compensation out of bank/cash ledgers while giving it the same retry boundary
-- already used by financial transactions.

CREATE TABLE IF NOT EXISTS security_deposit_commands (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  idempotency_key text NOT NULL,
  command_type text NOT NULL CHECK (command_type IN ('RETURN', 'COMPENSATION')),
  security_deposit_id text NOT NULL,
  receivable_id text,
  financial_transaction_id text,
  movement_id text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_security_deposit_command_idempotency
  ON security_deposit_commands(company_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_security_deposit_commands_deposit
  ON security_deposit_commands(company_id, security_deposit_id, created_at);

ALTER TABLE security_deposit_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_deposit_commands FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access_security_deposit_commands ON security_deposit_commands;
CREATE POLICY tenant_access_security_deposit_commands
ON security_deposit_commands
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_security_deposit_commands ON security_deposit_commands;
CREATE POLICY tenant_isolation_security_deposit_commands
ON security_deposit_commands
AS RESTRICTIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
