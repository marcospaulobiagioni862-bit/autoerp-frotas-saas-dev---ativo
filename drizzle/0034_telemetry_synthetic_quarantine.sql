-- TELEMETRY-1A: synthetic-only telemetry foundation. No provider or automatic side effects.

CREATE TABLE IF NOT EXISTS telemetry_events (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  tracker_id text NOT NULL,
  source_event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  occurred_at timestamptz,
  raw_occurred_at text NOT NULL,
  event_type text NOT NULL,
  raw_payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  status text NOT NULL,
  quarantine_reason text,
  ingested_by text NOT NULL,
  is_synthetic boolean NOT NULL DEFAULT true,
  odometer_km numeric(12,3),
  battery_percent numeric(5,2),
  signal_percent numeric(5,2),
  speed_kph numeric(8,2),
  has_position boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, tracker_id, source_event_id),
  CONSTRAINT telemetry_events_id_check CHECK (id ~ '^tev_[a-f0-9]{32}$'),
  CONSTRAINT telemetry_events_type_check CHECK (event_type IN ('POSITION', 'ODOMETER', 'HEARTBEAT')),
  CONSTRAINT telemetry_events_status_check CHECK (status IN ('ACCEPTED', 'QUARANTINED')),
  CONSTRAINT telemetry_events_payload_check CHECK (jsonb_typeof(raw_payload) = 'object'),
  CONSTRAINT telemetry_events_hash_check CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT telemetry_events_synthetic_only_check CHECK (is_synthetic = true),
  CONSTRAINT telemetry_events_quarantine_check CHECK ((status = 'ACCEPTED' AND quarantine_reason IS NULL) OR (status = 'QUARANTINED' AND quarantine_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_company_tracker_received
  ON telemetry_events(company_id, tracker_id, received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_company_quarantine
  ON telemetry_events(company_id, tracker_id, status, received_at DESC)
  WHERE status = 'QUARANTINED';
CREATE INDEX IF NOT EXISTS idx_telemetry_events_accepted_odometer
  ON telemetry_events(company_id, tracker_id, occurred_at DESC)
  WHERE event_type = 'ODOMETER' AND status = 'ACCEPTED';

ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_telemetry_events ON telemetry_events;
CREATE POLICY tenant_access_telemetry_events ON telemetry_events
  AS PERMISSIVE FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
