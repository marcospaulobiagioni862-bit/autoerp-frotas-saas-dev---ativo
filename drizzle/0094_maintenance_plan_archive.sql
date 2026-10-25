-- Security & Operational lifecycle: logical archive for vehicle maintenance plans
ALTER TABLE maintenance_plans DROP CONSTRAINT IF EXISTS maintenance_plans_status_chk;
ALTER TABLE maintenance_plans ADD CONSTRAINT maintenance_plans_status_chk CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','ARCHIVED'));
ALTER TABLE maintenance_plans ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE maintenance_plans ADD COLUMN IF NOT EXISTS removed_by text;
ALTER TABLE maintenance_plans ADD COLUMN IF NOT EXISTS removal_reason text;
