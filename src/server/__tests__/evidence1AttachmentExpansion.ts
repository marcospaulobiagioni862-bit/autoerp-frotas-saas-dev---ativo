import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { registerAttachmentRoutes } from '../attachmentRoutes';
import type { AuthenticatedPrincipal } from '../auth';

const companyA = 'evidence-1-company-a';
const companyB = 'evidence-1-company-b';
const adminAId = 'evidence-1-admin-a';
const adminBId = 'evidence-1-admin-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyA}, 'Evidence 1 Company A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'Evidence 1 Company B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminAId}, ${companyA}, 'Evidence 1 Admin A', 'evidence1-a@example.test', 'ADMIN', true, NOW(), NOW()),
      (${adminBId}, ${companyB}, 'Evidence 1 Admin B', 'evidence1-b@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, current_km, created_at, updated_at) VALUES
      ('evidence-1-vehicle-a', ${companyA}, 'EVA1A01', 'EVARENAVAM-A', 'AVAILABLE', 1000, NOW(), NOW()),
      ('evidence-1-vehicle-b', ${companyB}, 'EVB1B01', 'EVARENAVAM-B', 'AVAILABLE', 2000, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO work_orders (
      id, company_id, number, vehicle_id, supplier_id, status, opened_at, started_at,
      completed_at, cancelled_at, entry_km, exit_km, description, diagnosis, notes,
      subtotal_parts, subtotal_services, subtotal_labor, discount, total,
      account_payable_id, created_by, created_at, updated_at
    ) VALUES
      ('evidence-1-workorder-a', ${companyA}, 'E1-OS-A', 'evidence-1-vehicle-a', NULL, 'OPEN', NOW(), NULL, NULL, NULL, 1000, NULL, 'Evidence A', NULL, NULL, 0, 0, 0, 0, 0, NULL, ${adminAId}, NOW(), NOW()),
      ('evidence-1-workorder-b', ${companyB}, 'E1-OS-B', 'evidence-1-vehicle-b', NULL, 'OPEN', NOW(), NULL, NULL, NULL, 2000, NULL, 'Evidence B', NULL, NULL, 0, 0, 0, 0, 0, NULL, ${adminBId}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO insurances (
      id, company_id, vehicle_id, insurance_company, policy_number, coverage_details,
      deductible_amount, total_premium_amount, installments_count, start_date, end_date,
      status, broker_name, broker_phone, account_payable_ids, created_by, created_at, updated_at
    ) VALUES
      ('evidence-1-insurance-a', ${companyA}, 'evidence-1-vehicle-a', 'Seguradora A', 'E1-POL-A', 'Completa', 0, 0, 1, '2026-08-01', '2027-08-01', 'ACTIVE', NULL, NULL, '[]'::jsonb, ${adminAId}, NOW(), NOW()),
      ('evidence-1-insurance-b', ${companyB}, 'evidence-1-vehicle-b', 'Seguradora B', 'E1-POL-B', 'Completa', 0, 0, 1, '2026-08-01', '2027-08-01', 'ACTIVE', NULL, NULL, '[]'::jsonb, ${adminBId}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO trackers (
      id, company_id, vehicle_id, serial_number, equipment_model, imei, chip_carrier,
      chip_number, monthly_cost, installation_date, status, supplier_id, notes, last_ping,
      created_by, created_at, updated_at
    ) VALUES
      ('evidence-1-tracker-a', ${companyA}, 'evidence-1-vehicle-a', 'E1-TRK-A', 'Concox E1', '910000000000001', 'Vivo', '11910000001', 0, '2026-08-01', 'ACTIVE', NULL, NULL, NULL, ${adminAId}, NOW(), NOW()),
      ('evidence-1-tracker-b', ${companyB}, 'evidence-1-vehicle-b', 'E1-TRK-B', 'Concox E1', '910000000000002', 'Vivo', '11910000002', 0, '2026-08-01', 'ACTIVE', NULL, NULL, NULL, ${adminBId}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function main(): Promise<void> {
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'autoerp-evidence-1-'));
  const previousStorage = process.env.ATTACHMENT_STORAGE_DIR;
  process.env.ATTACHMENT_STORAGE_DIR = storageRoot;
  await seed();

  const app = express();
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
    const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
    if (companyId && userId) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId,
        userId,
        name: `Evidence ${companyId}`,
        role: 'ADMIN',
        permissions: ['*'],
      };
    }
    next();
  });
  registerAttachmentRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'integration server unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  const adminA = { companyId: companyA, userId: adminAId };
  const adminB = { companyId: companyB, userId: adminBId };
  const request = async (route: string, options: RequestInit = {}, principal = adminA): Promise<globalThis.Response> => {
    const headers = new Headers(options.headers);
    headers.set('x-test-company', principal.companyId);
    headers.set('x-test-user', principal.userId);
    return await fetch(`${base}${route}`, { ...options, headers });
  };
  const upload = async (entityType: string, entityId: string, principal = adminA): Promise<globalThis.Response> => {
    const headers = new Headers({
      'content-type': 'application/pdf',
      'x-autoerp-entity-type': encodeURIComponent(entityType),
      'x-autoerp-entity-id': encodeURIComponent(entityId),
      'x-autoerp-document-type': encodeURIComponent('EVIDENCE_DOCUMENT'),
      'x-autoerp-file-name': encodeURIComponent(`${entityType.toLowerCase()}.pdf`),
    });
    return await request('/api/attachments', {
      method: 'POST',
      headers,
      body: new Uint8Array([37, 80, 68, 70, 45, 69, 49]) as any,
    }, principal);
  };

  const cases = [
    { type: 'MaintenanceWorkOrder', own: 'evidence-1-workorder-a', foreign: 'evidence-1-workorder-b' },
    { type: 'Insurance', own: 'evidence-1-insurance-a', foreign: 'evidence-1-insurance-b' },
    { type: 'Tracker', own: 'evidence-1-tracker-a', foreign: 'evidence-1-tracker-b' },
  ];

  try {
    for (const item of cases) {
      let response = await upload(item.type, item.own);
      assert(response.status === 201, `${item.type} upload expected 201, got ${response.status}`);
      const created = (await json(response)).item;
      assert(created.companyId === companyA, `${item.type} company authority mismatch`);
      assert(created.entityType === item.type && created.entityId === item.own, `${item.type} binding mismatch`);
      assert(created.storageProvider === 'SERVER_FS' && created.contentState === 'AVAILABLE', `${item.type} storage authority mismatch`);
      assert(typeof created.checksum === 'string' && /^[a-f0-9]{64}$/.test(created.checksum), `${item.type} checksum missing`);

      response = await request(`/api/attachments?entityType=${encodeURIComponent(item.type)}&entityId=${encodeURIComponent(item.own)}`);
      assert(response.status === 200, `${item.type} list expected 200, got ${response.status}`);
      const listed = (await json(response)).items;
      assert(Array.isArray(listed) && listed.some((entry: any) => entry.id === created.id), `${item.type} attachment missing from list`);

      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/content`);
      assert(response.status === 200, `${item.type} content expected 200, got ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert(bytes.length === 7 && bytes[0] === 37 && bytes[1] === 80, `${item.type} content bytes mismatch`);

      response = await request(`/api/attachments/${encodeURIComponent(created.id)}`, {}, adminB);
      assert(response.status === 404, `${item.type} cross-tenant metadata expected 404, got ${response.status}`);
      response = await upload(item.type, item.foreign);
      assert(response.status === 404, `${item.type} cross-tenant entity upload expected 404, got ${response.status}`);

      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/archive`, { method: 'POST' });
      assert(response.status === 200 && (await json(response)).item.isArchived === true, `${item.type} archive failed`);
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/content`);
      assert(response.status === 404, `${item.type} archived content expected 404, got ${response.status}`);
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/restore`, { method: 'POST' });
      assert(response.status === 200 && (await json(response)).item.isArchived === false, `${item.type} restore failed`);
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/content`);
      assert(response.status === 200, `${item.type} restored content expected 200, got ${response.status}`);
    }

    const missingCases = [
      ['MaintenanceWorkOrder', 'missing-workorder'],
      ['Insurance', 'missing-insurance'],
      ['Tracker', 'missing-tracker'],
    ] as const;
    for (const [type, id] of missingCases) {
      const response = await upload(type, id);
      assert(response.status === 404, `${type} missing entity expected 404, got ${response.status}`);
    }

    console.log('EVIDENCE-1 attachment expansion integration: PASS');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousStorage === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = previousStorage;
    await rm(storageRoot, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});