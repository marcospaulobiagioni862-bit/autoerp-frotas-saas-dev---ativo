-- WHATSAPP-1A: consent authority and provider-disabled outbox.
-- This migration creates no provider integration and sends no messages.

CREATE TABLE IF NOT EXISTS whatsapp_consents (
  company_id text NOT NULL REFERENCES companies(id),
  driver_id text NOT NULL,
  phone_e164 text NOT NULL,
  status text NOT NULL,
  consent_source text NOT NULL DEFAULT 'ERP_MANUAL',
  granted_by text,
  granted_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, driver_id),
  CONSTRAINT whatsapp_consents_status_check CHECK (status IN ('GRANTED', 'REVOKED')),
  CONSTRAINT whatsapp_consents_phone_check CHECK (phone_e164 ~ '^\\+55[0-9]{10,11}$'),
  CONSTRAINT whatsapp_consents_source_check CHECK (consent_source = 'ERP_MANUAL')
);

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  driver_id text NOT NULL,
  phone_e164 text NOT NULL,
  template_key text NOT NULL,
  template_parameters jsonb NOT NULL,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'HELD_PROVIDER_DISABLED',
  requested_by text NOT NULL,
  cancelled_by text,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, idempotency_key),
  CONSTRAINT whatsapp_outbox_id_check CHECK (id ~ '^wao_[a-f0-9]{32}$'),
  CONSTRAINT whatsapp_outbox_phone_check CHECK (phone_e164 ~ '^\\+55[0-9]{10,11}$'),
  CONSTRAINT whatsapp_outbox_template_check CHECK (template_key = 'DRIVER_CNH_EXPIRY'),
  CONSTRAINT whatsapp_outbox_parameters_object_check CHECK (jsonb_typeof(template_parameters) = 'object'),
  CONSTRAINT whatsapp_outbox_reference_check CHECK (reference_type = 'DRIVER'),
  CONSTRAINT whatsapp_outbox_idempotency_check CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  CONSTRAINT whatsapp_outbox_status_check CHECK (status IN ('HELD_PROVIDER_DISABLED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_consents_company_status
  ON whatsapp_consents(company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_company_status_created
  ON whatsapp_outbox(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_company_driver
  ON whatsapp_outbox(company_id, driver_id, created_at DESC);

ALTER TABLE whatsapp_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_whatsapp_consents ON whatsapp_consents;
CREATE POLICY tenant_access_whatsapp_consents ON whatsapp_consents
  AS PERMISSIVE FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_whatsapp_outbox ON whatsapp_outbox;
CREATE POLICY tenant_access_whatsapp_outbox ON whatsapp_outbox
  AS PERMISSIVE FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
