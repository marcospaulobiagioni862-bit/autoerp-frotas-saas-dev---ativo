-- SECURITY-2I1B: server-authoritative Vehicle KM history.
CREATE TABLE IF NOT EXISTS vehicle_km_records (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  driver_id text,
  contract_id text,
  km_value integer NOT NULL,
  record_date text NOT NULL,
  reading_type text NOT NULL,
  photo_url text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_km_records_km_nonnegative CHECK (km_value >= 0),
  CONSTRAINT vehicle_km_records_reading_type CHECK (reading_type IN ('CHECK_IN','CHECK_OUT','PERIODIC','MAINTENANCE'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_km_company_vehicle_date
  ON vehicle_km_records(company_id, vehicle_id, record_date DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_km_exact_reading
  ON vehicle_km_records(company_id, vehicle_id, km_value, reading_type, record_date);

-- Deterministic bootstrap record for Vehicles that already exist on the server.
INSERT INTO vehicle_km_records (
  id, company_id, vehicle_id, driver_id, contract_id, km_value,
  record_date, reading_type, notes, created_at
)
SELECT
  'km-init-' || md5(v.company_id || ':' || v.id),
  v.company_id,
  v.id,
  v.current_driver_id,
  v.current_contract_id,
  v.current_km,
  to_char(v.created_at, 'YYYY-MM-DD'),
  'PERIODIC',
  'Registro inicial migrado da autoridade Vehicle server-side',
  v.created_at
FROM vehicles v
ON CONFLICT DO NOTHING;

ALTER TABLE vehicle_km_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_km_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vehicle_km ON vehicle_km_records;
CREATE POLICY tenant_isolation_vehicle_km ON vehicle_km_records
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
