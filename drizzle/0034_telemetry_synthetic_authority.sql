-- TELEMETRY-1A: synthetic-only telemetry event authority.
-- This migration does not enable a provider, webhook, credential, polling, production data,
-- or automatic operational/financial side effect.

CREATE TABLE IF NOT EXISTS tracker_telemetry_events (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  tracker_id text NOT NULL REFERENCES trackers(id),
  source_event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('POSITION', 'ODOMETER', 'HEARTBEAT')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('ACCEPTED', 'QUARANTINED')),
  quarantine_reason text,
  raw_payload jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracker_telemetry_events_status_reason_chk
    CHECK ((status = 'ACCEPTED' AND quarantine_reason IS NULL) OR (status = 'QUARANTINED' AND quarantine_reason IS NOT NULL)),
  CONSTRAINT uq_tracker_telemetry_event_source UNIQUE (company_id, tracker_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_tracker_telemetry_events_tenant_tracker_received
  ON tracker_telemetry_events(company_id, tracker_id, received_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tracker_telemetry_events_quarantine
  ON tracker_telemetry_events(company_id, tracker_id, occurred_at DESC)
  WHERE status = 'QUARANTINED';

ALTER TABLE tracker_telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_telemetry_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tracker_telemetry_events ON tracker_telemetry_events;
CREATE POLICY tenant_isolation_tracker_telemetry_events ON tracker_telemetry_events
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
