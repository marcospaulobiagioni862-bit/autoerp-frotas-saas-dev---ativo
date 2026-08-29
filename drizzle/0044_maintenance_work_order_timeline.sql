-- MAINT-SLA-1B: tenant-scoped, append-only work-order timeline authority.
-- Event timestamps are generated server-side; clients cannot author historical time.

CREATE TABLE IF NOT EXISTS maintenance_work_order_events (
  id text NOT NULL,
  company_id text NOT NULL,
  work_order_id text NOT NULL REFERENCES work_orders(id),
  event_type text NOT NULL,
  idempotency_key text NOT NULL,
  actor_user_id text NOT NULL,
  actor_name text NOT NULL,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT maintenance_work_order_event_type_check CHECK (
    event_type IN (
      'ENTERED_WORKSHOP',
      'WORK_STARTED',
      'WAITING_PARTS',
      'WAITING_APPROVAL',
      'WORK_RESUMED',
      'TECHNICALLY_COMPLETED',
      'VEHICLE_RELEASED'
    )
  ),
  CONSTRAINT maintenance_work_order_event_idempotency_unique
    UNIQUE (company_id, work_order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_work_order_events_timeline
  ON maintenance_work_order_events(company_id, work_order_id, occurred_at ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_maintenance_work_order_events_type
  ON maintenance_work_order_events(company_id, event_type, occurred_at DESC);

ALTER TABLE maintenance_work_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_work_order_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_maintenance_work_order_events ON maintenance_work_order_events;
CREATE POLICY tenant_isolation_maintenance_work_order_events ON maintenance_work_order_events
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

CREATE OR REPLACE FUNCTION reject_maintenance_work_order_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'maintenance_work_order_events is append-only' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS maintenance_work_order_events_append_only ON maintenance_work_order_events;
CREATE TRIGGER maintenance_work_order_events_append_only
BEFORE UPDATE OR DELETE ON maintenance_work_order_events
FOR EACH ROW EXECUTE FUNCTION reject_maintenance_work_order_event_mutation();
