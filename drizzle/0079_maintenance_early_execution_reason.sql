-- V2: preserve the justification for a preventive item executed before its configured KM/date.
-- Historical PREVENTIVA_ANTECIPADA rows remain valid even when they predate this field.
ALTER TABLE maintenance_work_order_plan_executions
  ADD COLUMN IF NOT EXISTS early_reason text;
