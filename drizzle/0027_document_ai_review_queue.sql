-- DOC-AI-1A: tenant-scoped extraction queue and human-review evidence foundation.
-- AI output remains a proposal. This table does not mutate ERP business entities.

CREATE TABLE IF NOT EXISTS document_ai_extractions (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  attachment_id text NOT NULL,
  attachment_checksum text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  requested_by text NOT NULL,
  provider text,
  model text,
  model_version text,
  detected_document_type text,
  raw_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text,
  reviewed_by text,
  corrections jsonb,
  review_notes text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_ai_status_check CHECK (
    status IN ('PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'FAILED')
  ),
  CONSTRAINT document_ai_checksum_check CHECK (attachment_checksum ~ '^[a-f0-9]{64}$'),
  CONSTRAINT uq_document_ai_company_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_document_ai_company_status_created
  ON document_ai_extractions(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_ai_company_attachment
  ON document_ai_extractions(company_id, attachment_id, created_at DESC);

ALTER TABLE document_ai_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_ai_extractions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_document_ai ON document_ai_extractions;
CREATE POLICY tenant_isolation_document_ai ON document_ai_extractions
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
