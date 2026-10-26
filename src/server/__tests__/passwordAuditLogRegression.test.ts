import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import express from 'express';
import { db } from '../../db/index';
import { sql, eq, and } from 'drizzle-orm';
import { companies, users, auditLogs } from '../../db/schema';
import { userCompanyMemberships, userCredentials } from '../../db/authSchema';
import { hashPassword, verifyPassword } from '../password';
import { AdminUserAuthority } from '../adminUserAuthority';
import { registerUserProfileRoutes } from '../userProfileRoutes';
import { registerBootstrapRoutes } from '../bootstrapRoutes';
import { recordCredentialAuditEvent, HASH_SECRET_PATTERN, assertNoSecretsInAuditPayload } from '../credentialAudit';
import { PostgresAuthCredentialRepository } from '../../db/repositories/postgresAuthRepository';
import { runV2DemoSeed } from '../../db/v2DemoSeed';

const testCo = 'co-audit-pwd-ph079';
const adminId = 'admin-audit-ph079';
const targetUserId = 'user-target-ph079';
const bootCo = 'co-boot-pwd-ph079';
const bootAdminId = 'boot-admin-ph079';
const demoCo = 'co-demo-pwd-ph079';
const demoAdminId = 'demo-admin-ph079';

async function setupFixtures(): Promise<void> {
  const regCheck: any = await db.execute(sql`SELECT to_regclass('companies') AS tbl`);
  const hasCompanies = Boolean(regCheck.rows?.[0]?.tbl || regCheck[0]?.tbl);

  if (!hasCompanies) {
    const client = (db as any).$client;
    if (client && typeof client.exec === 'function') {
      const migrationFiles = readdirSync('drizzle')
        .filter((name) => name.endsWith('.sql'))
        .sort();
      for (const file of migrationFiles) {
        const sqlContent = readFileSync(`drizzle/${file}`, 'utf8');
        await client.exec(sqlContent);
      }
    } else {
      throw new Error(
        'Tabela "companies" não encontrada e a conexão não é PGlite. ' +
        'Este teste requer que as migrações canônicas tenham sido executadas (job integration do CI via migrate_test_db.cjs).'
      );
    }
  }
}

async function cleanTestData(): Promise<void> {
  // Regra 3.2 do CLAUDE.md: NUNCA executar DELETE em audit_logs (append-only trigger em Postgres).
  const companiesToDelete = [testCo, bootCo, demoCo];
  for (const cId of companiesToDelete) {
    await db.execute(sql`DELETE FROM user_company_memberships WHERE company_id = ${cId}`);
    await db.execute(sql`DELETE FROM user_credentials WHERE company_id = ${cId}`);
    await db.execute(sql`DELETE FROM users WHERE company_id = ${cId}`);
    await db.execute(sql`DELETE FROM companies WHERE id = ${cId}`);
  }
}

