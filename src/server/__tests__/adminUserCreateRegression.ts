import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import express, { type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql, eq, and } from 'drizzle-orm';

// Carregar variáveis Neon ANTES de importar db
try {
  const envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn('Could not read ~/.config/autoerp-neon.env:', e);
}

const neonUrl = process.env.HOMOLOG_DATABASE_URL || process.env.STAGING_MAIN_DATABASE_URL || process.env.DATABASE_URL;
if (neonUrl) {
  process.env.DATABASE_URL = neonUrl;
  process.env.USE_PGLITE = 'false';
  process.env.NODE_ENV = 'development';
}

const { db } = await import('../../db');
const { users, companies } = await import('../../db/schema');
const { userCompanyMemberships, userCredentials } = await import('../../db/authSchema');
import { verifyPassword } from '../password';
import { registerAdminUserRoutes } from '../adminUserRoutes';
import { AdminUserAuthority, AdminUserForbiddenError, AdminUserConflictError } from '../adminUserAuthority';

const testCo = 'test-co-user-create';
const adminId = 'admin-user-create-1';
const nonAdminId = 'user-create-op-1';

async function setupTables(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS companies (
      id text PRIMARY KEY,
      name text NOT NULL,
      document text NOT NULL DEFAULT '',
      trade_name text,
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      permissions text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS user_credentials (
      user_id text PRIMARY KEY,
      company_id text,
      password_hash text NOT NULL,
      password_updated_at timestamptz NOT NULL DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS user_company_memberships (
      user_id text NOT NULL,
      company_id text NOT NULL,
      role text NOT NULL,
      permissions text[],
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, company_id)
    );`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      user_id text,
      action text NOT NULL,
      entity_name text NOT NULL DEFAULT 'User',
      entity_type text NOT NULL DEFAULT 'User',
      entity_id text NOT NULL,
      changes text,
      previous_state text,
      new_state text,
      timestamp timestamptz NOT NULL DEFAULT now(),
      correlation_id text,
      user_name text,
      ip_address text
    );`,
  ];

  for (const s of statements) {
    await db.execute(sql.raw(s));
  }

  // Garantir empresa de teste
  await db.execute(sql`
    INSERT INTO companies (id, name, document, trade_name, status, created_at, updated_at)
    VALUES (${testCo}, 'Empresa Teste Criação de Usuário', '99999999000199', 'Teste Usuário Ltda', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function runRegression(): Promise<void> {
  console.log('--- INICIANDO REGRESSÃO: Criação de Usuário no Admin (AUTOERP-93) ---');
  await setupTables();

  const adminActor = {
    userId: adminId,
    companyId: testCo,
    name: 'Admin Master',
    role: 'ADMIN',
    permissions: ['*'],
  };

  const operationalActor = {
    userId: nonAdminId,
    companyId: testCo,
    name: 'Operador Pátio',
    role: 'OPERATIONAL',
    permissions: ['VIEW_VEHICLE', 'RECORD_KM'],
  };

  // Cenário 1: Criação com senha provisória segura (>= 12 caracteres)
  console.log('[Cenário 1] Criação de novo usuário com senha provisória inicial...');
  const testEmail1 = `user.novo.${Date.now()}@autoerp.test`;
  const securePwd = 'SenhaForte2026!#';

  const created1 = await AdminUserAuthority.provisionUser(adminActor, {
    name: 'Novo Colaborador Um',
    email: testEmail1,
    role: 'OPERATIONAL',
    password: securePwd,
  });

  assert.ok(created1.id, 'Deve retornar o ID do usuário criado');
  assert.equal(created1.email, testEmail1);
  assert.equal(created1.role, 'OPERATIONAL');
  assert.equal(created1.active, true);

  // Verificar gravação na tabela user_credentials
  const credRows = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, created1.id))
    .limit(1);

  assert.equal(credRows.length, 1, 'Deve persistir credencial na tabela user_credentials');
  assert.ok(credRows[0].passwordHash, 'Hash da senha deve estar preenchido');
  const isValidPwd = await verifyPassword(securePwd, credRows[0].passwordHash);
  assert.equal(isValidPwd, true, 'A senha provisória criptografada com scrypt deve ser válida contra a senha informada');
  console.log('  ✓ Cenário 1 PASSOU: Usuário e credencial scrypt gerados com sucesso.\n');

  // Cenário 2: Validação de tamanho mínimo da senha (< 12 caracteres)
  console.log('[Cenário 2] Rejeição de senha curta (< 12 caracteres)...');
  const testEmail2 = `user.curto.${Date.now()}@autoerp.test`;
  await assert.rejects(
    async () => {
      await AdminUserAuthority.provisionUser(adminActor, {
        name: 'Usuário Senha Curta',
        email: testEmail2,
        role: 'OPERATIONAL',
        password: 'Curta123!', // 9 caracteres
      });
    },
    (err: any) => {
      assert.ok(err instanceof AdminUserConflictError || err.message?.includes('12 caracteres'));
      return true;
    },
    'Deve rejeitar senha curta com erro explicativo'
  );
  console.log('  ✓ Cenário 2 PASSOU: Senha com menos de 12 caracteres devidamente rejeitada.\n');

  // Cenário 3: Criação de usuário sem senha (ex: convite futuro)
  console.log('[Cenário 3] Criação de usuário sem fornecer senha inicial...');
  const testEmail3 = `user.sem.senha.${Date.now()}@autoerp.test`;
  const created3 = await AdminUserAuthority.provisionUser(adminActor, {
    name: 'Usuário Sem Senha',
    email: testEmail3,
    role: 'FINANCIAL',
  });
  assert.ok(created3.id);
  assert.equal(created3.role, 'FINANCIAL');

  const credRows3 = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, created3.id));
  assert.equal(credRows3.length, 0, 'Não deve criar credencial se senha não foi fornecida');
  console.log('  ✓ Cenário 3 PASSOU: Criação sem senha funciona sem poluir user_credentials.\n');

  // Cenário 4: Preservação de credencial de identidade multi-tenant pré-existente
  console.log('[Cenário 4] Preservação de senha já cadastrada para identidade multi-tenant...');
  const testEmailMulti = `multi.tenant.${Date.now()}@autoerp.test`;
  const originalPwd = 'SenhaOriginalIdentidade2026!';
  const firstCreated = await AdminUserAuthority.provisionUser(adminActor, {
    name: 'Multi Identidade',
    email: testEmailMulti,
    role: 'OPERATIONAL',
    password: originalPwd,
  });

  // Tenta provisionar na mesma ou em outra empresa passando outra senha provisória
  await AdminUserAuthority.provisionUser(adminActor, {
    name: 'Multi Identidade Atualizada',
    email: testEmailMulti,
    role: 'MANAGER',
    password: 'OutraSenhaNova2026!#',
  });

  const finalCredRows = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, firstCreated.id));
  assert.equal(finalCredRows.length, 1);
  const stillOriginal = await verifyPassword(originalPwd, finalCredRows[0].passwordHash);
  assert.equal(stillOriginal, true, 'Senha da identidade não deve ser sobrescrita silenciosamente por provisionamento');
  console.log('  ✓ Cenário 4 PASSOU: Credencial original preservada para usuário existente.\n');

  // Cenário 5: Guarda de privilégio: não-admin não pode gerenciar usuários
  console.log('[Cenário 5] Guarda de segurança: usuário sem MANAGE_USERS é bloqueado...');
  await assert.rejects(
    async () => {
      await AdminUserAuthority.provisionUser(operationalActor, {
        name: 'Tentativa Ilegal',
        email: 'hacker@autoerp.test',
        role: 'ADMIN',
      });
    },
    (err: any) => {
      assert.ok(err instanceof AdminUserForbiddenError || err.statusCode === 403);
      return true;
    },
    'Deve bloquear usuário não-administrador com 403 Forbidden'
  );
  console.log('  ✓ Cenário 5 PASSOU: Tentativa não autorizada bloqueada com 403 Forbidden.\n');

  // Cenário 6: Teste da rota HTTP POST /api/admin/users
  console.log('[Cenário 6] Teste da rota HTTP POST /api/admin/users...');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.headers['x-test-role'] === 'ANONYMOUS') {
      return next();
    }
    if (req.headers['x-test-role'] === 'OPERATIONAL') {
      (req as any).principal = {
        userId: nonAdminId,
        companyId: testCo,
        name: 'Operador',
        role: 'OPERATIONAL',
        active: true,
        permissions: ['VIEW_VEHICLE'],
      };
      return next();
    }
    (req as any).principal = {
      userId: adminId,
      companyId: testCo,
      name: 'Admin Master',
      role: 'ADMIN',
      active: true,
      permissions: ['*'],
    };
    next();
  });
  registerAdminUserRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const httpEmail = `user.http.${Date.now()}@autoerp.test`;
    const httpRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usuário Via API',
        email: httpEmail,
        role: 'READONLY',
        password: 'SenhaHttpValida2026!#',
      }),
    });

    assert.equal(httpRes.status, 201, 'Endpoint HTTP deve responder 201 Created');
    const httpData: any = await httpRes.json();
    assert.ok(httpData.item);
    assert.equal(httpData.item.email, httpEmail);
    assert.equal(httpData.item.role, 'READONLY');

    // Teste 403 via rota HTTP quando não-admin
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-role': 'OPERATIONAL',
      },
      body: JSON.stringify({
        name: 'Hacker Via API',
        email: 'hacker.http@autoerp.test',
        role: 'ADMIN',
      }),
    });
    assert.equal(forbiddenRes.status, 403, 'Endpoint HTTP deve responder 403 Forbidden para não-administrador');
    console.log('  ✓ Cenário 6 PASSOU: Rota HTTP POST /api/admin/users responde 201 e bloqueia 403 corretamente.\n');
  } finally {
    server.close();
  }

  console.log('================================================================');
  console.log('TODOS OS CENÁRIOS DE CRIAÇÃO DE USUÁRIO (AUTOERP-93) PASSARAM!');
  console.log('================================================================');
}

runRegression().catch((err) => {
  console.error('FALHA NA REGRESSÃO AUTOERP-93:', err);
  process.exit(1);
});
