-- SECURITY-2O — Incidents, Tasks and Executive Operations server authority

CREATE TABLE IF NOT EXISTS operational_tasks (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  priority text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  source_type text NOT NULL,
  source_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  assigned_user_id text,
  assigned_team text,
  created_by_user_id text NOT NULL,
  created_by_name text NOT NULL,
  started_at timestamptz,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  validated_at timestamptz,
  validator_user_id text,
  correlation_id text NOT NULL,
  resolution text,
  blocked_reason text,
  idempotency_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_tasks_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT operational_tasks_priority_chk CHECK (priority IN ('P0','P1','P2','P3')),
  CONSTRAINT operational_tasks_severity_chk CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  CONSTRAINT operational_tasks_status_chk CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','WAITING_VALIDATION','COMPLETED','CLOSED','CANCELLED','REOPENED')),
  CONSTRAINT operational_tasks_due_chk CHECK (due_at >= created_at),
  CONSTRAINT operational_tasks_version_chk CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_company_status ON operational_tasks(company_id,status,priority,due_at);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_company_entity ON operational_tasks(company_id,entity_type,entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_tasks_source ON operational_tasks(company_id,source_type,source_id) WHERE source_type <> 'MANUAL' AND btrim(source_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_tasks_idempotency ON operational_tasks(company_id,idempotency_key);

CREATE TABLE IF NOT EXISTS operational_task_events (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  task_id text NOT NULL,
  event_type text NOT NULL,
  content text NOT NULL,
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id text NOT NULL,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_task_events_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT operational_task_events_task_fk FOREIGN KEY (task_id) REFERENCES operational_tasks(id) ON DELETE CASCADE,
  CONSTRAINT operational_task_events_type_chk CHECK (event_type IN ('COMMENT','DOCUMENT','IMAGE','PDF','NOTE','STATUS','ASSIGNMENT','BLOCK','UNBLOCK','VALIDATION'))
);
CREATE INDEX IF NOT EXISTS idx_operational_task_events_task ON operational_task_events(company_id,task_id,created_at,id);

CREATE TABLE IF NOT EXISTS operational_incidents (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  correlation_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL DEFAULT 'DETECTED',
  source text NOT NULL,
  category text NOT NULL,
  detected_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  contained_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reported_by_user_id text NOT NULL,
  reported_by_name text NOT NULL,
  assigned_to text,
  commander_id text,
  technical_lead_id text,
  operations_lead_id text,
  communications_lead_id text,
  affected_module text,
  affected_entity_type text,
  affected_entity_id text,
  impact_description text NOT NULL,
  sla_deadline timestamptz,
  sla_status text NOT NULL DEFAULT 'ON_TRACK',
  root_cause text,
  resolution_summary text,
  idempotency_key text NOT NULL,
  incident_fingerprint text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_incidents_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT operational_incidents_severity_chk CHECK (severity IN ('SEV0','SEV1','SEV2','SEV3','SEV4')),
  CONSTRAINT operational_incidents_priority_chk CHECK (priority IN ('P0','P1','P2','P3')),
  CONSTRAINT operational_incidents_status_chk CHECK (status IN ('DETECTED','TRIAGED','ACKNOWLEDGED','INVESTIGATING','CONTAINING','MITIGATED','RESOLVED','VALIDATING','CLOSED','ESCALATED','REOPENED','CANCELLED')),
  CONSTRAINT operational_incidents_sla_chk CHECK (sla_status IN ('ON_TRACK','WARNING','BREACHED')),
  CONSTRAINT operational_incidents_version_chk CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_company_status ON operational_incidents(company_id,status,severity,detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_entity ON operational_incidents(company_id,affected_entity_type,affected_entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_incidents_fingerprint_active ON operational_incidents(company_id,incident_fingerprint) WHERE status NOT IN ('CLOSED','CANCELLED');
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_incidents_idempotency ON operational_incidents(company_id,idempotency_key);

CREATE TABLE IF NOT EXISTS operational_incident_actions (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  incident_id text NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  comment text,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id text NOT NULL,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_incident_actions_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT operational_incident_actions_incident_fk FOREIGN KEY (incident_id) REFERENCES operational_incidents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_operational_incident_actions_incident ON operational_incident_actions(company_id,incident_id,created_at,id);

CREATE TABLE IF NOT EXISTS operational_command_idempotency (
  company_id text NOT NULL,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  resource_type text,
  resource_id text,
  response_json jsonb,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,idempotency_key),
  CONSTRAINT operational_command_idempotency_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_operational_idempotency_created ON operational_command_idempotency(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS executive_operation_snapshots (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  correlation_id text NOT NULL,
  snapshot_type text NOT NULL DEFAULT 'ON_DEMAND',
  payload jsonb NOT NULL,
  generated_by_user_id text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT executive_operation_snapshots_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT executive_operation_snapshots_type_chk CHECK (snapshot_type IN ('DAILY','WEEKLY','MONTHLY','ON_DEMAND'))
);
CREATE INDEX IF NOT EXISTS idx_executive_snapshots_company_time ON executive_operation_snapshots(company_id,generated_at DESC,id);

ALTER TABLE operational_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_task_events FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_incident_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_incident_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_command_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_command_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE executive_operation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_operation_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_operational_tasks ON operational_tasks;
CREATE POLICY tenant_isolation_operational_tasks ON operational_tasks FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_operational_task_events ON operational_task_events;
CREATE POLICY tenant_isolation_operational_task_events ON operational_task_events FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_operational_incidents ON operational_incidents;
CREATE POLICY tenant_isolation_operational_incidents ON operational_incidents FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_operational_incident_actions ON operational_incident_actions;
CREATE POLICY tenant_isolation_operational_incident_actions ON operational_incident_actions FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_operational_command_idempotency ON operational_command_idempotency;
CREATE POLICY tenant_isolation_operational_command_idempotency ON operational_command_idempotency FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
DROP POLICY IF EXISTS tenant_isolation_executive_operation_snapshots ON executive_operation_snapshots;
CREATE POLICY tenant_isolation_executive_operation_snapshots ON executive_operation_snapshots FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
