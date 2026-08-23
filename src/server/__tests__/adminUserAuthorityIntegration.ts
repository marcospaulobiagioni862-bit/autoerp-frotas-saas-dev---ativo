import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { authenticateTokenPrincipal } from '../auth';
import { issueSessionToken } from '../session';
import {
  AdminUserAuthority,
  AdminUserConflictError,
  AdminUserForbiddenError,
  AdminUserNotFoundError,
} from '../adminUserAuthority';

const companyA = 'security-2q1-company-a';
const companyB = 'security-2q1-company-b';
const adminA1 = 'security-2q1-admin-a1';
const adminA2 = 'security-2q1-admin-a2';
const userA = 'security-2q1-user-a';
const readonlyA = 'security-2q1-readonly-a';
const adminB = 'security-2q1-admin-b';
const foreignUserB = 'security-2q1-user-b';

const actorA1 = { companyId: companyA, userId: adminA1, name: 'Admin A1', role: 'ADMIN' };
const actorA2 = { companyId: companyA, userId: adminA2, name: 'Admin A2', role: 'ADMIN' };
const readonlyActor = { companyId: companyA, userId: readonlyA, name: 'Readonly A', role: 'READONLY' };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}
async function row(query: any): Promise<any> {
  return (await rows(query))[0];
}
async function rejects<T extends Error>(fn: () => Promise<unknown>, type: new (...args: any[]) => T): Promise<T> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof type, `expected ${type.name}, got ${String(error)}`);
    return error;
  }
  throw new Error(`expected ${type.name}, got success`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM auth_credentials WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA}, ${companyB})`);
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Security 2Q1 Company A','ACTIVE',NOW(),NOW()),
    (${companyB},'Security 2Q1 Company B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,permissions,created_at,updated_at) VALUES
    (${adminA1},${companyA},'Admin A1','2q1-admin-a1@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW()),
    (${adminA2},${companyA},'Admin A2','2q1-admin-a2@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW()),
    (${userA},${companyA},'User A','2q1-user-a@example.test','OPERATIONAL',true,ARRAY['FLEET_READ'],NOW(),NOW()),
    (${readonlyA},${companyA},'Readonly A','2q1-readonly-a@example.test','READONLY',true,ARRAY['FLEET_READ'],NOW(),NOW()),
    (${adminB},${companyB},'Admin B','2q1-admin-b@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW()),
    (${foreignUserB},${companyB},'User B','2q1-user-b@example.test','OPERATIONAL',true,ARRAY['FLEET_READ'],NOW(),NOW())`);
}

async function run(): Promise<void> {
  await seed();

  const listed = await AdminUserAuthority.list(actorA1);
  assert(listed.length === 4, 'tenant A ADMIN must list only tenant A users');
  assert(listed.every((item) => !('passwordHash' in (item as any)) && !('credential' in (item as any))), 'list response must not expose credential material');
  assert(listed.every((item) => item.id !== adminB && item.id !== foreignUserB), 'tenant B users must not leak into tenant A list');

  await rejects(() => AdminUserAuthority.list(readonlyActor), AdminUserForbiddenError);
  await rejects(() => AdminUserAuthority.setActive(readonlyActor, userA, false), AdminUserForbiddenError);

  const config = {
    secret: 'security-2q1-test-secret-that-is-long-enough',
    issuer: 'autoerp-security-2q1',
    audience: 'autoerp-security-2q1-tests',
  };
  const issuedBeforeDeactivation = await issueSessionToken({ userId: userA, companyId: companyA }, config, 300);

  const deactivated = await AdminUserAuthority.setActive(actorA1, userA, false);
  assert(deactivated.active === false, 'target user must be returned inactive');
  const persistedInactive = await row(sql`SELECT active FROM users WHERE id=${userA} AND company_id=${companyA}`);
  assert(persistedInactive?.active === false, 'target user must persist active=false');
  const deactivationAudit = await row(sql`SELECT entity_type,entity_id,action,changes FROM audit_logs WHERE company_id=${companyA} AND entity_id=${userA} ORDER BY created_at DESC LIMIT 1`);
  assert(deactivationAudit?.entity_type === 'User' && deactivationAudit?.action === 'UPDATE', 'status mutation must append User UPDATE audit');
  const changeText = JSON.stringify(deactivationAudit?.changes || {});
  assert(changeText.includes('false'), 'audit evidence must contain resulting inactive state');

  await rejects(
    () => authenticateTokenPrincipal(
      issuedBeforeDeactivation,
      config,
      async (userId, verifiedCompanyId) =>
        await UnitOfWork.run(verifiedCompanyId, async (txContext: any) =>
          await txContext.getUserRepo().findById(userId)
        )
    ),
    Error
  );

  const reactivated = await AdminUserAuthority.setActive(actorA1, userA, true);
  assert(reactivated.active === true, 'reactivation must persist active=true');
  const reactivationAuditCount = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_id=${userA} AND entity_type='User'`);
  assert(Number(reactivationAuditCount.count) === 2, 'deactivation and reactivation must each append audit evidence');

  await rejects(() => AdminUserAuthority.setActive(actorA1, foreignUserB, false), AdminUserNotFoundError);
  const foreignStillActive = await row(sql`SELECT active FROM users WHERE id=${foreignUserB} AND company_id=${companyB}`);
  assert(foreignStillActive?.active === true, 'foreign tenant user must remain unchanged');

  await rejects(() => AdminUserAuthority.setActive(actorA1, adminA1, false), AdminUserConflictError);
  const selfStillActive = await row(sql`SELECT active FROM users WHERE id=${adminA1} AND company_id=${companyA}`);
  assert(selfStillActive?.active === true, 'self-deactivation rejection must perform zero writes');

  // Two valid ADMIN principals can race after authentication. The tenant-scoped
  // advisory lock plus last-active-admin rule must allow at most one deactivation.
  const race = await Promise.allSettled([
    AdminUserAuthority.setActive(actorA1, adminA2, false),
    AdminUserAuthority.setActive(actorA2, adminA1, false),
  ]);
  assert(race.filter((item) => item.status === 'fulfilled').length === 1, 'concurrent ADMIN deactivations must have exactly one winner');
  const activeAdmins = await row(sql`SELECT COUNT(*)::int AS count FROM users WHERE company_id=${companyA} AND active=true AND upper(role)='ADMIN'`);
  assert(Number(activeAdmins.count) === 1, 'last active ADMIN must survive concurrent deactivation race');

  console.log('SECURITY-2Q1 PostgreSQL user administration authority integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
