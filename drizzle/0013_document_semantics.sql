-- SECURITY-2I4B: server-authoritative Vehicle/Driver document semantics.
-- Attachment bytes/metadata remain authoritative in file_attachments (I4A).

CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY NOT NULL,
  company_id text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  document_type text NOT NULL,
  document_number text,
  reference_year integer,
  issue_date text,
  expiration_date text,
  attachment_id text,
  version_number integer NOT NULL DEFAULT 1,
  supersedes_document_id text,
  is_current boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  cost numeric(12,2) NOT NULL DEFAULT '0',
  payable_id text,
  notes text,
  created_by text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT documents_subject_type_check CHECK (subject_type IN ('VEHICLE','DRIVER')),
  CONSTRAINT documents_version_positive CHECK (version_number >= 1),
  CONSTRAINT documents_reference_year_check CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2200),
  CONSTRAINT documents_cost_nonnegative CHECK (cost >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_current_semantic
  ON documents(company_id, subject_type, subject_id, document_type, COALESCE(reference_year, 0))
  WHERE is_current = true AND is_archived = false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_version_semantic
  ON documents(company_id, subject_type, subject_id, document_type, COALESCE(reference_year, 0), version_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_company_subject_current
  ON documents(company_id, subject_type, subject_id, is_current, is_archived);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_company_type_current
  ON documents(company_id, document_type, is_current, is_archived);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_company_expiration
  ON documents(company_id, expiration_date, is_current, is_archived);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_attachment
  ON documents(company_id, attachment_id)
  WHERE attachment_id IS NOT NULL;
--> statement-breakpoint

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_docs ON documents;
CREATE POLICY tenant_isolation_docs ON documents
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
