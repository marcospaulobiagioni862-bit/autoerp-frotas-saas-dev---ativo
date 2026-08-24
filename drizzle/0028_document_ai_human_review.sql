-- DOC-AI-1C: explicit human-review evidence.
-- AI output remains a proposal and approval does not mutate ERP business entities.

ALTER TABLE document_ai_extractions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_document_ai_company_reviewed
  ON document_ai_extractions(company_id, reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;
