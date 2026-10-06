import assert from 'node:assert/strict';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { registerAdminUserRoutes } from '../adminUserRoutes';

const companyIdA = 'perm-company-a';
const companyIdB = 'perm-company-b';
const admin1Id = 'perm-admin-1';
const admin2Id = 'perm-admin-2';
const operUser1Id = 'perm-oper-1';
const foreignUserBId = 'perm-foreign-b';

function resultRows(result: any): Record<string, any>[] {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function runRegression(): Promise<void> {
  console.log('--- Starting userPermissionsMatrixRegression ---');

  // 0. Ensure tables exist in PGlite
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS companies (
      id text PRIMARY KEY,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      permissions text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      user_id text,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      changes text,
      timestamp timestamptz NOT NULL DEFAULT now(),
      correlation_id text,
      ip_address text
    )
  `);

  // 1. Setup companies & users
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyIdA}, 'Perm Co A', 'ACTIVE', NOW(), NOW()),
      (${companyIdB}, 'Perm Co B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, permissions, created_at, updated_at) VALUES
      (${admin1Id}, ${companyIdA}, 'Admin Um', 'admin1@perm.test', 'ADMIN', true, ARRAY['*'], NOW(), NOW()),
      (${admin2Id}, ${companyIdA}, 'Admin Dois', 'admin2@perm.test', 'ADMIN', true, ARRAY['*'], NOW(), NOW()),
      (${operUser1Id}, ${companyIdA}, 'Operador Um', 'oper1@perm.test', 'OPERATIONAL', true, ARRAY['VIEW_VEHICLE', 'RECORD_KM'], NOW(), NOW()),
      (${foreignUserBId}, ${companyIdB}, 'Foreign B', 'foreign@perm.test', 'OPERATIONAL', true, ARRAY['VIEW_VEHICLE'], NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, active = EXCLUDED.active, permissions = EXCLUDED.permissions
  `);

  // 2. Setup Express & Routes
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
    const role = typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : '';
    const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
    if (companyId && role && userId) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId,
        userId,
        name: 'Perm Tester',
        role,
        permissions: role === 'ADMIN' ? ['*'] : [],
      };
    }
    next();
  });
  registerAdminUserRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  const request = async (
    route: string,
    method = 'GET',
    body?: any,
    principal?: { companyId: string; role: string; userId: string },
  ): Promise<{ status: number; data: any }> => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (principal) {
      headers.set('x-test-company', principal.companyId);
      headers.set('x-test-role', principal.role);
      headers.set('x-test-user', principal.userId);
    }
    const res = await fetch(`${base}${route}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };

  const adminA1 = { companyId: companyIdA, role: 'ADMIN', userId: admin1Id };
  const operA = { companyId: companyIdA, role: 'OPERATIONAL', userId: operUser1Id };
  const adminB = { companyId: companyIdB, role: 'ADMIN', userId: 'foreign-admin-b' };

  try {
    // Test 1: Unauthenticated returns 401
    {
      const res = await request(`/api/admin/users/${operUser1Id}/permissions`, 'PATCH', {
        role: 'FINANCIAL',
        permissions: ['VIEW_FINANCE'],
      });
      assert.equal(res.status, 401, 'Unauthenticated permissions update must be 401');
      console.log('✓ Test 1: Unauthenticated request rejected with 401');
    }

    // Test 2: Non-admin caller returns 403
    {
      const res = await request(`/api/admin/users/${operUser1Id}/permissions`, 'PATCH', {
        role: 'FINANCIAL',
        permissions: ['VIEW_FINANCE'],
      }, operA);
      assert.equal(res.status, 403, 'Non-admin caller must be 403');
      console.log('✓ Test 2: Non-admin caller rejected with 403');
    }

    // Test 3: Admin successfully updates role and permissions matrix
    {
      const newPerms = ['VIEW_FINANCE', 'RECEIPT_REGISTER', 'PAYMENT_REGISTER', 'RECEIVABLE_MUTATE'];
      const res = await request(`/api/admin/users/${operUser1Id}/permissions`, 'PATCH', {
        role: 'FINANCIAL',
        permissions: newPerms,
      }, adminA1);
      assert.equal(res.status, 200, 'Admin permissions update must succeed with 200');
      assert.equal(res.data.item.role, 'FINANCIAL');
      assert.deepEqual(res.data.item.permissions.sort(), newPerms.sort());

      // Check DB persistence
      const rows = resultRows(await db.execute(sql`
        SELECT role, permissions FROM users WHERE id = ${operUser1Id}
      `));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].role, 'FINANCIAL');
      assert.deepEqual(rows[0].permissions.sort(), newPerms.sort());

      // Check audit log
      const logs = resultRows(await db.execute(sql`
        SELECT action, changes FROM audit_logs
        WHERE company_id = ${companyIdA} AND entity_type = 'User' AND entity_id = ${operUser1Id}
        ORDER BY timestamp DESC LIMIT 1
      `));
      assert.equal(logs.length, 1);
      const changes = JSON.parse(logs[0].changes);
      const newState = JSON.parse(changes.newState);
      assert.equal(newState.role, 'FINANCIAL');
      console.log('✓ Test 3: Admin successfully updated role and permissions matrix with audit log');
    }

    // Test 4: Last active admin protection (cannot demote last active admin)
    {
      // First deactivate admin2
      const deactRes = await request(`/api/admin/users/${admin2Id}/status`, 'PATCH', { active: false }, adminA1);
      assert.equal(deactRes.status, 200);

      // Now admin1 is the ONLY active admin in company A
      // Try to demote admin1 to OPERATIONAL -> must fail with 409
      const demoteRes = await request(`/api/admin/users/${admin1Id}/permissions`, 'PATCH', {
        role: 'OPERATIONAL',
        permissions: ['VIEW_VEHICLE'],
      }, adminA1);
      assert.equal(demoteRes.status, 409, 'Demoting last active admin must return 409 Conflict');
      console.log('✓ Test 4: Protection of last active admin enforced (409 Conflict)');

      // Reactivate admin2
      await request(`/api/admin/users/${admin2Id}/status`, 'PATCH', { active: true }, adminA1);
    }

    // Test 5: Cross-tenant isolation
    {
      // Admin A tries to modify user from Company B -> must return 404
      const res = await request(`/api/admin/users/${foreignUserBId}/permissions`, 'PATCH', {
        role: 'MANAGER',
        permissions: ['VIEW_VEHICLE'],
      }, adminA1);
      assert.equal(res.status, 404, 'Cross-tenant user update must return 404 Not Found');
      console.log('✓ Test 5: Cross-tenant isolation verified (404 Not Found)');
    }

    // Test 6: Invalid body payload returns 400
    {
      const res1 = await request(`/api/admin/users/${operUser1Id}/permissions`, 'PATCH', {
        role: '',
        permissions: ['VIEW_VEHICLE'],
      }, adminA1);
      assert.equal(res1.status, 400, 'Empty role must return 400');

      const res2 = await request(`/api/admin/users/${operUser1Id}/permissions`, 'PATCH', {
        role: 'MANAGER',
        permissions: 'not-an-array',
      }, adminA1);
      assert.equal(res2.status, 400, 'Invalid permissions array must return 400');
      console.log('✓ Test 6: Invalid body rejected with 400');
    }

    console.log('--- All 6 userPermissionsMatrixRegression tests passed! ---');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runRegression().catch((err) => {
  console.error('Regression failed:', err);
  process.exit(1);
});
