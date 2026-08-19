-- SECURITY-2I4A: server-authoritative attachment metadata and RLS.
-- Expand the existing file_attachments table in place. Legacy browser blobs are not invented.

ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS entity_name text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS document_type text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS storage_provider text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS checksum text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS issue_date text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS expiration_date text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS is_archived boolean;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS content_state text;

UPDATE file_attachments
SET entity_name = entity_type
WHERE entity_name IS NULL;

UPDATE file_attachments
SET file_size = COALESCE(file_size, size, 0)
WHERE file_size IS NULL;

UPDATE file_attachments
SET storage_provider = 'LEGACY_BROWSER'
WHERE storage_provider IS NULL;

UPDATE file_attachments
SET content_state = 'LEGACY_BROWSER'
WHERE content_state IS NULL;

UPDATE file_attachments
SET is_archived = false
WHERE is_archived IS NULL;

ALTER TABLE file_attachments ALTER COLUMN entity_name SET NOT NULL;
ALTER TABLE file_attachments ALTER COLUMN file_size SET DEFAULT 0;
ALTER TABLE file_attachments ALTER COLUMN file_size SET NOT NULL;
ALTER TABLE file_attachments ALTER COLUMN storage_provider SET DEFAULT 'LEGACY_BROWSER';
ALTER TABLE file_attachments ALTER COLUMN storage_provider SET NOT NULL;
ALTER TABLE file_attachments ALTER COLUMN content_state SET DEFAULT 'LEGACY_BROWSER';
ALTER TABLE file_attachments ALTER COLUMN content_state SET NOT NULL;
ALTER TABLE file_attachments ALTER COLUMN is_archived SET DEFAULT false;
ALTER TABLE file_attachments ALTER COLUMN is_archived SET NOT NULL;

ALTER TABLE file_attachments DROP CONSTRAINT IF EXISTS file_attachments_file_size_nonnegative;
ALTER TABLE file_attachments ADD CONSTRAINT file_attachments_file_size_nonnegative CHECK (file_size >= 0);

ALTER TABLE file_attachments DROP CONSTRAINT IF EXISTS file_attachments_storage_provider_check;
ALTER TABLE file_attachments ADD CONSTRAINT file_attachments_storage_provider_check
  CHECK (storage_provider IN ('LEGACY_BROWSER', 'SERVER_FS'));

ALTER TABLE file_attachments DROP CONSTRAINT IF EXISTS file_attachments_content_state_check;
ALTER TABLE file_attachments ADD CONSTRAINT file_attachments_content_state_check
  CHECK (content_state IN ('LEGACY_BROWSER', 'AVAILABLE', 'MISSING'));

CREATE INDEX IF NOT EXISTS idx_att_company_entity
  ON file_attachments(company_id, entity_type, entity_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_att_company_document
  ON file_attachments(company_id, document_type, is_archived);
CREATE INDEX IF NOT EXISTS idx_att_company_created
  ON file_attachments(company_id, created_at DESC);

ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON file_attachments;
DROP POLICY IF EXISTS tenant_isolation_att ON file_attachments;
CREATE POLICY tenant_isolation_att ON file_attachments
  AS PERMISSIVE
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
