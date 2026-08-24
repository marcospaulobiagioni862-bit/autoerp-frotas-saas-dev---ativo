-- REPORT-AI-1B: tenant-scoped, human-reviewed suggestion sessions.
-- No provider call or business-entity mutation is performed by this table.

CREATE TABLE IF NOT EXISTS report_ai_suggestions (
  id text NOT NULL,
  company_id text NOT NULL REFERENCES companies(id),
  target_type text NOT NULL,
  target_id text,
  status text NOT NULL DEFAULT 'PENDING_REVIEW',
  suggestion_payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  review_payload jsonb,
  review_hash text,
  created_by text NOT NULL,
  reviewed_by text,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT report_ai_suggestions_status_check
    CHECK (status IN ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED')),
  CONSTRAINT report_ai_suggestions_payload_object_check
    CHECK (jsonb_typeof(suggestion_payload) = 'object'),
  CONSTRAINT report_ai_suggestions_review_object_check
    CHECK (review_payload IS NULL OR jsonb_typeof(review_payload) = 'object'),
  CONSTRAINT report_ai_suggestions_payload_hash_check
    CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT report_ai_suggestions_review_hash_check
    CHECK (review_hash IS NULL OR review_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_report_ai_suggestions_company_status_created
  ON report_ai_suggestions(company_id, status, created_at DESC);

ALTER TABLE report_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_ai_suggestions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access_report_ai_suggestions ON report_ai_suggestions;
CREATE POLICY tenant_access_report_ai_suggestions ON report_ai_suggestions
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
