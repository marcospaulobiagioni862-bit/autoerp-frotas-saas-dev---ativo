-- MAINT-1050-B: authoritative multi-plan preventive execution per completed work order.
-- Keeps legacy work_orders.maintenance_plan_id behavior only when no explicit selection was supplied.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS preventive_plan_selection_applied boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS maintenance_work_order_plan_executions (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  work_order_id text NOT NULL REFERENCES work_orders(id),
  maintenance_plan_id text NOT NULL REFERENCES maintenance_plans(id),
  execution_kind text NOT NULL,
  execution_km integer NOT NULL,
  execution_date date NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_work_order_plan_execution_kind_chk
    CHECK (execution_kind IN ('SCHEDULED','PREVENTIVA_ANTECIPADA')),
  CONSTRAINT maintenance_work_order_plan_execution_km_chk
    CHECK (execution_km >= 0),
  CONSTRAINT maintenance_work_order_plan_execution_unique
    UNIQUE (company_id, work_order_id, maintenance_plan_id)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_work_order_plan_executions_order
  ON maintenance_work_order_plan_executions(company_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_work_order_plan_executions_plan
  ON maintenance_work_order_plan_executions(company_id, maintenance_plan_id, execution_date DESC);

ALTER TABLE maintenance_work_order_plan_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_work_order_plan_executions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_maintenance_work_order_plan_executions
  ON maintenance_work_order_plan_executions;
CREATE POLICY tenant_isolation_maintenance_work_order_plan_executions
  ON maintenance_work_order_plan_executions
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

CREATE OR REPLACE FUNCTION autoerp_advance_maintenance_plan_on_work_order_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'COMPLETED'
     AND OLD.status IS DISTINCT FROM 'COMPLETED'
     AND COALESCE(NEW.preventive_plan_selection_applied, false) = false
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
