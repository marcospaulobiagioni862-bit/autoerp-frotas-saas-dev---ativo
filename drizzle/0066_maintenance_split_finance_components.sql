-- MAINT-FIN-2: split services and labor into independent financial components.
ALTER TABLE work_order_financial_components
  DROP CONSTRAINT IF EXISTS work_order_finance_kind_chk;

ALTER TABLE work_order_financial_components
  ADD CONSTRAINT work_order_finance_kind_chk
  CHECK (kind IN ('PARTS','SERVICES','LABOR'));
