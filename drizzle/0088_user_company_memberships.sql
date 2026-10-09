-- AUTOERP-82: Identidade única de usuário, senha por pessoa e vínculos multi-tenant por empresa
--
-- 1. Tabela de vínculos entre usuário e empresa (locadora)
CREATE TABLE IF NOT EXISTS user_company_memberships (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  permissions text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

-- Índices de consulta por tenant e por usuário
CREATE INDEX IF NOT EXISTS idx_ucm_company
  ON user_company_memberships(company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ucm_user
  ON user_company_memberships(user_id, active);

-- Isolamento multi-tenant com RLS FORCE em user_company_memberships
ALTER TABLE user_company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_user_company_memberships ON user_company_memberships;
CREATE POLICY tenant_isolation_user_company_memberships ON user_company_memberships
  FOR ALL
  USING (company_id = current_setting('app.current_tenant', true))
  WITH CHECK (company_id = current_setting('app.current_tenant', true));

-- 2. Backfill defensivo e idempotente: migra todos os usuários existentes para a tabela de vínculos
INSERT INTO user_company_memberships (user_id, company_id, role, permissions, active, created_at, updated_at)
SELECT id, company_id, role, permissions, active, created_at, updated_at
FROM users
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 3. Transição de user_credentials para PK única por user_id (uma senha por identidade)
DO $$
BEGIN
  -- Se houver FK composta antiga por (company_id, user_id), substitui por FK direta em user_id
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_credentials'::regclass
      AND conname = 'user_credentials_user_tenant_fk'
  ) THEN
    ALTER TABLE user_credentials DROP CONSTRAINT user_credentials_user_tenant_fk;
    ALTER TABLE user_credentials ADD CONSTRAINT user_credentials_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- Se a chave composta antiga existir, substitui por PK em user_id
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_credentials'::regclass
      AND conname = 'user_credentials_pkey'
  ) THEN
    ALTER TABLE user_credentials DROP CONSTRAINT user_credentials_pkey;
    ALTER TABLE user_credentials ADD CONSTRAINT user_credentials_pkey PRIMARY KEY (user_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

ALTER TABLE user_credentials ALTER COLUMN company_id DROP NOT NULL;

-- Como a credencial agora é por identidade única (uma senha por usuário compartilhada entre tenants):
DROP POLICY IF EXISTS tenant_isolation_user_credentials ON user_credentials;
ALTER TABLE user_credentials NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_credentials DISABLE ROW LEVEL SECURITY;
