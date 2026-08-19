-- SECURITY-2H1-v2: server-authoritative driver health/emergency data.
-- General Driver authority is still being migrated; driver_id intentionally has no FK in this wave.
CREATE TABLE IF NOT EXISTS driver_health_profiles (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  driver_id text NOT NULL,
  blood_type text,
  allergies text,
  relevant_conditions text,
  continuous_medications text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_notes text,
  last_update_date timestamp,
  responsible_user text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT driver_health_profiles_company_driver_unique UNIQUE(company_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_driver_health_profiles_company ON driver_health_profiles USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_driver_health_profiles_driver ON driver_health_profiles USING btree (driver_id);
ALTER TABLE driver_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_health_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_driver_health_profiles ON driver_health_profiles;
CREATE POLICY tenant_access_driver_health_profiles ON driver_health_profiles AS PERMISSIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_driver_health_profiles ON driver_health_profiles;
CREATE POLICY tenant_isolation_driver_health_profiles ON driver_health_profiles AS RESTRICTIVE FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
