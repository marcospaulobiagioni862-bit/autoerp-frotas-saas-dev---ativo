-- FINANCE-CARD-1E6: idempotent post-close credits without rewriting closed statement items.

CREATE TABLE IF NOT EXISTS credit_card_statement_credits (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  statement_id text NOT NULL REFERENCES credit_card_statements(id) ON DELETE RESTRICT,
  statement_item_id text NOT NULL REFERENCES credit_card_statement_items(id) ON DELETE RESTRICT,
  financial_transaction_id text NOT NULL REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_card_statement_credit_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_statement_credits_statement
  ON credit_card_statement_credits(company_id, statement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_card_statement_credits_transaction
  ON credit_card_statement_credits(company_id, financial_transaction_id, created_at);

CREATE OR REPLACE FUNCTION enforce_credit_card_statement_credit_authority()
RETURNS trigger AS $$
DECLARE
  v_statement_company text;
  v_item_company text;
  v_item_statement text;
  v_item_transaction text;
  v_transaction_company text;
BEGIN
  SELECT company_id INTO v_statement_company FROM credit_card_statements WHERE id = NEW.statement_id;
  SELECT company_id, statement_id, financial_transaction_id
    INTO v_item_company, v_item_statement, v_item_transaction
    FROM credit_card_statement_items WHERE id = NEW.statement_item_id;
  SELECT company_id INTO v_transaction_company FROM financial_transactions WHERE id = NEW.financial_transaction_id;

  IF v_statement_company IS NULL OR v_statement_company <> NEW.company_id
     OR v_item_company IS NULL OR v_item_company <> NEW.company_id
     OR v_item_statement <> NEW.statement_id
     OR v_item_transaction <> NEW.financial_transaction_id
     OR v_transaction_company IS NULL OR v_transaction_company <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card statement credit authority mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_statement_credit_authority ON credit_card_statement_credits;
CREATE TRIGGER trg_credit_card_statement_credit_authority
BEFORE INSERT OR UPDATE OF company_id, statement_id, statement_item_id, financial_transaction_id
ON credit_card_statement_credits
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_statement_credit_authority();

ALTER TABLE credit_card_statement_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_credits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access_credit_card_statement_credits ON credit_card_statement_credits;
CREATE POLICY tenant_access_credit_card_statement_credits ON credit_card_statement_credits AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_credits ON credit_card_statement_credits;
CREATE POLICY tenant_isolation_credit_card_statement_credits ON credit_card_statement_credits AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
