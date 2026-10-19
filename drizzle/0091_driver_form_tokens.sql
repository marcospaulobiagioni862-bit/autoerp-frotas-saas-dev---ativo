-- PH-057 / PH-059: Driver complementary form tokens and LGPD health consent
CREATE TABLE IF NOT EXISTS driver_form_tokens (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  driver_id text NOT NULL,
  token text NOT NULL UNIQUE,
  created_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  opened_at timestamptz,
  opened_ip text,
  consumed_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_form_tokens_company ON driver_form_tokens (company_id);
CREATE INDEX IF NOT EXISTS idx_driver_form_tokens_driver ON driver_form_tokens (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_form_tokens_token ON driver_form_tokens (token);

ALTER TABLE driver_health_profiles ADD COLUMN IF NOT EXISTS controlled_medications text;
ALTER TABLE driver_health_profiles ADD COLUMN IF NOT EXISTS lgpd_consent_at timestamptz;
ALTER TABLE driver_health_profiles ADD COLUMN IF NOT EXISTS lgpd_consent_version text;

ALTER TABLE driver_form_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_form_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_driver_form_tokens ON driver_form_tokens;
CREATE POLICY tenant_isolation_driver_form_tokens ON driver_form_tokens
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
