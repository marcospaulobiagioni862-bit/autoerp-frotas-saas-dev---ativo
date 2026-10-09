import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
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
const { PostgresAuthCredentialRepository } = await import('../../db/repositories/postgresAuthRepository');
import { verifyPassword, hashPassword } from '../password';
import {
  issueSessionToken,
  extractSessionTokenFromCookie,
  buildSessionCookie,
  SESSION_TTL_SECONDS,
} from '../session';
import {
  authenticateTokenPrincipal,
  type AuthenticatedPrincipal,
  type AuthenticatedUserRecord,
} from '../auth';
import { registerAdminUserRoutes } from '../adminUserRoutes';
import { AdminUserAuthority, AdminUserForbiddenError } from '../adminUserAuthority';

// Empresas de teste
const companyA = 'test-co-alpha';
const companyB = 'test-co-bravo';
const companyC = 'test-co-charlie';

// Usuários de teste
const singleTenantUserId = 'user-single-co';
const multiTenantUserId = 'user-multi-co';
const adminAId = 'admin-alpha-1';

const testPassword = 'Password-MultiTenant-2026!';

const JWT_CONFIG = {
  secret: 'super-secret-jwt-key-with-at-least-32-characters-length!',
  issuer: 'autoerp-test',
  audience: 'autoerp-audience',
};

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
    )`,
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
    )`,
    `CREATE TABLE IF NOT EXISTS user_credentials (
      user_id text PRIMARY KEY,
      password_hash text NOT NULL,
      company_id text,
      password_updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS user_company_memberships (
      user_id text NOT NULL,
      company_id text NOT NULL,
      role text NOT NULL,
      permissions text[],
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, company_id)
    )`,
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
    )`
  ];
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
}

async function seedData(): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM user_company_memberships WHERE user_id IN (${singleTenantUserId}, ${multiTenantUserId}, ${adminAId})`);
    await db.execute(sql`DELETE FROM user_credentials WHERE user_id IN (${singleTenantUserId}, ${multiTenantUserId}, ${adminAId})`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${singleTenantUserId}, ${multiTenantUserId}, ${adminAId})`);
    await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA}, ${companyB}, ${companyC})`);
  } catch {}

  // 1. Criar empresas ativas
  await db.execute(sql`
    INSERT INTO companies (id, name, document, trade_name, status, created_at, updated_at) VALUES
      (${companyA}, 'Locadora Alpha Ltda', '11111111000101', 'Alpha Rent', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'Locadora Bravo S/A', '22222222000102', 'Bravo Frotas', 'ACTIVE', NOW(), NOW()),
      (${companyC}, 'Locadora Charlie Eireli', '33333333000103', 'Charlie Fleet', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  const passwordHash = await hashPassword(testPassword);

  // 2. Usuário com 1 empresa única (Company C)
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, permissions, created_at, updated_at) VALUES
      (${singleTenantUserId}, ${companyC}, 'Usuario Single', 'single@autoerp.test', 'OPERATIONAL', true, ARRAY['VIEW_VEHICLE'], NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO user_credentials (user_id, password_hash, company_id, password_updated_at) VALUES
      (${singleTenantUserId}, ${passwordHash}, ${companyC}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `);
  await db.execute(sql`
    INSERT INTO user_company_memberships (user_id, company_id, role, permissions, active, created_at, updated_at) VALUES
      (${singleTenantUserId}, ${companyC}, 'OPERATIONAL', ARRAY['VIEW_VEHICLE'], true, NOW(), NOW())
    ON CONFLICT (user_id, company_id) DO NOTHING
  `);

  // 3. Usuário com 2 empresas (Company A como ADMIN, Company B como READONLY)
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, permissions, created_at, updated_at) VALUES
      (${multiTenantUserId}, ${companyA}, 'Usuario Multi', 'multi@autoerp.test', 'ADMIN', true, ARRAY['*'], NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO user_credentials (user_id, password_hash, company_id, password_updated_at) VALUES
      (${multiTenantUserId}, ${passwordHash}, ${companyA}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `);
  await db.execute(sql`
    INSERT INTO user_company_memberships (user_id, company_id, role, permissions, active, created_at, updated_at) VALUES
      (${multiTenantUserId}, ${companyA}, 'ADMIN', ARRAY['*'], true, NOW(), NOW()),
      (${multiTenantUserId}, ${companyB}, 'READONLY', ARRAY['FLEET_READ'], true, NOW(), NOW())
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions, active = EXCLUDED.active
  `);

  // 4. Administrador da Empresa A (para testes de privilégio e multi-tenant)
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, permissions, created_at, updated_at) VALUES
      (${adminAId}, ${companyA}, 'Admin Alpha', 'admin.alpha@autoerp.test', 'ADMIN', true, ARRAY['*'], NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO user_credentials (user_id, password_hash, company_id, password_updated_at) VALUES
      (${adminAId}, ${passwordHash}, ${companyA}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `);
  await db.execute(sql`
    INSERT INTO user_company_memberships (user_id, company_id, role, permissions, active, created_at, updated_at) VALUES
      (${adminAId}, ${companyA}, 'ADMIN', ARRAY['*'], true, NOW(), NOW())
    ON CONFLICT (user_id, company_id) DO NOTHING
  `);
}

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Rota de login oficial espelhando a lógica implementada em server.ts
  app.post('/api/auth/login', async (req: Request, res: ExpressResponse) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const companyId = typeof req.body?.companyId === 'string' && req.body.companyId.trim() !== ''
        ? req.body.companyId.trim()
        : undefined;

      if (!email || !password) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // 1. Identidade única em users
      const userRows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          active: users.active,
        })
        .from(users)
        .where(and(eq(users.active, true), sql`lower(${users.email}) = ${email}`))
        .limit(2);

      if (userRows.length !== 1) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      const user = userRows[0];

      // 2. Validação da credencial única em user_credentials
      const credentialRepo = new PostgresAuthCredentialRepository(db);
      const credential = await credentialRepo.findByUserId(user.id);

      if (!credential?.passwordHash || !(await verifyPassword(password, credential.passwordHash))) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // 3. Consulta de memberships ativas e empresas ativas
      const memberships = await db
        .select({
          companyId: userCompanyMemberships.companyId,
          role: userCompanyMemberships.role,
          permissions: userCompanyMemberships.permissions,
          name: companies.name,
          document: companies.document,
          tradeName: companies.tradeName,
        })
        .from(userCompanyMemberships)
        .innerJoin(companies, eq(companies.id, userCompanyMemberships.companyId))
        .where(
          and(
            eq(userCompanyMemberships.userId, user.id),
            eq(userCompanyMemberships.active, true),
            eq(companies.status, 'ACTIVE')
          )
        );

      if (memberships.length === 0) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      let principal: AuthenticatedPrincipal | null = null;

      if (companyId) {
        const target = memberships.find((m) => m.companyId === companyId);
        if (!target) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }
        principal = {
          userId: user.id,
          companyId: target.companyId,
          name: user.name,
          role: target.role,
          permissions: Array.isArray(target.permissions) ? [...target.permissions] : [],
        };
      } else {
        if (memberships.length > 1) {
          res.json({
            requiresCompanySelection: true,
            availableCompanies: memberships.map((m) => ({
              id: m.companyId,
              name: m.name,
              document: m.document,
              tradeName: m.tradeName || null,
            })),
          });
          return;
        }

        const single = memberships[0];
        principal = {
          userId: user.id,
          companyId: single.companyId,
          name: user.name,
          role: single.role,
          permissions: Array.isArray(single.permissions) ? [...single.permissions] : [],
        };
      }

      const sessionToken = await issueSessionToken(principal, JWT_CONFIG);
      res.setHeader('Set-Cookie', buildSessionCookie(sessionToken, { secure: false, maxAgeSeconds: SESSION_TTL_SECONDS }));
      res.json({ user: principal, expiresInSeconds: SESSION_TTL_SECONDS });
    } catch (err) {
      console.error('LOGIN HANDLER CATCH ERROR:', err);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // Middleware /api de autenticação de sessão com autoridade de memberships
  app.use('/api', async (req: Request, res: ExpressResponse, next: NextFunction) => {
    try {
      const sessionToken = extractSessionTokenFromCookie(
        typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined
      );

      const findCurrentUser = async (userId: string, verifiedCompanyId: string): Promise<AuthenticatedUserRecord | null> => {
        const rows = await db
          .select({
            id: users.id,
            name: users.name,
            userActive: users.active,
            role: userCompanyMemberships.role,
            membershipActive: userCompanyMemberships.active,
            permissions: userCompanyMemberships.permissions,
            companyId: userCompanyMemberships.companyId,
          })
          .from(userCompanyMemberships)
          .innerJoin(users, eq(users.id, userCompanyMemberships.userId))
          .where(
            and(
              eq(userCompanyMemberships.userId, userId),
              eq(userCompanyMemberships.companyId, verifiedCompanyId)
            )
          )
          .limit(1);

        if (rows.length === 0) return null;
        const row = rows[0];
        return {
          id: row.id,
          companyId: row.companyId,
          name: row.name,
          role: row.role,
          active: Boolean(row.userActive && row.membershipActive),
          permissions: Array.isArray(row.permissions) ? [...row.permissions] : [],
        };
      };

      if (!sessionToken) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      req.principal = await authenticateTokenPrincipal(sessionToken, JWT_CONFIG, findCurrentUser);
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized: Invalid authentication' });
    }
  });

  registerAdminUserRoutes(app);
  return app;
}

