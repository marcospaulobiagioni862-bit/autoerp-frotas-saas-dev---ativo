-- SECURITY-2I5A: persistent notification inbox + scheduler run authority.

CREATE TABLE notifications (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  recipient_user_id text,
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_version text,
  alert_stage text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL,
  due_date text,
  destination_tab text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'UNREAD',
  read_at timestamp,
  dismissed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT notifications_severity_check CHECK (severity IN ('INFO','WARNING','DANGER','SUCCESS')),
  CONSTRAINT notifications_status_check CHECK (status IN ('UNREAD','READ','DISMISSED','ARCHIVED')),
  CONSTRAINT notifications_idempotency_unique UNIQUE (company_id, idempotency_key)
);

CREATE INDEX idx_notifications_company_status_created
  ON notifications (company_id, status, created_at DESC);
CREATE INDEX idx_notifications_company_source
  ON notifications (company_id, source_type, source_id);
CREATE INDEX idx_notifications_company_due
  ON notifications (company_id, due_date);
CREATE INDEX idx_notifications_company_recipient
  ON notifications (company_id, recipient_user_id, status, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_notifications ON notifications;
CREATE POLICY tenant_access_notifications ON notifications
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

CREATE TABLE scheduler_runs (
  id text PRIMARY KEY NOT NULL,
  job_key text NOT NULL,
  execution_bucket text NOT NULL,
  started_at timestamp NOT NULL,
  finished_at timestamp,
  status text NOT NULL,
  instance_id text NOT NULL,
  error_message text,
  metrics_json text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT scheduler_runs_status_check CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
  CONSTRAINT scheduler_runs_job_bucket_unique UNIQUE (job_key, execution_bucket)
);

CREATE INDEX idx_scheduler_runs_job_started
  ON scheduler_runs (job_key, started_at DESC);
CREATE INDEX idx_scheduler_runs_status_started
  ON scheduler_runs (status, started_at DESC);
