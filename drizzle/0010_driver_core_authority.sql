-- SECURITY-2I2: server-authoritative Driver core.
-- Expand the existing drivers table in place; preserve SECURITY-2H1 health data.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rg text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS birth_date text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_street text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_complement text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_neighborhood text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_city text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_state text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address_zip_code text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cnh_category text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cnh_expiration text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS app_platforms text[];
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_archived boolean;

UPDATE drivers
SET status = CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END
WHERE status IS NULL;

UPDATE drivers SET app_platforms = ARRAY[]::text[] WHERE app_platforms IS NULL;
UPDATE drivers SET is_archived = false WHERE is_archived IS NULL;

ALTER TABLE drivers ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE drivers ALTER COLUMN status SET NOT NULL;
ALTER TABLE drivers ALTER COLUMN app_platforms SET DEFAULT ARRAY[]::text[];
ALTER TABLE drivers ALTER COLUMN app_platforms SET NOT NULL;
ALTER TABLE drivers ALTER COLUMN is_archived SET DEFAULT false;
ALTER TABLE drivers ALTER COLUMN is_archived SET NOT NULL;

ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
ALTER TABLE drivers ADD CONSTRAINT drivers_status_check
  CHECK (status IN ('ACTIVE','INACTIVE','PENDING','PENDING_DOCS','BLOCKED','ARCHIVED'));

-- Existing tenant-scoped CPF/CNH uniqueness from the base schema is preserved.
CREATE INDEX IF NOT EXISTS idx_drv_company_status ON drivers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_drv_company_archived ON drivers(company_id, is_archived);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dr ON drivers;
CREATE POLICY tenant_isolation_dr ON drivers
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
