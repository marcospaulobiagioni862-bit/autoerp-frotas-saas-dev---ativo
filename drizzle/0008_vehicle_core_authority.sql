-- SECURITY-2I1A-v2: Vehicle core server authority foundation.
-- I1B owns KM history/recordKm and the atomic Fleet UI switchover.

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS year_fabrication integer NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS year_model integer NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassis text NOT NULL DEFAULT '';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_km integer NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS next_maintenance_km integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type text NOT NULL DEFAULT 'Flex';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Padrão';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS acquisition_value numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_value numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rental_value_base numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_driver_id text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_contract_id text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_current_km_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_current_km_nonnegative CHECK (current_km >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_next_maintenance_km_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_next_maintenance_km_nonnegative CHECK (next_maintenance_km IS NULL OR next_maintenance_km >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_acquisition_value_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_acquisition_value_nonnegative CHECK (acquisition_value >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_current_value_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_current_value_nonnegative CHECK (current_value >= 0);
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_rental_value_base_nonnegative;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_rental_value_base_nonnegative CHECK (rental_value_base >= 0);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_ve ON vehicles;
CREATE POLICY tenant_isolation_ve ON vehicles
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
