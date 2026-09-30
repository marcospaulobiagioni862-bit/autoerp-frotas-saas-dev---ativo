-- V2 Finance: keep additions separate from fine/interest/discount in settlement composition.
ALTER TABLE account_receivables
  ADD COLUMN IF NOT EXISTS additional_amount numeric(12,2) NOT NULL DEFAULT 0
  CHECK (additional_amount >= 0);

ALTER TABLE account_payables
  ADD COLUMN IF NOT EXISTS additional_amount numeric(12,2) NOT NULL DEFAULT 0
  CHECK (additional_amount >= 0);
