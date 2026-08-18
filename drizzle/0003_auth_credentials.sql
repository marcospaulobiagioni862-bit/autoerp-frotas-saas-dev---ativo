-- SECURITY-2F1: server-side credential foundation
-- No default credentials are created by this migration.

CREATE UNIQUE INDEX IF NOT EXISTS users_company_user_unique
  ON users (company_id, id);

CREATE TABLE IF NOT EXISTS user_credentials (
  company_id text NOT NULL,
  user_id text NOT NULL,
  password_hash text NOT NULL,
  password_updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT user_credentials_pkey PRIMARY KEY (company_id, user_id),
  CONSTRAINT user_credentials_user_tenant_fk
    FOREIGN KEY (company_id, user_id)
    REFERENCES users (company_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user
  ON user_credentials (user_id);

ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_user_credentials ON user_credentials;
CREATE POLICY tenant_isolation_user_credentials
  ON user_credentials
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));
