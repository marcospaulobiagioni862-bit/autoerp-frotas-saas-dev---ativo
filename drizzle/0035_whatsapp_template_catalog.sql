-- WHATSAPP-1B2: tenant-scoped immutable template catalog without provider calls.

CREATE TABLE IF NOT EXISTS whatsapp_template_catalog (
  company_id text NOT NULL REFERENCES companies(id),
  template_key text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  body_text text NOT NULL,
  parameter_keys jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, template_key, version),
  CONSTRAINT whatsapp_template_catalog_key_check CHECK (template_key = 'DRIVER_CNH_EXPIRY'),
  CONSTRAINT whatsapp_template_catalog_version_check CHECK (version > 0),
  CONSTRAINT whatsapp_template_catalog_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT whatsapp_template_catalog_body_check CHECK (length(btrim(body_text)) BETWEEN 1 AND 2000),
  CONSTRAINT whatsapp_template_catalog_parameters_check CHECK (jsonb_typeof(parameter_keys) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_template_catalog_active
  ON whatsapp_template_catalog(company_id, template_key)
  WHERE status = 'ACTIVE';

INSERT INTO whatsapp_template_catalog (company_id, template_key, version, status, body_text, parameter_keys)
SELECT id, 'DRIVER_CNH_EXPIRY', 1, 'ACTIVE',
       'Olá {{driverName}}, sua CNH vence em {{cnhExpiration}}.',
       '["driverName","cnhExpiration"]'::jsonb
FROM companies
ON CONFLICT (company_id, template_key, version) DO NOTHING;

ALTER TABLE whatsapp_outbox ADD COLUMN IF NOT EXISTS template_version integer;
UPDATE whatsapp_outbox SET template_version = 1 WHERE template_version IS NULL;
ALTER TABLE whatsapp_outbox ALTER COLUMN template_version SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_template_version_fk
    FOREIGN KEY (company_id, template_key, template_version)
    REFERENCES whatsapp_template_catalog(company_id, template_key, version);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION autoerp_whatsapp_template_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WhatsApp template versions are immutable';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.template_key IS DISTINCT FROM OLD.template_key
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.parameter_keys IS DISTINCT FROM OLD.parameter_keys
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'WhatsApp template version content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_template_immutable ON whatsapp_template_catalog;
CREATE TRIGGER trg_whatsapp_template_immutable
BEFORE UPDATE OR DELETE ON whatsapp_template_catalog
FOR EACH ROW EXECUTE FUNCTION autoerp_whatsapp_template_immutable();

ALTER TABLE whatsapp_template_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_template_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_whatsapp_template_catalog ON whatsapp_template_catalog;
CREATE POLICY tenant_access_whatsapp_template_catalog ON whatsapp_template_catalog
  AS PERMISSIVE FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
