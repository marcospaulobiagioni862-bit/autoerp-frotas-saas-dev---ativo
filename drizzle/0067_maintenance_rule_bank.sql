-- Configurable maintenance alert rule bank
CREATE TABLE IF NOT EXISTS maintenance_rule_configs (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  scope_type text NOT NULL DEFAULT 'GLOBAL',
  scope_key text,
  warning_km integer NOT NULL DEFAULT 1000,
  urgent_km integer NOT NULL DEFAULT 500,
  warning_days integer NOT NULL DEFAULT 15,
  urgent_days integer NOT NULL DEFAULT 7,
  tolerance_km integer NOT NULL DEFAULT 0,
  tolerance_days integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_rule_scope_chk CHECK (scope_type IN ('GLOBAL','CATEGORY','MODEL','MAINTENANCE_TYPE','VEHICLE')),
  CONSTRAINT maintenance_rule_scope_key_chk CHECK ((scope_type='GLOBAL' AND scope_key IS NULL) OR (scope_type<>'GLOBAL' AND scope_key IS NOT NULL AND btrim(scope_key)<>'')),
  CONSTRAINT maintenance_rule_km_chk CHECK (warning_km >= 0 AND urgent_km >= 0 AND warning_km >= urgent_km),
  CONSTRAINT maintenance_rule_days_chk CHECK (warning_days >= 0 AND urgent_days >= 0 AND warning_days >= urgent_days),
  CONSTRAINT maintenance_rule_tolerance_chk CHECK (tolerance_km >= 0 AND tolerance_days >= 0),
  CONSTRAINT maintenance_rule_effective_chk CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_rule_scope
  ON maintenance_rule_configs(company_id, scope_type, COALESCE(scope_key,''));

CREATE INDEX IF NOT EXISTS idx_maintenance_rule_active
  ON maintenance_rule_configs(company_id, active, scope_type, scope_key, effective_from);

ALTER TABLE maintenance_rule_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_rule_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_maintenance_rule_configs ON maintenance_rule_configs;
CREATE POLICY tenant_isolation_maintenance_rule_configs ON maintenance_rule_configs FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
