-- Maintenance global plan template authority
CREATE TABLE IF NOT EXISTS maintenance_plan_templates (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  maintenance_type text NOT NULL,
  interval_km integer,
  interval_days integer,
  priority text NOT NULL DEFAULT 'MEDIUM',
  estimated_cost numeric(12,2),
  active boolean NOT NULL DEFAULT false,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_plan_templates_interval_km_chk CHECK (interval_km IS NULL OR interval_km > 0),
  CONSTRAINT maintenance_plan_templates_interval_days_chk CHECK (interval_days IS NULL OR interval_days > 0),
  CONSTRAINT maintenance_plan_templates_active_interval_chk CHECK (active = false OR interval_km IS NOT NULL OR interval_days IS NOT NULL),
  CONSTRAINT maintenance_plan_templates_priority_chk CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT maintenance_plan_templates_cost_chk CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  CONSTRAINT maintenance_plan_templates_code_chk CHECK (btrim(code) <> ''),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_plan_templates_company_active
  ON maintenance_plan_templates(company_id, active, code);

ALTER TABLE maintenance_plans ADD COLUMN IF NOT EXISTS template_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_plan_vehicle_template
  ON maintenance_plans(company_id, vehicle_id, template_id)
  WHERE template_id IS NOT NULL;

ALTER TABLE maintenance_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plan_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_maintenance_plan_templates ON maintenance_plan_templates;
CREATE POLICY tenant_isolation_maintenance_plan_templates ON maintenance_plan_templates FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
