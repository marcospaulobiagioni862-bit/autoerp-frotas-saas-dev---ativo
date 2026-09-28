-- NULL preserves the legacy percentage modality; a value selects fixed BRL/day.
ALTER TABLE finance_late_charge_rules
  ADD COLUMN IF NOT EXISTS daily_interest_amount numeric(12,2)
  CHECK (daily_interest_amount >= 0);
