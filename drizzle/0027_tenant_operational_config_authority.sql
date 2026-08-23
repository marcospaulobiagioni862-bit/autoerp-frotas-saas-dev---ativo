-- SECURITY-2Q2: authoritative production tenant operational profile.
-- Login-critical companies.document remains owned by companies and read-only in this wave.

CREATE TABLE IF NOT EXISTS tenant_operational_configs (
  company_id text PRIMARY KEY NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  currency text NOT NULL DEFAULT 'BRL',
  max_vehicles_limit integer NOT NULL DEFAULT 5000,
  max_drivers_limit integer NOT NULL DEFAULT 10000,
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CONSTRAINT tenant_operational_configs_company_fk
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT tenant_operational_configs_timezone_nonempty
    CHECK (length(btrim(timezone)) > 0),
  CONSTRAINT tenant_operational_configs_currency_brl
    CHECK (currency = 'BRL'),
  CONSTRAINT tenant_operational_configs_vehicle_limit
    CHECK (max_vehicles_limit >= 0),
  CONSTRAINT tenant_operational_configs_driver_limit
    CHECK (max_drivers_limit >= 0)
);

ALTER TABLE tenant_operational_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_operational_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_access_tenant_operational_configs ON tenant_operational_configs;
CREATE POLICY tenant_access_tenant_operational_configs
ON tenant_operational_configs
AS PERMISSIVE
FOR ALL
USING (company_id = current_setting('app.current_tenant', true))
WITH CHECK (company_id = current_setting('app.current_tenant', true));
