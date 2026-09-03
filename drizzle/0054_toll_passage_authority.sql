-- TOLL-1A: provider-neutral toll/free-flow passage foundation.
-- No provider, credential, scraping, financial title, payment, or production side effect is enabled here.

CREATE TABLE IF NOT EXISTS toll_passages (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  contract_id text,
  driver_id text,
  concessionaire text NOT NULL,
  road text NOT NULL,
  toll_point text NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date,
  status text NOT NULL,
  source text NOT NULL,
  source_reference text,
  notes text,
  idempotency_key text NOT NULL,
  created_by_user_id text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT toll_passages_amount_check CHECK (amount > 0),
  CONSTRAINT toll_passages_status_check CHECK (status IN ('PENDING','PAID','OVERDUE','CONTESTED')),
  CONSTRAINT toll_passages_source_check CHECK (source IN ('MANUAL','CSV')),
  CONSTRAINT uq_toll_passage_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_toll_passages_company_vehicle_occurred
  ON toll_passages(company_id, vehicle_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_toll_passages_company_driver_occurred
  ON toll_passages(company_id, driver_id, occurred_at DESC, id DESC)
  WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_toll_passages_company_contract_occurred
  ON toll_passages(company_id, contract_id, occurred_at DESC, id DESC)
  WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_toll_passages_company_status_due
  ON toll_passages(company_id, status, due_date, id);

ALTER TABLE toll_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE toll_passages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_toll_passages ON toll_passages;
CREATE POLICY tenant_isolation_toll_passages ON toll_passages
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
