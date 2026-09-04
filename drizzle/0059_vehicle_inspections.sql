CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  driver_id text,
  contract_id text,
  inspection_type text NOT NULL,
  inspection_date timestamptz NOT NULL,
  odometer integer NOT NULL,
  fuel_level integer NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_inspection_type_check CHECK (inspection_type IN ('ENTRY','EXIT')),
  CONSTRAINT vehicle_inspection_odometer_check CHECK (odometer >= 0),
  CONSTRAINT vehicle_inspection_fuel_check CHECK (fuel_level >= 0 AND fuel_level <= 100)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspection_company_vehicle_date
  ON vehicle_inspections(company_id, vehicle_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspection_company_contract
  ON vehicle_inspections(company_id, contract_id)
  WHERE contract_id IS NOT NULL;

ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_inspections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vehicle_inspections ON vehicle_inspections;
CREATE POLICY tenant_isolation_vehicle_inspections ON vehicle_inspections
  AS PERMISSIVE FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
