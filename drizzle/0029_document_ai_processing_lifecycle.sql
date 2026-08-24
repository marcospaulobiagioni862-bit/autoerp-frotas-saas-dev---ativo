-- DOC-AI-1B-F2: observable, concurrency-safe processing lifecycle.
-- No provider is enabled by this migration.

ALTER TABLE document_ai_extractions
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_document_ai_pending_claim
  ON document_ai_extractions(company_id, created_at, id)
  WHERE status = 'PENDING';

