-- FINANCE-CARD-1D: fail-closed full statement payment authority.
-- The payment amount is derived from the existing TRANSFER and must settle the current balance.
CREATE OR REPLACE FUNCTION enforce_credit_card_statement_payment_authority()
RETURNS trigger AS $$
DECLARE
  v_statement_company text;
  v_statement_status text;
  v_statement_balance numeric(12,2);
  v_transaction_company text;
  v_transaction_type text;
  v_transaction_amount numeric(12,2);
  v_transaction_reversed boolean;
  v_destination_account text;
  v_card_account text;
BEGIN
  SELECT company_id, status, balance_amount
    INTO v_statement_company, v_statement_status, v_statement_balance
    FROM credit_card_statements
    WHERE id = NEW.statement_id
    FOR UPDATE;

  SELECT company_id, type, amount, is_reversed, destination_account_id
    INTO v_transaction_company, v_transaction_type, v_transaction_amount,
         v_transaction_reversed, v_destination_account
    FROM financial_transactions
    WHERE id = NEW.financial_transaction_id
    FOR UPDATE;

  SELECT p.financial_account_id INTO v_card_account
    FROM credit_card_statements s
    JOIN credit_card_profiles p ON p.id = s.credit_card_profile_id
    WHERE s.id = NEW.statement_id;

  IF v_statement_company IS NULL OR v_statement_company <> NEW.company_id
     OR v_transaction_company IS NULL OR v_transaction_company <> NEW.company_id THEN
    RAISE EXCEPTION 'credit card statement payment tenant mismatch';
  END IF;
  IF v_statement_status <> 'CLOSED' THEN
    RAISE EXCEPTION 'credit card statement must be CLOSED before full payment';
  END IF;
  IF v_transaction_type <> 'TRANSFER' OR v_transaction_reversed
     OR v_destination_account <> v_card_account THEN
    RAISE EXCEPTION 'statement payment must reference a non-reversed TRANSFER into the statement card account';
  END IF;
  IF NEW.amount <> v_transaction_amount OR NEW.amount <> v_statement_balance THEN
    RAISE EXCEPTION 'full statement payment must match transfer amount and authoritative balance';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_card_statement_payment_authority ON credit_card_statement_payments;
CREATE TRIGGER trg_credit_card_statement_payment_authority
BEFORE INSERT OR UPDATE OF company_id, statement_id, financial_transaction_id, amount
ON credit_card_statement_payments
FOR EACH ROW EXECUTE FUNCTION enforce_credit_card_statement_payment_authority();
