-- VEH-DOC-AI-INTAKE-1: tenant-scoped vehicle document intake authority.
-- Intakes exist before a Vehicle is created and never grant AI authority to create business entities.

CREATE TABLE IF NOT EXISTS vehicle_document_intakes (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  idempotency_key text NOT NULL,
  document_type text NOT NULL,
  attachment_id text,
  approved_extraction_id text,
  vehicle_id text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_document_intake_status_check CHECK (
    status IN ('DRAFT','DOCUMENT_UPLOADED','EXTRACTING','REVIEW_REQUIRED','APPROVED','CONSUMED','FAILED','ARCHIVED')
  ),
  CONSTRAINT vehicle_document_intake_document_type_check CHECK (
    document_type IN ('CRLV','CRV','ATPV_E')
  ),
  CONSTRAINT vehicle_document_intake_consumed_check CHECK (
    status <> 'CONSUMED' OR (vehicle_id IS NOT NULL AND consumed_at IS NOT NULL)
  ),
  CONSTRAINT uq_vehicle_document_intake_company_idempotency UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_document_intake_company_status_created
  ON vehicle_document_intakes(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_document_intake_company_creator_created
  ON vehicle_document_intakes(company_id, created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_document_intake_company_expiry
  ON vehicle_document_intakes(company_id, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_document_intake_company_attachment
  ON vehicle_document_intakes(company_id, attachment_id)
  WHERE attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_document_intake_company_vehicle
  ON vehicle_document_intakes(company_id, vehicle_id)
  WHERE vehicle_id IS NOT NULL;

ALTER TABLE vehicle_document_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_document_intakes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_vehicle_document_intakes ON vehicle_document_intakes;
CREATE POLICY tenant_isolation_vehicle_document_intakes ON vehicle_document_intakes
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
