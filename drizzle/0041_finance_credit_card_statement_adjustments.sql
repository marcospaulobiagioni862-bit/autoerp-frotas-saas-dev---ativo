-- FINANCE-CARD-1E5: idempotent, tenant-scoped statement charges/discount adjustments.
-- Adjustments mutate only statement monetary fields. They do not create FinancialTransactions or cash movements.

CREATE TABLE IF NOT EXISTS credit_card_statement_adjustments (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  statement_id text NOT NULL REFERENCES credit_card_statements(id) ON DELETE RESTRICT,
  interest_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  fine_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_card_statement_adjustment_idempotency UNIQUE (company_id, idempotency_key),
  CONSTRAINT ck_credit_card_statement_adjustment_nonzero CHECK (
    interest_amount > 0 OR fine_amount > 0 OR discount_amount > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_card_statement_adjustments_statement
  ON credit_card_statement_adjustments(company_id, statement_id, created_at);

CREATE OR REPLACE FUNCTION enforce_credit_card_statement_adjustment_authority()
RETURNS trigger AS $$
DECLARE
  v_statement_company text;
BEGIN
  SELECT company_id INTO v_statement_company
  FROM credit_card_statements
  WHERE id = NEW.statement_id;

  IF v_statement_company IS NULL OR v_statement_company <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card statement adjustment tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_statement_adjustment_authority ON credit_card_statement_adjustments;
CREATE TRIGGER trg_credit_card_statement_adjustment_authority
BEFORE INSERT OR UPDATE OF company_id, statement_id ON credit_card_statement_adjustments
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_statement_adjustment_authority();

ALTER TABLE credit_card_statement_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_adjustments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access_credit_card_statement_adjustments ON credit_card_statement_adjustments;
CREATE POLICY tenant_access_credit_card_statement_adjustments ON credit_card_statement_adjustments AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_adjustments ON credit_card_statement_adjustments;
CREATE POLICY tenant_isolation_credit_card_statement_adjustments ON credit_card_statement_adjustments AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
