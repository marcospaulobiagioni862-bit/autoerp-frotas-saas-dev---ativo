-- MAINT-FIN-1: financial instructions captured at work-order save and linked to Accounts Payable.
CREATE TABLE IF NOT EXISTS work_order_financial_components (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  work_order_id text NOT NULL REFERENCES work_orders(id),
  kind text NOT NULL,
  supplier_id text,
  category_id text NOT NULL,
  payment_method_id text NOT NULL,
  payment_condition text NOT NULL,
  installments_count integer NOT NULL DEFAULT 1,
  first_due_date date NOT NULL,
  gross_amount numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL,
  has_invoice boolean NOT NULL DEFAULT false,
  invoice_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_finance_kind_chk CHECK (kind IN ('PARTS','SERVICES')),
  CONSTRAINT work_order_finance_condition_chk CHECK (payment_condition IN ('CASH','INSTALLMENTS')),
  CONSTRAINT work_order_finance_installments_chk CHECK (installments_count BETWEEN 1 AND 60),
  CONSTRAINT work_order_finance_amounts_chk CHECK (gross_amount >= 0 AND discount_amount >= 0 AND discount_amount <= gross_amount AND net_amount = gross_amount - discount_amount),
  CONSTRAINT work_order_finance_company_kind_unique UNIQUE(company_id,work_order_id,kind)
);
CREATE INDEX IF NOT EXISTS idx_work_order_finance_order ON work_order_financial_components(company_id,work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_finance_supplier ON work_order_financial_components(company_id,supplier_id) WHERE supplier_id IS NOT NULL;
ALTER TABLE work_order_financial_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_financial_components FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_work_order_financial_components ON work_order_financial_components;
CREATE POLICY tenant_isolation_work_order_financial_components ON work_order_financial_components
  FOR ALL USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
