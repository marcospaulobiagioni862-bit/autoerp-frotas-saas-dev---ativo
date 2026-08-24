-- SECURITY-2Q2: minimum production tenant profile/configuration authority.

CREATE TABLE IF NOT EXISTS tenant_operational_configs (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  currency text NOT NULL DEFAULT 'BRL',
  max_vehicles_limit integer NOT NULL DEFAULT 500,
  max_drivers_limit integer NOT NULL DEFAULT 1000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CONSTRAINT tenant_config_timezone_check CHECK (length(timezone) BETWEEN 1 AND 100),
  CONSTRAINT tenant_config_currency_check CHECK (currency = 'BRL'),
  CONSTRAINT tenant_config_vehicle_limit_check CHECK (max_vehicles_limit BETWEEN 0 AND 100000),
  CONSTRAINT tenant_config_driver_limit_check CHECK (max_drivers_limit BETWEEN 0 AND 200000)
);

ALTER TABLE tenant_operational_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_operational_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_operational_config ON tenant_operational_configs;
CREATE POLICY tenant_isolation_operational_config ON tenant_operational_configs
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

