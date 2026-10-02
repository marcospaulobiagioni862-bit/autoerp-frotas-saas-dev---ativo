ALTER TABLE trackers ADD COLUMN IF NOT EXISTS provider_name text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS provider_contact text;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS portal_url text;
