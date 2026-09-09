-- Enrich preventive maintenance library with category and default action metadata.
ALTER TABLE maintenance_plan_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'INSPECT';

ALTER TABLE maintenance_plan_templates
  DROP CONSTRAINT IF EXISTS maintenance_plan_templates_category_chk,
  DROP CONSTRAINT IF EXISTS maintenance_plan_templates_action_type_chk;

ALTER TABLE maintenance_plan_templates
  ADD CONSTRAINT maintenance_plan_templates_category_chk CHECK (
    category IN ('ENGINE','COOLING','BRAKES','TIRES_WHEELS','SUSPENSION_STEERING','TRANSMISSION','ELECTRICAL','AIR_CONDITIONING','SAFETY','GENERAL')
  ),
  ADD CONSTRAINT maintenance_plan_templates_action_type_chk CHECK (
    action_type IN ('REPLACE','INSPECT','TEST','MEASURE','LUBRICATE','SERVICE')
  );

UPDATE maintenance_plan_templates SET category='ENGINE', action_type='REPLACE'
  WHERE code IN ('OIL_CHANGE','TIMING_BELT','FILTER_REPLACEMENT');
UPDATE maintenance_plan_templates SET category='COOLING', action_type='INSPECT'
  WHERE code='COOLING_SYSTEM';
UPDATE maintenance_plan_templates SET category='TIRES_WHEELS', action_type='SERVICE'
  WHERE code IN ('TIRE_ROTATION','ALIGNMENT_BALANCING');
UPDATE maintenance_plan_templates SET category='TIRES_WHEELS', action_type='INSPECT'
  WHERE code='TIRE_REPLACEMENT';

CREATE INDEX IF NOT EXISTS idx_maintenance_plan_templates_category
  ON maintenance_plan_templates(company_id, category, action_type, active, code);
