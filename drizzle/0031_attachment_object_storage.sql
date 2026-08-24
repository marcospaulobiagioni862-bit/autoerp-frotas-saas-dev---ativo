-- ECONOMY-R2: permit server-authoritative object storage without a Render persistent disk.
-- This migration only expands the metadata allowlist. It does not create a bucket,
-- configure credentials, move existing bytes, or enable R2.

ALTER TABLE file_attachments DROP CONSTRAINT IF EXISTS file_attachments_storage_provider_check;
ALTER TABLE file_attachments ADD CONSTRAINT file_attachments_storage_provider_check
  CHECK (storage_provider IN ('LEGACY_BROWSER', 'SERVER_FS', 'R2'));
