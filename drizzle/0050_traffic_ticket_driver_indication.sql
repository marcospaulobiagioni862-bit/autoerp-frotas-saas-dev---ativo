CREATE TABLE IF NOT EXISTS traffic_ticket_driver_indications (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  traffic_ticket_id text NOT NULL,
  driver_id text,
  status text NOT NULL DEFAULT 'PENDING',
  indication_deadline date,
  notes text,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_traffic_ticket_driver_indication_status CHECK (
    status IN ('PENDING','COMMUNICATED','DOCUMENTS_SENT','SIGNED','INDICATED','COMPLETED','APPEAL','CANCELLED')
  ),
  CONSTRAINT uq_traffic_ticket_driver_indication UNIQUE (company_id, traffic_ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_traffic_ticket_driver_indications_company_status_deadline
  ON traffic_ticket_driver_indications(company_id, status, indication_deadline);

ALTER TABLE traffic_ticket_driver_indications ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_ticket_driver_indications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_traffic_ticket_driver_indications ON traffic_ticket_driver_indications;
CREATE POLICY tenant_isolation_traffic_ticket_driver_indications ON traffic_ticket_driver_indications
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
