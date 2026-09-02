CREATE TABLE IF NOT EXISTS vehicle_lifecycle_events (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  action text NOT NULL,
  effective_date text NOT NULL,
  reason text NOT NULL,
  disposal_type text,
  sale_value numeric(12,2),
  buyer_name text,
  buyer_document text,
  final_km integer,
  notes text,
  created_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_lifecycle_action_check CHECK (action IN ('SOLD','ARCHIVED','RESTORED')),
  CONSTRAINT vehicle_lifecycle_sale_value_check CHECK (sale_value IS NULL OR sale_value >= 0),
  CONSTRAINT vehicle_lifecycle_final_km_check CHECK (final_km IS NULL OR final_km >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_lifecycle_company_vehicle
  ON vehicle_lifecycle_events(company_id, vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_lifecycle_company_action
  ON vehicle_lifecycle_events(company_id, action, created_at DESC);

ALTER TABLE vehicle_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_lifecycle_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_lifecycle_events_tenant_policy ON vehicle_lifecycle_events;
CREATE POLICY vehicle_lifecycle_events_tenant_policy ON vehicle_lifecycle_events
  USING (company_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (company_id = NULLIF(current_setting('app.current_tenant', true), ''));