async function runPasswordAuditLogRegression(): Promise<void> {
  console.log('[PH-079] Iniciando suíte de regressão de auditoria de credenciais...');

  await setupFixtures();
  await cleanTestData();

  const now = new Date();

  // 1. Setup Tenants e Usuários de teste
  await db.insert(companies).values([
    {
      id: testCo,
      name: 'Empresa Teste Auditoria Senha',
      document: '12.345.678/0001-90',
      tradeName: 'Empresa PH079',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: bootCo,
      name: 'Empresa Bootstrap PH079',
      document: '98.765.432/0001-10',
      tradeName: 'Boot Co',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoCo,
      name: 'Empresa Demo PH079',
      document: '11.222.333/0001-44',
      tradeName: 'Demo Co',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const initialPasswordTarget = 'MinhaSenhaAntiga@123';
  const initialHashTarget = await hashPassword(initialPasswordTarget);

  await db.insert(users).values([
    {
      id: adminId,
      companyId: testCo,
      name: 'Admin Auditoria PH079',
      email: 'admin.ph079@test.invalid',
      role: 'ADMIN',
      active: true,
      permissions: ['*'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: targetUserId,
      companyId: testCo,
      name: 'Operador Alvo PH079',
      email: 'operador.ph079@test.invalid',
      role: 'OPERATIONAL',
      active: true,
      permissions: ['VIEW_VEHICLE'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: bootAdminId,
      companyId: bootCo,
      name: 'Admin Provisionado Bootstrap',
      email: 'boot.admin@test.invalid',
      role: 'ADMIN',
      active: true,
      permissions: ['*'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoAdminId,
      companyId: demoCo,
      name: 'Admin Preexistente Demo',
      email: 'demo.preexistente@test.invalid',
      role: 'ADMIN',
      active: true,
      permissions: ['*'],
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(userCredentials).values({
    userId: targetUserId,
    companyId: testCo,
    passwordHash: initialHashTarget,
    passwordUpdatedAt: now,
  });

  // --------------------------------------------------------------------------
  // CASO A: Troca de senha pelo próprio usuário (POST /api/me/change-password)
  // --------------------------------------------------------------------------
  console.log('  [1/6] Testando troca de senha pelo próprio usuário (self-service)...');
  const selfApp = express();
  selfApp.use(express.json());
  selfApp.use((req, _res, next) => {
    (req as any).principal = {
      userId: targetUserId,
      name: 'Operador Alvo PH079',
      companyId: testCo,
      role: 'OPERATIONAL',
      permissions: ['VIEW_VEHICLE'],
    };
    next();
  });
  registerUserProfileRoutes(selfApp);

  const selfServer = createServer(selfApp);
  await new Promise<void>((resolve) => selfServer.listen(0, resolve));
  const selfPort = (selfServer.address() as any).port;

  const newSelfPassword = 'NovaSenhaSegura@SelfService456';
  const selfClientIp = '203.0.113.195';

  const selfResp = await fetch(`http://127.0.0.1:${selfPort}/api/me/change-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': selfClientIp,
    },
    body: JSON.stringify({
      currentPassword: initialPasswordTarget,
      newPassword: newSelfPassword,
    }),
  });

  assert.equal(selfResp.status, 200, `Esperado 200 na troca de senha self-service, recebido ${selfResp.status}`);
  const selfBody: any = await selfResp.json();
  assert.equal(selfBody.success, true);

  await new Promise<void>((resolve) => selfServer.close(() => resolve()));

  // Verificar credencial atualizada no banco
  const [credAfterSelf] = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, targetUserId));
  assert.ok(credAfterSelf, 'Credencial deve existir');
  const isSelfNewValid = await verifyPassword(newSelfPassword, credAfterSelf.passwordHash);
  assert.equal(isSelfNewValid, true, 'Nova senha deve ser válida');

  // Verificar gravação do log em audit_logs
  const selfLogs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, testCo),
        eq(auditLogs.entityType, 'UserCredential'),
        eq(auditLogs.entityId, targetUserId),
        eq(auditLogs.action, 'UPDATE')
      )
    );

  const selfAuditLog = selfLogs.find((l) => (l.changes || '').includes('PASSWORD_CHANGE_SELF'));
  assert.ok(selfAuditLog, 'Registro de audit_logs para PASSWORD_CHANGE_SELF deve existir');
  assert.equal(selfAuditLog.userId, targetUserId, 'Autor do log deve ser o próprio usuário');
  assert.equal(selfAuditLog.ipAddress, selfClientIp, 'IP do cliente deve ser registrado');
  assert.ok(selfAuditLog.timestamp, 'Timestamp deve estar preenchido');

  // Regra crítica de segurança: NUNCA conter nem a senha em texto plano nem o hash scrypt
  const selfChanges = selfAuditLog.changes || '';
  assert.equal(selfChanges.includes(initialPasswordTarget), false, 'Audit log NÃO pode conter senha anterior');
  assert.equal(selfChanges.includes(newSelfPassword), false, 'Audit log NÃO pode conter nova senha');
  assert.equal(HASH_SECRET_PATTERN.test(selfChanges), false, 'Audit log NÃO pode conter hash criptográfico (scrypt/bcrypt)');
  assert.equal(selfChanges.toLowerCase().includes('passwordhash'), false, 'Audit log NÃO pode conter chave de hash');

  console.log('    ✓ Caso A aprovado: troca self-service registrada com autor, IP, data e sem expor credenciais.');

  // --------------------------------------------------------------------------
  // CASO B: Reset administrativo de senha (AdminUserAuthority.updateUser)
  // --------------------------------------------------------------------------
  console.log('  [2/6] Testando reset de senha por administrador...');
  const adminActor = {
    companyId: testCo,
    userId: adminId,
    name: 'Admin Auditoria PH079',
    role: 'ADMIN',
    permissions: ['*'],
    ipAddress: '198.51.100.77',
  };

  const adminNewPassword = 'AdminResetSenha@789XYZ';
  await AdminUserAuthority.updateUser(adminActor, targetUserId, {
    password: adminNewPassword,
  });

  const [credAfterAdmin] = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, targetUserId));
  const isAdminNewValid = await verifyPassword(adminNewPassword, credAfterAdmin.passwordHash);
  assert.equal(isAdminNewValid, true, 'Senha redefinida pelo admin deve ser válida');

  const adminLogs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, testCo),
        eq(auditLogs.entityType, 'UserCredential'),
        eq(auditLogs.entityId, targetUserId),
        eq(auditLogs.action, 'UPDATE')
      )
    );

  const adminAuditLog = adminLogs.find((l) => (l.changes || '').includes('PASSWORD_RESET_ADMIN'));
  assert.ok(adminAuditLog, 'Registro de audit_logs para PASSWORD_RESET_ADMIN deve existir');
  assert.equal(adminAuditLog.userId, adminId, 'Autor do log deve ser o administrador');
  assert.equal(adminAuditLog.ipAddress, '198.51.100.77', 'IP do admin deve ser registrado');

  const adminChanges = adminAuditLog.changes || '';
  assert.equal(adminChanges.includes(adminNewPassword), false, 'Audit log NÃO pode conter senha resetada pelo admin');
  assert.equal(HASH_SECRET_PATTERN.test(adminChanges), false, 'Audit log NÃO pode conter hash scrypt ou bcrypt');
  const parsedAdminChanges = JSON.parse(adminChanges);
  const parsedAdminNewState = JSON.parse(parsedAdminChanges.newState);
  assert.equal(parsedAdminNewState.resetByUserId, adminId, 'Deve conter identificador do admin que resetou');
  assert.equal(parsedAdminNewState.targetUserId, targetUserId);

  console.log('    ✓ Caso B aprovado: reset pelo admin registrado com autor admin, IP, e sem expor segredos.');

  // --------------------------------------------------------------------------
  // CASO C: Criação de novo usuário com senha inicial (AdminUserAuthority.provisionUser)
  // --------------------------------------------------------------------------
  console.log('  [3/6] Testando criação de usuário com credencial inicial pelo admin...');
  const newCreatedPassword = 'InitialUserSenha@456ABC';
  const createdUser = await AdminUserAuthority.provisionUser(adminActor, {
    name: 'Novo Operador Criado',
    email: 'novo.operador@test.invalid',
    role: 'OPERATIONAL',
    password: newCreatedPassword,
  });

  const [credCreated] = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, createdUser.id));
  assert.ok(credCreated, 'Credencial inicial deve ter sido persistida');
  const isCreatedValid = await verifyPassword(newCreatedPassword, credCreated.passwordHash);
  assert.equal(isCreatedValid, true, 'Senha criada deve ser válida');

  const createLogs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, testCo),
        eq(auditLogs.entityType, 'UserCredential'),
        eq(auditLogs.entityId, createdUser.id),
        eq(auditLogs.action, 'CREATE')
      )
    );

  const createAuditLog = createLogs.find((l) => (l.changes || '').includes('CREDENTIAL_CREATE_ADMIN'));
  assert.ok(createAuditLog, 'Registro de audit_logs para CREDENTIAL_CREATE_ADMIN deve existir');
  assert.equal(createAuditLog.userId, adminId, 'Autor do log deve ser o administrador criador');
  const createChanges = createAuditLog.changes || '';
  assert.equal(createChanges.includes(newCreatedPassword), false, 'Audit log NÃO pode conter senha');
  assert.equal(HASH_SECRET_PATTERN.test(createChanges), false, 'Audit log NÃO pode conter hash');

  console.log('    ✓ Caso C aprovado: criação com senha inicial auditada com autor e sem segredos.');

  // --------------------------------------------------------------------------
  // CASO D: Bootstrap do primeiro admin chamando a rota real de produção
  // --------------------------------------------------------------------------
  console.log('  [4/6] Testando auditoria de credencial no bootstrap real via HTTP de produção...');
  const bootstrapPassword = 'BootstrapAdmin@StrongPass999';
  const bootstrapToken = 'valid-bootstrap-token-ph079-secret-test';
  const bootstrapIp = '198.51.100.99';
  process.env.AUTOERP_BOOTSTRAP_TOKEN = bootstrapToken;

  const bootApp = express();
  bootApp.use(express.json());
  registerBootstrapRoutes(bootApp, { skipRateLimit: true });

  const bootServer = createServer(bootApp);
  await new Promise<void>((resolve) => bootServer.listen(0, resolve));
  const bootPort = (bootServer.address() as any).port;

  const bootResp = await fetch(`http://127.0.0.1:${bootPort}/api/auth/bootstrap`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-autoerp-bootstrap-token': bootstrapToken,
      'x-forwarded-for': bootstrapIp,
    },
    body: JSON.stringify({
      companyId: bootCo,
      userId: bootAdminId,
      companyDocument: '98.765.432/0001-10',
      email: 'boot.admin@test.invalid',
      password: bootstrapPassword,
    }),
  });

  assert.equal(bootResp.status, 201, `Esperado 201 no bootstrap, recebido ${bootResp.status}`);
  await new Promise<void>((resolve) => bootServer.close(() => resolve()));

  // Conferir que credencial foi criada e valida
  const [credBoot] = await db
    .select()
    .from(userCredentials)
    .where(eq(userCredentials.userId, bootAdminId));
  assert.ok(credBoot, 'Credencial de bootstrap deve existir');
  const isBootValid = await verifyPassword(bootstrapPassword, credBoot.passwordHash);
  assert.equal(isBootValid, true, 'Senha de bootstrap deve ser válida');

  const bootLogs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, bootCo),
        eq(auditLogs.entityType, 'UserCredential'),
        eq(auditLogs.entityId, bootAdminId),
        eq(auditLogs.action, 'UPDATE')
      )
    );

  const bootAuditLog = bootLogs.find((l) => (l.changes || '').includes('BOOTSTRAP_FIRST_ADMIN_CREDENTIAL'));
  assert.ok(bootAuditLog, 'Audit log de bootstrap real deve existir');
  assert.equal(bootAuditLog.ipAddress, bootstrapIp);
  const bootChanges = bootAuditLog.changes || '';
  assert.equal(bootChanges.includes(bootstrapPassword), false, 'Audit log de bootstrap NÃO pode conter senha');
  assert.equal(HASH_SECRET_PATTERN.test(bootChanges), false, 'Audit log de bootstrap NÃO pode conter hash scrypt nem bcrypt');

  console.log('    ✓ Caso D aprovado: bootstrap executado via HTTP real e auditado com evento e IP.');

  // --------------------------------------------------------------------------
  // CASO E: Seed de Demonstração (v2DemoSeed)
  // --------------------------------------------------------------------------
  console.log('  [5/6] Testando auditoria de credenciais no seed de demonstração (v2DemoSeed)...');
  const savedBranch = process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || process.env.BRANCH;
  delete process.env.RENDER_GIT_BRANCH;
  delete process.env.GIT_BRANCH;
  delete process.env.BRANCH;
  process.env.ALLOW_V2_DEMO_SEED = 'YES_V2_NON_PRODUCTION_ONLY';
  process.env.V2_DEMO_SEED_TARGET = 'test';
  process.env.V2_DEMO_COMPANY_ID = demoCo;

  await runV2DemoSeed();
  if (savedBranch) process.env.GIT_BRANCH = savedBranch;

  const demoSeedLogs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, demoCo),
        eq(auditLogs.entityType, 'UserCredential'),
        eq(auditLogs.action, 'UPDATE')
      )
    );

  const seedCredLogs = demoSeedLogs.filter((l) => (l.changes || '').includes('SEED_DEMO_CREDENTIAL'));
  assert.ok(seedCredLogs.length >= 5, `Esperado no mínimo 5 logs de seed de credencial, encontrado ${seedCredLogs.length}`);

  for (const slog of seedCredLogs) {
    const raw = slog.changes || '';
    assert.equal(HASH_SECRET_PATTERN.test(raw), false, 'Audit log de seed de demo NÃO pode conter hash criptográfico');
    assert.equal(raw.includes('DemoSenha@123456'), false, 'Audit log de seed de demo NÃO pode conter a senha do demo');
    assert.equal(slog.userId, demoAdminId, 'Autor do seed deve ser o usuário ativo que disparou o seed');
    assert.equal(slog.ipAddress, '127.0.0.1');
  }

  console.log('    ✓ Caso E aprovado: seed de demonstração audita todas as credenciais geradas sem expor segredos.');

  // --------------------------------------------------------------------------
  // CASO F: Invariantes Estritas de Segurança (Scrubber Scrypt/Bcrypt & Fail-Closed)
  // --------------------------------------------------------------------------
  console.log('  [6/6] Testando barreiras de segurança: bloqueio de hash real scrypt, bcrypt e fail-closed de setPasswordHash...');

  // 1. Provar que o HASH REAL do AutoERP (scrypt$1$16384$8$1$...) é rigorosamente barrado pelo scrubber
  const sampleRealScryptHash = await hashPassword('QualquerSenhaParaTesteScrypt@123');
  assert.ok(sampleRealScryptHash.startsWith('scrypt$1$'), 'O hash real do sistema deve ser scrypt$1$');

  let rejectedScrypt = false;
  try {
    assertNoSecretsInAuditPayload(`{"targetUserId":"${sampleRealScryptHash}"}`);
  } catch (err: any) {
    if (err.message?.includes('SECURITY_VIOLATION')) rejectedScrypt = true;
  }
  assert.equal(rejectedScrypt, true, 'Scrubber DEVE barrar hash real scrypt com SECURITY_VIOLATION');

  // 2. Provar que bcrypt também é barrado
  let rejectedBcrypt = false;
  try {
    assertNoSecretsInAuditPayload('{"targetUserId":"$2b$12$eX4mPl3H4shV10l4t10nF0rb1dd3n1234567890"}');
  } catch (err: any) {
    if (err.message?.includes('SECURITY_VIOLATION')) rejectedBcrypt = true;
  }
  assert.equal(rejectedBcrypt, true, 'Scrubber DEVE barrar hash bcrypt com SECURITY_VIOLATION');

  // 3. Provar que setPasswordHash exige auditActor obrigatoriamente (fail-closed, nunca silencioso)
  let rejectedMissingAuditActor = false;
  try {
    await db.transaction(async (tx) => {
      const repo = new PostgresAuthCredentialRepository(tx);
      // Chamada deliberadamente inválida sem auditActor
      await (repo as any).setPasswordHash({
        companyId: testCo,
        userId: targetUserId,
        passwordHash: sampleRealScryptHash,
      });
    });
  } catch (err: any) {
    if (err.message?.includes('AUTH_CREDENTIAL_AUDIT_REQUIRED')) rejectedMissingAuditActor = true;
  }
  assert.equal(rejectedMissingAuditActor, true, 'setPasswordHash DEVE exigir auditActor obrigatoriamente (fail-closed)');

  // 4. Prova de Presença das Invariantes no Código de Produção
  const userProfileSource = readFileSync('src/server/userProfileRoutes.ts', 'utf8');
  assert.ok(userProfileSource.includes('recordCredentialAuditEvent(') && userProfileSource.includes('PASSWORD_CHANGE_SELF'));

  const adminAuthoritySource = readFileSync('src/server/adminUserAuthority.ts', 'utf8');
  assert.ok(adminAuthoritySource.includes('recordCredentialAuditEvent(') && adminAuthoritySource.includes('PASSWORD_RESET_ADMIN') && adminAuthoritySource.includes('CREDENTIAL_CREATE_ADMIN'));

  const bootstrapRoutesSource = readFileSync('src/server/bootstrapRoutes.ts', 'utf8');
  assert.ok(bootstrapRoutesSource.includes('setPasswordHash(') && bootstrapRoutesSource.includes('BOOTSTRAP_FIRST_ADMIN_CREDENTIAL'));

  const seedSource = readFileSync('src/db/v2DemoSeed.ts', 'utf8');
  assert.ok(seedSource.includes('recordCredentialAuditEvent(') && seedSource.includes('SEED_DEMO_CREDENTIAL'));

  console.log('    ✓ Caso F aprovado: scrubber barra scrypt real, setPasswordHash é fail-closed e invariantes vigiadas.');

  await cleanTestData();
  console.log('\n[PH-079] TODOS OS TESTES PASSARAM COM SUCESSO!\n');
}

runPasswordAuditLogRegression().catch((err) => {
  console.error('[PH-079] FALHA NA REGRESSÃO:', err);
  process.exit(1);
});
