-- FINANCE-CARD-1B2: authoritative credit-card profile and statement persistence.
-- This migration creates no financial transaction and performs no balance mutation.

ALTER TABLE financial_accounts
  ADD CONSTRAINT uq_financial_accounts_company_id UNIQUE (company_id, id);
ALTER TABLE financial_transactions
  ADD CONSTRAINT uq_financial_transactions_company_id UNIQUE (company_id, id);
ALTER TABLE account_payables
  ADD CONSTRAINT uq_account_payables_company_id UNIQUE (company_id, id);

CREATE TABLE credit_card_profiles (
  company_id text NOT NULL REFERENCES companies(id),
  financial_account_id text NOT NULL,
  credit_limit numeric(14,2) NOT NULL,
  closing_day integer NOT NULL,
  due_day integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, financial_account_id),
  CONSTRAINT credit_card_profile_account_fk FOREIGN KEY (company_id, financial_account_id)
    REFERENCES financial_accounts(company_id, id),
  CONSTRAINT credit_card_profile_limit_check CHECK (credit_limit >= 0),
  CONSTRAINT credit_card_profile_closing_day_check CHECK (closing_day BETWEEN 1 AND 31),
  CONSTRAINT credit_card_profile_due_day_check CHECK (due_day BETWEEN 1 AND 31),
  CONSTRAINT credit_card_profile_version_check CHECK (version > 0)
);

CREATE TABLE credit_card_statements (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  financial_account_id text NOT NULL,
  cycle_ref text NOT NULL,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  closing_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  original_amount numeric(14,2) NOT NULL DEFAULT 0,
  adjustments_amount numeric(14,2) NOT NULL DEFAULT 0,
  interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  fine_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  balance_amount numeric(14,2) NOT NULL DEFAULT 0,
  closed_at timestamptz,
  paid_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  idempotency_key text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT credit_card_statement_profile_fk FOREIGN KEY (company_id, financial_account_id)
    REFERENCES credit_card_profiles(company_id, financial_account_id),
  CONSTRAINT credit_card_statement_cycle_unique UNIQUE (company_id, financial_account_id, cycle_ref),
  CONSTRAINT credit_card_statement_idempotency_unique UNIQUE (company_id, idempotency_key),
  CONSTRAINT credit_card_statement_status_check CHECK (status IN ('OPEN','CLOSED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED')),
  CONSTRAINT credit_card_statement_cycle_check CHECK (cycle_start <= cycle_end AND cycle_end <= closing_date AND closing_date <= due_date),
  CONSTRAINT credit_card_statement_amounts_check CHECK (
    original_amount >= 0 AND interest_amount >= 0 AND fine_amount >= 0
    AND discount_amount >= 0 AND paid_amount >= 0 AND balance_amount >= 0
  ),
  CONSTRAINT credit_card_statement_balance_check CHECK (
    balance_amount = original_amount + adjustments_amount + interest_amount + fine_amount - discount_amount - paid_amount
  ),
  CONSTRAINT credit_card_statement_version_check CHECK (version > 0)
);

CREATE TABLE credit_card_statement_items (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  statement_id text NOT NULL,
  financial_transaction_id text NOT NULL,
  payable_id text,
  amount numeric(14,2) NOT NULL,
  competence_date date NOT NULL,
  purchase_date date NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  reversal_item_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT credit_card_item_statement_fk FOREIGN KEY (company_id, statement_id)
    REFERENCES credit_card_statements(company_id, id),
  CONSTRAINT credit_card_item_transaction_fk FOREIGN KEY (company_id, financial_transaction_id)
    REFERENCES financial_transactions(company_id, id),
  CONSTRAINT credit_card_item_payable_fk FOREIGN KEY (company_id, payable_id)
    REFERENCES account_payables(company_id, id),
  CONSTRAINT credit_card_item_transaction_unique UNIQUE (company_id, financial_transaction_id),
  CONSTRAINT credit_card_item_amount_check CHECK (amount > 0),
  CONSTRAINT credit_card_item_status_check CHECK (status IN ('ACTIVE','REVERSED'))
);

CREATE TABLE credit_card_statement_payments (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  statement_id text NOT NULL,
  transfer_transaction_id text NOT NULL,
  amount numeric(14,2) NOT NULL,
  idempotency_key text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT credit_card_payment_statement_fk FOREIGN KEY (company_id, statement_id)
    REFERENCES credit_card_statements(company_id, id),
  CONSTRAINT credit_card_payment_transaction_fk FOREIGN KEY (company_id, transfer_transaction_id)
    REFERENCES financial_transactions(company_id, id),
  CONSTRAINT credit_card_payment_transfer_unique UNIQUE (company_id, transfer_transaction_id),
  CONSTRAINT credit_card_payment_idempotency_unique UNIQUE (company_id, idempotency_key),
  CONSTRAINT credit_card_payment_amount_check CHECK (amount > 0)
);

CREATE INDEX idx_credit_card_statements_due
  ON credit_card_statements(company_id, status, due_date);
CREATE INDEX idx_credit_card_items_statement
  ON credit_card_statement_items(company_id, statement_id, purchase_date);
CREATE INDEX idx_credit_card_payments_statement
  ON credit_card_statement_payments(company_id, statement_id, created_at);

ALTER TABLE credit_card_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statements FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_items FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_statement_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access_credit_card_profiles ON credit_card_profiles
  FOR ALL USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_access_credit_card_statements ON credit_card_statements
  FOR ALL USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_access_credit_card_statement_items ON credit_card_statement_items
  FOR ALL USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
CREATE POLICY tenant_access_credit_card_statement_payments ON credit_card_statement_payments
  FOR ALL USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
