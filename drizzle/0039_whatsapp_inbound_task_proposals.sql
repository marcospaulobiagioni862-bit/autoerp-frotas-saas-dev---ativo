-- WHATSAPP-1E: sanitized inbound reply proposals with explicit human review.
-- Raw reply text is never persisted. Approval may create one canonical operational task.

ALTER TABLE whatsapp_webhook_events
  DROP CONSTRAINT IF EXISTS whatsapp_webhook_event_type_check;
ALTER TABLE whatsapp_webhook_events
  ADD CONSTRAINT whatsapp_webhook_event_type_check
  CHECK (event_type IN ('SENT','DELIVERED','READ','FAILED','REPLY_RECEIVED'));

CREATE TABLE IF NOT EXISTS whatsapp_inbound_task_proposals (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  webhook_event_id text NOT NULL,
  outbox_id text NOT NULL,
  driver_id text NOT NULL,
  reply_category text NOT NULL,
  reply_digest text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  task_id text,
  reviewed_by_user_id text,
  reviewed_by_name text,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, webhook_event_id),
  CONSTRAINT whatsapp_reply_proposal_id_check CHECK (id ~ '^wrp_[a-f0-9]{32}$'),
  CONSTRAINT whatsapp_reply_category_check CHECK (reply_category IN ('PAYMENT_QUESTION','DOCUMENT_QUESTION','MAINTENANCE_REPORT','GENERAL')),
  CONSTRAINT whatsapp_reply_status_check CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  CONSTRAINT whatsapp_reply_digest_check CHECK (reply_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT whatsapp_reply_review_check CHECK (
    (status = 'PENDING' AND task_id IS NULL AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
    OR
    (status = 'APPROVED' AND task_id IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR
    (status = 'REJECTED' AND task_id IS NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT whatsapp_reply_event_fk FOREIGN KEY (company_id, webhook_event_id)
    REFERENCES whatsapp_webhook_events(company_id, id),
  CONSTRAINT whatsapp_reply_outbox_fk FOREIGN KEY (company_id, outbox_id)
    REFERENCES whatsapp_outbox(company_id, id),
  CONSTRAINT whatsapp_reply_task_fk FOREIGN KEY (task_id)
    REFERENCES operational_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_reply_proposals_tenant_status
  ON whatsapp_inbound_task_proposals(company_id, status, created_at DESC);

ALTER TABLE whatsapp_inbound_task_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_inbound_task_proposals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_whatsapp_inbound_task_proposals ON whatsapp_inbound_task_proposals;
CREATE POLICY tenant_isolation_whatsapp_inbound_task_proposals ON whatsapp_inbound_task_proposals
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
