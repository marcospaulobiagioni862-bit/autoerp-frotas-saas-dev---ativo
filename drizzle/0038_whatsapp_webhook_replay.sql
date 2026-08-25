-- WHATSAPP-1D: replay-resistant provider-neutral synthetic webhook foundation.
-- Records only sanitized delivery metadata in quarantine. It does not enable a provider,
-- send messages, mutate outbox delivery status, or apply business/financial effects.

CREATE TABLE IF NOT EXISTS whatsapp_webhook_nonces (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  nonce text NOT NULL,
  signed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_whatsapp_webhook_nonce UNIQUE (company_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_nonces_tenant_received
  ON whatsapp_webhook_nonces(company_id, received_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  provider_event_id text NOT NULL,
  outbox_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  disposition text NOT NULL DEFAULT 'QUARANTINED',
  quarantine_reason text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, provider_event_id),
  CONSTRAINT whatsapp_webhook_event_id_check CHECK (id ~ '^whe_[a-f0-9]{32}$'),
  CONSTRAINT whatsapp_webhook_event_type_check CHECK (event_type IN ('SENT','DELIVERED','READ','FAILED')),
  CONSTRAINT whatsapp_webhook_disposition_check CHECK (disposition = 'QUARANTINED'),
  CONSTRAINT whatsapp_webhook_reason_check CHECK (quarantine_reason IN ('OUTBOX_NOT_DISPATCHED','OUTBOX_CANCELLED')),
  CONSTRAINT whatsapp_webhook_outbox_fk FOREIGN KEY (company_id, outbox_id)
    REFERENCES whatsapp_outbox(company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_tenant_received
  ON whatsapp_webhook_events(company_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_tenant_outbox
  ON whatsapp_webhook_events(company_id, outbox_id, occurred_at DESC);

ALTER TABLE whatsapp_webhook_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_nonces FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_whatsapp_webhook_nonces ON whatsapp_webhook_nonces;
CREATE POLICY tenant_isolation_whatsapp_webhook_nonces ON whatsapp_webhook_nonces
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_whatsapp_webhook_events ON whatsapp_webhook_events;
CREATE POLICY tenant_isolation_whatsapp_webhook_events ON whatsapp_webhook_events
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