export async function runMembershipsRegression(): Promise<void> {
  console.log('=== AUTOERP-82: REGRESSÃO OBRIGATÓRIA DE VÍNCULOS MULTI-TENANT E SENHA ÚNICA ===\n');

  await setupTables();
  await seedData();

  const app = buildTestApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -----------------------------------------------------------------------------------------
    // CENÁRIO 1: Usuário com 2 empresas
    // Login com email+senha devolve lista e, só depois de escolher, emite sessão com o papel DAQUELA empresa.
    // -----------------------------------------------------------------------------------------
    console.log('[Cenário 1] Login com 2 empresas ativas...');
    {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword }),
      });

      assert.equal(res.status, 200, 'Login inicial de usuário multi-empresa deve retornar 200');
      const data: any = await res.json();
      assert.equal(data.requiresCompanySelection, true, 'Deve solicitar seleção de empresa');
      assert.equal(Array.isArray(data.availableCompanies), true, 'Deve retornar lista de empresas');
      assert.equal(data.availableCompanies.length, 2, 'Deve conter as 2 empresas vinculadas (Alpha e Bravo)');

      const companyIds = data.availableCompanies.map((c: any) => c.id).sort();
      assert.deepEqual(companyIds, [companyA, companyB].sort(), 'As empresas disponíveis devem ser Alpha e Bravo');

      // Usuário escolhe a Empresa B (papel READONLY)
      const resSelectB = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword, companyId: companyB }),
      });

      assert.equal(resSelectB.status, 200, 'Login após seleção de empresa B deve retornar 200');
      const dataB: any = await resSelectB.json();
      assert.equal(dataB.user.companyId, companyB, 'Sessão emitida deve pertencer à Empresa B');
      assert.equal(dataB.user.role, 'READONLY', 'Papel emitido para Empresa B deve ser READONLY');
      assert.ok(dataB.user.permissions.includes('FLEET_READ'), 'Permissões emitidas devem ser da Empresa B');

      // Usuário escolhe a Empresa A (papel ADMIN)
      const resSelectA = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword, companyId: companyA }),
      });

      assert.equal(resSelectA.status, 200, 'Login após seleção de empresa A deve retornar 200');
      const dataA: any = await resSelectA.json();
      assert.equal(dataA.user.companyId, companyA, 'Sessão emitida deve pertencer à Empresa A');
      assert.equal(dataA.user.role, 'ADMIN', 'Papel emitido para Empresa A deve ser ADMIN');
      assert.ok(dataA.user.permissions.includes('*'), 'Permissões emitidas devem incluir * para ADMIN');

      console.log('  ✓ Cenário 1 PASSOU: 2 empresas devolve lista e emite sessão com papel da empresa escolhida.\n');
    }

    // -----------------------------------------------------------------------------------------
    // CENÁRIO 2: Usuário com 1 empresa
    // Entra direto, sem tela extra (não regredir o fluxo atual).
    // -----------------------------------------------------------------------------------------
    console.log('[Cenário 2] Login com 1 empresa única ativa...');
    {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'single@autoerp.test', password: testPassword }),
      });

      assert.equal(res.status, 200, 'Login de usuário de empresa única deve retornar 200');
      const data: any = await res.json();
      assert.equal(data.requiresCompanySelection, undefined, 'Não deve solicitar seleção de empresa');
      assert.ok(data.user, 'Deve retornar o usuário logado diretamente');
      assert.equal(data.user.companyId, companyC, 'Sessão emitida deve ser da empresa única (Company C)');
      assert.equal(data.user.role, 'OPERATIONAL', 'Papel emitido deve ser OPERATIONAL');

      console.log('  ✓ Cenário 2 PASSOU: Usuário com 1 empresa entra direto sem tela extra.\n');
    }

    // -----------------------------------------------------------------------------------------
    // CENÁRIO 3: Mesma senha funciona para as duas empresas
    // Prova que a senha é única por identidade (em user_credentials por user_id).
    // -----------------------------------------------------------------------------------------
    console.log('[Cenário 3] Mesma senha funciona para todas as empresas da identidade...');
    {
      const resA = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword, companyId: companyA }),
      });
      assert.equal(resA.status, 200, 'Senha deve autenticar na Empresa A');

      const resB = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword, companyId: companyB }),
      });
      assert.equal(resB.status, 200, 'Exata mesma senha deve autenticar na Empresa B');

      const resWrong = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: 'Senha-Errada-123!' }),
      });
      assert.equal(resWrong.status, 401, 'Senha incorreta deve ser rejeitada com 401');

      console.log('  ✓ Cenário 3 PASSOU: A senha é única por identidade e autentica em todas as empresas.\n');
    }

    // -----------------------------------------------------------------------------------------
    // CENÁRIO 4: Papel diferente por empresa
    // Mesma pessoa ADMIN na A e READONLY na B recebe 403 na B no que só ADMIN pode.
    // -----------------------------------------------------------------------------------------
    console.log('[Cenário 4] Autorização com papéis distintos por empresa...');
    {
      // 1. Obter cookie de sessão para a Empresa A (ADMIN)
      const loginA = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword, companyId: companyA }),
      });
      const cookieA = loginA.headers.get('set-cookie') || '';
      assert.ok(cookieA, 'Deve emitir cookie para a Empresa A');

      const adminReqA = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Cookie: cookieA },
      });
      assert.equal(adminReqA.status, 200, 'Como ADMIN na Empresa A, acesso à rota administrativa deve ser 200 OK');

      // 2. Obter cookie de sessão para a Empresa B (READONLY)
      const loginB = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'multi@autoerp.test', password: testPassword, companyId: companyB }),
      });
      const cookieB = loginB.headers.get('set-cookie') || '';
      assert.ok(cookieB, 'Deve emitir cookie para a Empresa B');

      const adminReqB = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Cookie: cookieB },
      });
      assert.equal(adminReqB.status, 403, 'Como READONLY na Empresa B, tentativa de acessar rota de admin DEVE receber 403 Forbidden!');

      console.log('  ✓ Cenário 4 PASSOU: Papel ADMIN na A permite administração; papel READONLY na B bloqueia com 403 Forbidden.\n');
    }

    // -----------------------------------------------------------------------------------------
    // CENÁRIO 5: Negativo de segurança multi-tenant
    // Admin da Empresa A tentando vincular/provisionar usuário para a Empresa B recebe 403 Forbidden.
    // -----------------------------------------------------------------------------------------
    console.log('[Cenário 5] Negativo de segurança: Admin da Empresa A não consegue vincular ninguém na Empresa B...');
    {
      const actorAlpha: any = {
        companyId: companyA,
        userId: adminAId,
        name: 'Admin Alpha',
        role: 'ADMIN',
        permissions: ['*'],
      };

      // 1. Chamada direta ao AdminUserAuthority tentando passar companyId de outra empresa
      await assert.rejects(
        async () => {
          await AdminUserAuthority.provisionUser(actorAlpha, {
            name: 'Invasor B',
            email: 'invasor.b@autoerp.test',
            role: 'OPERATIONAL',
            companyId: companyB,
          });
        },
        (error: any) => {
          assert.ok(error instanceof AdminUserForbiddenError, 'Deve lançar AdminUserForbiddenError');
          assert.match(error.message, /não é permitido gerenciar usuários de outra empresa/);
          return true;
        },
        'Admin da Empresa A não pode provisionar ou vincular usuário para a Empresa B'
      );

      // 2. Chamada via API HTTP com sessão de ADMIN da Empresa A enviando body com companyId da Empresa B
      const loginAdminA = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin.alpha@autoerp.test', password: testPassword, companyId: companyA }),
      });
      const adminCookie = loginAdminA.headers.get('set-cookie') || '';

      const postCrossTenant = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Tentativa Cross Tenant',
          email: 'cross.tenant@autoerp.test',
          role: 'OPERATIONAL',
          companyId: companyB,
        }),
      });

      assert.equal(postCrossTenant.status, 403, 'POST /api/admin/users com target companyId diferente do ator DEVE retornar 403 Forbidden');

      console.log('  ✓ Cenário 5 PASSOU: Tentativa de vincular usuário em outra empresa bloqueada com 403 Forbidden.\n');
    }

    console.log('========================================================================');
    console.log('AUTOERP-82: TODOS OS 5 CENÁRIOS REGRESSIVOS PASSARAM COM 100% DE SUCESSO!');
    console.log('========================================================================\n');
  } finally {
    server.close();
  }
}

if (process.argv[1]?.includes('userCompanyMembershipsRegression')) {
  runMembershipsRegression().then(() => process.exit(0)).catch((err) => {
    console.error('FALHA NA REGRESSÃO AUTOERP-82:', err);
    process.exit(1);
  });
}
