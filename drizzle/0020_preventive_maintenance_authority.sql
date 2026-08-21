-- SECURITY-2J2 — preventive maintenance, oil and tire server authority

CREATE TABLE IF NOT EXISTS maintenance_plans (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  name text NOT NULL,
  maintenance_type text NOT NULL,
  interval_km integer,
  interval_days integer,
  last_execution_km integer,
  last_execution_date date,
  next_due_km integer,
  next_due_date date,
  priority text NOT NULL DEFAULT 'MEDIUM',
  estimated_cost numeric(12,2),
  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,
  last_work_order_id text,
  cycle_sequence integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_plans_interval_km_chk CHECK (interval_km IS NULL OR interval_km > 0),
  CONSTRAINT maintenance_plans_interval_days_chk CHECK (interval_days IS NULL OR interval_days > 0),
  CONSTRAINT maintenance_plans_active_interval_chk CHECK (status <> 'ACTIVE' OR interval_km IS NOT NULL OR interval_days IS NOT NULL),
  CONSTRAINT maintenance_plans_last_km_chk CHECK (last_execution_km IS NULL OR last_execution_km >= 0),
  CONSTRAINT maintenance_plans_next_km_chk CHECK (next_due_km IS NULL OR next_due_km >= 0),
  CONSTRAINT maintenance_plans_priority_chk CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT maintenance_plans_cost_chk CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  CONSTRAINT maintenance_plans_status_chk CHECK (status IN ('ACTIVE','PAUSED','COMPLETED')),
  CONSTRAINT maintenance_plans_cycle_chk CHECK (cycle_sequence >= 0)
);
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_company_vehicle ON maintenance_plans(company_id,vehicle_id,status);
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_due_date ON maintenance_plans(company_id,status,next_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_due_km ON maintenance_plans(company_id,status,next_due_km);

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS maintenance_plan_id text;
CREATE INDEX IF NOT EXISTS idx_work_orders_maintenance_plan ON work_orders(company_id,maintenance_plan_id) WHERE maintenance_plan_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS oil_change_records (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  work_order_id text,
  km integer NOT NULL,
  date date NOT NULL,
  oil_type text NOT NULL,
  oil_brand text NOT NULL,
  quantity numeric(10,3) NOT NULL,
  filter_changed boolean NOT NULL DEFAULT false,
  next_km integer NOT NULL,
  next_date date,
  supplier_id text,
  attachment_id text,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oil_change_km_chk CHECK (km >= 0),
  CONSTRAINT oil_change_quantity_chk CHECK (quantity > 0),
  CONSTRAINT oil_change_next_km_chk CHECK (next_km > km),
  CONSTRAINT oil_change_next_date_chk CHECK (next_date IS NULL OR next_date >= date)
);
CREATE INDEX IF NOT EXISTS idx_oil_change_company_vehicle ON oil_change_records(company_id,vehicle_id,date DESC,km DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oil_change_work_order ON oil_change_records(company_id,work_order_id) WHERE work_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tire_records (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  vehicle_id text NOT NULL,
  position text NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  measure text,
  serial_number text,
  installation_date date NOT NULL,
  installation_km integer NOT NULL,
  tread_depth numeric(8,2),
  status text NOT NULL DEFAULT 'ACTIVE',
  last_rotation_date date,
  last_rotation_km integer,
  next_rotation_date date,
  next_rotation_km integer,
  removal_date date,
  removal_km integer,
  removal_reason text,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  supplier_id text,
  attachment_id text,
  notes text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tire_install_km_chk CHECK (installation_km >= 0),
  CONSTRAINT tire_tread_chk CHECK (tread_depth IS NULL OR tread_depth >= 0),
  CONSTRAINT tire_status_chk CHECK (status IN ('ACTIVE','REMOVED','REPLACED','DAMAGED')),
  CONSTRAINT tire_rotation_km_chk CHECK (last_rotation_km IS NULL OR last_rotation_km >= installation_km),
  CONSTRAINT tire_next_rotation_km_chk CHECK (next_rotation_km IS NULL OR next_rotation_km >= installation_km),
  CONSTRAINT tire_removal_km_chk CHECK (removal_km IS NULL OR removal_km >= installation_km),
  CONSTRAINT tire_cost_chk CHECK (cost >= 0)
);
CREATE INDEX IF NOT EXISTS idx_tires_company_vehicle ON tire_records(company_id,vehicle_id,status,position);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tire_serial_company ON tire_records(company_id,serial_number) WHERE serial_number IS NOT NULL AND btrim(serial_number) <> '';

ALTER TABLE maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE oil_change_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE oil_change_records FORCE ROW LEVEL SECURITY;
ALTER TABLE tire_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tire_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_maintenance_plans ON maintenance_plans;
CREATE POLICY tenant_isolation_maintenance_plans ON maintenance_plans FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_oil_change_records ON oil_change_records;
CREATE POLICY tenant_isolation_oil_change_records ON oil_change_records FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_tire_records ON tire_records;
CREATE POLICY tenant_isolation_tire_records ON tire_records FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

CREATE OR REPLACE FUNCTION autoerp_advance_maintenance_plan_on_work_order_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'COMPLETED'
     AND OLD.status IS DISTINCT FROM 'COMPLETED'
     AND NEW.maintenance_plan_id IS NOT NULL
     AND NEW.exit_km IS NOT NULL
     AND NEW.completed_at IS NOT NULL THEN
    UPDATE maintenance_plans
       SET last_execution_km = NEW.exit_km,
           last_execution_date = NEW.completed_at::date,
           next_due_km = CASE WHEN interval_km IS NULL THEN NULL ELSE NEW.exit_km + interval_km END,
           next_due_date = CASE WHEN interval_days IS NULL THEN NULL ELSE (NEW.completed_at::date + interval_days) END,
           last_work_order_id = NEW.id,
           cycle_sequence = cycle_sequence + 1,
           updated_at = NEW.completed_at
     WHERE company_id = NEW.company_id
       AND id = NEW.maintenance_plan_id
       AND vehicle_id = NEW.vehicle_id
       AND status <> 'COMPLETED'
       AND last_work_order_id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_maintenance_plan_on_work_order_complete ON work_orders;
CREATE TRIGGER trg_advance_maintenance_plan_on_work_order_complete
AFTER UPDATE OF status ON work_orders
FOR EACH ROW EXECUTE FUNCTION autoerp_advance_maintenance_plan_on_work_order_complete();
