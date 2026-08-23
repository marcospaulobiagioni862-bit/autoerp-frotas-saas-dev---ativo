-- FINANCE-R14 — authoritative PostgreSQL bank reconciliation persistence
-- Additive hardening of the legacy bank_statement_entries table. Existing rows are
-- preserved; new authoritative imports populate the richer reconciliation metadata.

ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'LEGACY';
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS matched_at timestamptz;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS matched_by text;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS dedup_key text;
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE bank_statement_entries ADD CONSTRAINT bank_statement_entries_direction_chk
    CHECK (direction IS NULL OR direction IN ('CREDIT','DEBIT'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Never guess direction/dedup metadata for legacy rows. If historical data already
-- has two MATCHED rows for the same account/transaction scope, fail closed instead
-- of silently choosing a winner before enabling the durable uniqueness boundary.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM bank_statement_entries
    WHERE transaction_id IS NOT NULL AND status = 'MATCHED'
    GROUP BY company_id, account_id, transaction_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'FINANCE-R14 migration blocked: duplicate matched bank reconciliation scope';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_entry_dedup
  ON bank_statement_entries(company_id, account_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- A transaction can be reconciled at most once per financial account. This preserves
-- legitimate transfer semantics: one TRANSFER may appear once as DEBIT on its source
-- account and once as CREDIT on its destination account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_match_scope
  ON bank_statement_entries(company_id, account_id, transaction_id)
  WHERE transaction_id IS NOT NULL AND status = 'MATCHED';

CREATE INDEX IF NOT EXISTS idx_bank_statement_reconciliation_inbox
  ON bank_statement_entries(company_id, account_id, status, date, id);

-- RLS/FORCE RLS and the restrictive tenant guard were introduced for this table by
-- 0002. Add the required permissive tenant policy as well: PostgreSQL combines at
-- least one PERMISSIVE policy with every RESTRICTIVE policy, otherwise a normal
-- non-superuser role is deny-all even when app.current_tenant is correct.
ALTER TABLE bank_statement_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON bank_statement_entries;
CREATE POLICY tenant_isolation_policy ON bank_statement_entries AS RESTRICTIVE
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_access_bank_statement_entries ON bank_statement_entries;
CREATE POLICY tenant_access_bank_statement_entries ON bank_statement_entries AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
