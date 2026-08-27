-- FINANCE-CARD-1B2: authoritative credit-card profile/statement persistence.
-- Card purchases remain normal EXPENSE transactions on CREDIT_CARD accounts.
-- Closing a statement is non-cash and MUST NOT create a financial transaction.
-- Statement payments only reference an existing authoritative TRANSFER into the card account.

CREATE TABLE IF NOT EXISTS credit_card_profiles (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  financial_account_id text NOT NULL,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  closing_day integer NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id text NOT NULL,
  updated_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (company_id, financial_account_id)
);

CREATE TABLE IF NOT EXISTS credit_card_statements (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  credit_card_profile_id text NOT NULL REFERENCES credit_card_profiles(id) ON DELETE RESTRICT,
  cycle_ref text NOT NULL,
  closing_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','PARTIALLY_PAID','PAID','CANCELLED')),
  original_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  adjustment_amount numeric(12,2) NOT NULL DEFAULT 0,
  interest_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  fine_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
  closed_at timestamp,
  closed_by_id text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id text NOT NULL,
  updated_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_card_statement_cycle UNIQUE (company_id, credit_card_profile_id, cycle_ref),
  CONSTRAINT ck_credit_card_statement_dates CHECK (due_date >= closing_date),
  CONSTRAINT ck_credit_card_statement_close_metadata CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by_id IS NULL)
    OR (status <> 'OPEN')
  )
);

CREATE TABLE IF NOT EXISTS credit_card_statement_items (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  statement_id text NOT NULL REFERENCES credit_card_statements(id) ON DELETE RESTRICT,
  financial_transaction_id text NOT NULL REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  payable_id text,
  origin_type text,
  origin_id text,
  original_amount numeric(12,2) NOT NULL CHECK (original_amount >= 0),
  adjustment_amount numeric(12,2) NOT NULL DEFAULT 0,
  final_amount numeric(12,2) NOT NULL CHECK (final_amount >= 0),
  created_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_card_statement_item_transaction UNIQUE (company_id, financial_transaction_id),
  CONSTRAINT ck_credit_card_statement_item_amount CHECK (final_amount = original_amount + adjustment_amount)
);

