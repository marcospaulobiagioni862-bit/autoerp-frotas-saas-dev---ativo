-- SECURITY-2I4C: ContractTemplate + generated PDF + signed evidence authority.

CREATE TABLE IF NOT EXISTS contract_templates (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  template_key text NOT NULL,
  title text NOT NULL,
  content_markdown text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  supersedes_template_id text,
  is_current boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contract_templates_version_positive CHECK (version_number >= 1),
  CONSTRAINT contract_templates_key_nonempty CHECK (length(btrim(template_key)) > 0),
  CONSTRAINT contract_templates_title_nonempty CHECK (length(btrim(title)) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_template_version
  ON contract_templates(company_id, template_key, version_number);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_template_current
  ON contract_templates(company_id, template_key)
  WHERE is_current = true AND is_archived = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contract_template_company_current
  ON contract_templates(company_id, is_current, is_active, is_archived);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS contract_artifacts (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  contract_id text NOT NULL,
  artifact_type text NOT NULL,
  attachment_id text NOT NULL,
  template_id text,
  source_artifact_id text,
  snapshot_json text,
  snapshot_hash text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  signature_method text,
  signed_by_name text,
  signed_at timestamp,
  created_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT contract_artifacts_type_check CHECK (artifact_type IN ('GENERATED_PDF','SIGNED_EVIDENCE')),
  CONSTRAINT contract_artifacts_snapshot_hash_check CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contract_artifacts_generated_shape CHECK (
    artifact_type <> 'GENERATED_PDF'
    OR (template_id IS NOT NULL AND snapshot_json IS NOT NULL AND signature_method IS NULL AND signed_by_name IS NULL AND signed_at IS NULL)
  ),
  CONSTRAINT contract_artifacts_signed_shape CHECK (
    artifact_type <> 'SIGNED_EVIDENCE'
    OR (source_artifact_id IS NOT NULL AND signature_method = 'SIGNED_PDF_UPLOAD' AND signed_by_name IS NOT NULL AND signed_at IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_artifact_current
  ON contract_artifacts(company_id, contract_id, artifact_type)
  WHERE is_current = true AND is_archived = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contract_artifact_contract
  ON contract_artifacts(company_id, contract_id, artifact_type, is_current, is_archived);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contract_artifact_attachment
  ON contract_artifacts(company_id, attachment_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_contract_artifact_source
  ON contract_artifacts(company_id, source_artifact_id);
--> statement-breakpoint

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature_required boolean;
--> statement-breakpoint
UPDATE contracts SET signature_required = false WHERE signature_required IS NULL;
--> statement-breakpoint
ALTER TABLE contracts ALTER COLUMN signature_required SET DEFAULT true;
--> statement-breakpoint
ALTER TABLE contracts ALTER COLUMN signature_required SET NOT NULL;
--> statement-breakpoint

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contract_templates FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_contract_templates ON contract_templates;
--> statement-breakpoint
CREATE POLICY tenant_isolation_contract_templates ON contract_templates
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
--> statement-breakpoint

ALTER TABLE contract_artifacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contract_artifacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_contract_artifacts ON contract_artifacts;
--> statement-breakpoint
CREATE POLICY tenant_isolation_contract_artifacts ON contract_artifacts
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
