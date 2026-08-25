-- TELEMETRY-1E: replay-resistant authentication for provider-neutral synthetic telemetry webhooks.
-- This table stores only nonce metadata. It does not enable a provider, credential,
-- production traffic, or automatic operational/financial side effect.

CREATE TABLE IF NOT EXISTS telemetry_webhook_nonces (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  nonce text NOT NULL,
  signed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_telemetry_webhook_nonce UNIQUE (company_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_webhook_nonces_tenant_received
  ON telemetry_webhook_nonces(company_id, received_at DESC);

ALTER TABLE telemetry_webhook_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_webhook_nonces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_telemetry_webhook_nonces ON telemetry_webhook_nonces;
CREATE POLICY tenant_isolation_telemetry_webhook_nonces ON telemetry_webhook_nonces
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