CREATE TABLE IF NOT EXISTS credit_card_statement_payments (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  statement_id text NOT NULL REFERENCES credit_card_statements(id) ON DELETE RESTRICT,
  financial_transaction_id text NOT NULL REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  idempotency_key text NOT NULL,
  created_by_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_card_statement_payment_transfer UNIQUE (company_id, financial_transaction_id),
  CONSTRAINT uq_credit_card_statement_payment_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_profiles_company_active
  ON credit_card_profiles(company_id, active);
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_company_due
  ON credit_card_statements(company_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_credit_card_statement_items_statement
  ON credit_card_statement_items(company_id, statement_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_statement_payments_statement
  ON credit_card_statement_payments(company_id, statement_id, created_at);

-- Enforce same-tenant references and preserve the CARD-B1 cash semantics at the DB boundary.
CREATE OR REPLACE FUNCTION enforce_credit_card_profile_account_authority()
RETURNS trigger AS $$
DECLARE
  v_company_id text;
  v_type text;
BEGIN
  SELECT company_id, type INTO v_company_id, v_type
  FROM financial_accounts
  WHERE id = NEW.financial_account_id;

  IF v_company_id IS NULL OR v_company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card profile account tenant mismatch';
  END IF;
  IF v_type <> 'CREDIT_CARD' THEN
    RAISE EXCEPTION 'credit card profile requires CREDIT_CARD financial account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_profile_account_authority ON credit_card_profiles;
CREATE TRIGGER trg_credit_card_profile_account_authority
BEFORE INSERT OR UPDATE OF company_id, financial_account_id ON credit_card_profiles
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_profile_account_authority();

CREATE OR REPLACE FUNCTION enforce_credit_card_statement_authority()
RETURNS trigger AS $$
DECLARE
  v_company_id text;
BEGIN
  SELECT company_id INTO v_company_id
  FROM credit_card_profiles
  WHERE id = NEW.credit_card_profile_id;
  IF v_company_id IS NULL OR v_company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card statement profile tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_statement_authority ON credit_card_statements;
CREATE TRIGGER trg_credit_card_statement_authority
BEFORE INSERT OR UPDATE OF company_id, credit_card_profile_id ON credit_card_statements
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_statement_authority();

CREATE OR REPLACE FUNCTION enforce_credit_card_statement_item_authority()
RETURNS trigger AS $$
DECLARE
  v_statement_company text;
  v_transaction_company text;
  v_transaction_account text;
  v_card_account text;
BEGIN
  SELECT company_id INTO v_statement_company FROM credit_card_statements WHERE id = NEW.statement_id;
  SELECT company_id, financial_account_id INTO v_transaction_company, v_transaction_account
    FROM financial_transactions WHERE id = NEW.financial_transaction_id;
  SELECT p.financial_account_id INTO v_card_account
    FROM credit_card_statements s
    JOIN credit_card_profiles p ON p.id = s.credit_card_profile_id
    WHERE s.id = NEW.statement_id;

  IF v_statement_company IS NULL OR v_statement_company <> NEW.company_id
     OR v_transaction_company IS NULL OR v_transaction_company <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card statement item tenant mismatch';
  END IF;
  IF v_transaction_account <> v_card_account THEN
    RAISE EXCEPTION 'statement item transaction must belong to the statement card account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_statement_item_authority ON credit_card_statement_items;
CREATE TRIGGER trg_credit_card_statement_item_authority
BEFORE INSERT OR UPDATE OF company_id, statement_id, financial_transaction_id ON credit_card_statement_items
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_statement_item_authority();

CREATE OR REPLACE FUNCTION enforce_credit_card_statement_payment_authority()
RETURNS trigger AS $$
DECLARE
  v_statement_company text;
  v_transaction_company text;
  v_transaction_type text;
  v_destination_account text;
  v_card_account text;
BEGIN
  SELECT company_id INTO v_statement_company FROM credit_card_statements WHERE id = NEW.statement_id;
  SELECT company_id, type, destination_account_id
    INTO v_transaction_company, v_transaction_type, v_destination_account
    FROM financial_transactions WHERE id = NEW.financial_transaction_id;
  SELECT p.financial_account_id INTO v_card_account
    FROM credit_card_statements s
    JOIN credit_card_profiles p ON p.id = s.credit_card_profile_id
    WHERE s.id = NEW.statement_id;

  IF v_statement_company IS NULL OR v_statement_company <> NEW.company_id
     OR v_transaction_company IS NULL OR v_transaction_company <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card statement payment tenant mismatch';
  END IF;
  IF v_transaction_type <> 'TRANSFER' OR v_destination_account <> v_card_account THEN
    RAISE EXCEPTION 'statement payment must reference an existing TRANSFER into the statement card account';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_statement_payment_authority ON credit_card_statement_payments;
CREATE TRIGGER trg_credit_card_statement_payment_authority
BEFORE INSERT OR UPDATE OF company_id, statement_id, financial_transaction_id ON credit_card_statement_payments
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_statement_payment_authority();

ALTER TABLE credit_card_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statements FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_items FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access_credit_card_profiles ON credit_card_profiles;
CREATE POLICY tenant_access_credit_card_profiles ON credit_card_profiles AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_credit_card_profiles ON credit_card_profiles;
CREATE POLICY tenant_isolation_credit_card_profiles ON credit_card_profiles AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_access_credit_card_statements ON credit_card_statements;
CREATE POLICY tenant_access_credit_card_statements ON credit_card_statements AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_credit_card_statements ON credit_card_statements;
CREATE POLICY tenant_isolation_credit_card_statements ON credit_card_statements AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_access_credit_card_statement_items ON credit_card_statement_items;
CREATE POLICY tenant_access_credit_card_statement_items ON credit_card_statement_items AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_items ON credit_card_statement_items;
CREATE POLICY tenant_isolation_credit_card_statement_items ON credit_card_statement_items AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));

DROP POLICY IF EXISTS tenant_access_credit_card_statement_payments ON credit_card_statement_payments;
CREATE POLICY tenant_access_credit_card_statement_payments ON credit_card_statement_payments AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_credit_card_statement_payments ON credit_card_statement_payments;
CREATE POLICY tenant_isolation_credit_card_statement_payments ON credit_card_statement_payments AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
