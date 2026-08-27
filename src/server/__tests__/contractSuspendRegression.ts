import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { ContractStatus, RecurringFrequency, VehicleStatus } from '../../types/enums';
import type { AuthenticatedPrincipal } from '../auth';
import { registerContractRoutes } from '../contractRoutes';

const companyA = 'contract-suspend-company-a';
const companyB = 'contract-suspend-company-b';
const adminAId = 'contract-suspend-admin-a';
const adminBId = 'contract-suspend-admin-b';
const readonlyAId = 'contract-suspend-readonly-a';
const incomeCategoryA = 'contract-suspend-income-a';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function prepareFixtures(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyA}, 'Contract Suspend Company A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'Contract Suspend Company B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminAId}, ${companyA}, 'Suspend Admin A', 'suspend-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
      (${adminBId}, ${companyB}, 'Suspend Admin B', 'suspend-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
      (${readonlyAId}, ${companyA}, 'Suspend Readonly A', 'suspend-readonly-a@example.test', 'READONLY', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_categories (id, company_id, name, type, active, created_at, updated_at)
    VALUES (${incomeCategoryA}, ${companyA}, 'Suspend Rental Income', 'INCOME', true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET active=true, type='INCOME', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
      ('suspend-veh-a1', ${companyA}, 'SUA1A01', 'SUSPEND-RENAVAM-A1', 'AVAILABLE', NOW(), NOW()),
      ('suspend-veh-a2', ${companyA}, 'SUA2A02', 'SUSPEND-RENAVAM-A2', 'AVAILABLE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status='AVAILABLE', current_driver_id=NULL, current_contract_id=NULL, updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
    ) VALUES
      ('suspend-drv-a1', ${companyA}, 'Suspend Driver A1', '52998224725', '12345678901', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
      ('suspend-drv-a2', ${companyA}, 'Suspend Driver A2', '11144477735', '12345678902', true, '2035-01-01', 'ACTIVE', ARRAY['99'], false, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET active=true, cnh_expiration='2035-01-01', status='ACTIVE', is_archived=false, updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO insurances (
      id, company_id, vehicle_id, insurance_company, policy_number, coverage_details,
      deductible_amount, total_premium_amount, installments_count, start_date, end_date, status,
      account_payable_ids, created_by, created_at, updated_at
    ) VALUES
      ('suspend-ins-a1', ${companyA}, 'suspend-veh-a1', 'Seguradora Suspend', 'SUSP-A1', 'Cobertura teste', 0, 0, 1, '2026-01-01', '2035-01-01', 'ACTIVE', '[]'::jsonb, ${adminAId}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status='ACTIVE', start_date='2026-01-01', end_date='2035-01-01', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO file_attachments (
      id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
      size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
    ) VALUES
      ('suspend-att-a1', ${companyA}, 'Vehicle', 'Vehicle', 'suspend-veh-a1', 'CRLV', 'suspend-a1.pdf', 'application/pdf', 'attachment://suspend-a1', 10, 10, 'SERVER_FS', 'suspend/a1', repeat('a',64), ${adminAId}, false, 'AVAILABLE', NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO documents (
      id, company_id, subject_type, subject_id, document_type, reference_year, expiration_date, attachment_id,
      version_number, is_current, is_archived, cost, created_by, created_at, updated_at
    ) VALUES
      ('suspend-doc-a1-ipva', ${companyA}, 'VEHICLE', 'suspend-veh-a1', 'IPVA', 2026, '2035-01-01', 'suspend-att-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
      ('suspend-doc-a1-crlv', ${companyA}, 'VEHICLE', 'suspend-veh-a1', 'CRLV', 2026, '2035-01-01', 'suspend-att-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
      ('suspend-doc-a1-lic', ${companyA}, 'VEHICLE', 'suspend-veh-a1', 'LICENCIAMENTO', 2026, '2035-01-01', 'suspend-att-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET is_current=true, is_archived=false, expiration_date='2035-01-01', updated_at=NOW()
  `);
}

export async function runContractSuspendRegression(): Promise<void> {
  await prepareFixtures();

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const companyId = typeof req.headers['x-company-id'] === 'string' ? req.headers['x-company-id'] : '';
    const role = typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : '';
    const userId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : '';
    if (companyId && role && userId) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId, userId, name: `${role} Suspend Regression`, role, permissions: [],
      };
    }
    next();
  });
  registerContractRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'contract suspend regression server unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  const request = async (
    path: string,
    options: RequestInit,
    principal: { companyId: string; role: string; userId: string },
  ): Promise<globalThis.Response> => {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    headers.set('x-company-id', principal.companyId);
    headers.set('x-role', principal.role);
    headers.set('x-user-id', principal.userId);
    return await fetch(`${base}${path}`, { ...options, headers });
  };

  const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
  const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
  const readonlyA = { companyId: companyA, role: 'READONLY', userId: readonlyAId };
  const today = new Date().toISOString().slice(0, 10);

  try {
    let response = await request('/api/contracts', {
      method: 'POST',
      body: JSON.stringify({
        contractNumber: 'CNT-SUSPEND-DRAFT',
        driverId: 'suspend-drv-a2',
        vehicleId: 'suspend-veh-a2',
        startDate: today,
        rentalAmount: 500,
        billingPeriodicity: RecurringFrequency.WEEKLY,
      }),
    }, adminA);
    assert(response.status === 201, `suspend DRAFT fixture create expected 201, got ${response.status}`);
    const draft = (await json(response)).item;

    response = await request(`/api/contracts/${encodeURIComponent(draft.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: 'Pausa inválida' }),
    }, adminA);
    assert(response.status === 409, `DRAFT suspend expected 409, got ${response.status}`);
    const draftAfter = await scalar(sql`SELECT status FROM contracts WHERE id=${draft.id}`);
    assert(draftAfter?.status === ContractStatus.DRAFT, 'DRAFT suspend mutated contract');

    response = await request('/api/contracts', {
      method: 'POST',
      body: JSON.stringify({
        contractNumber: 'CNT-SUSPEND-ACTIVE',
        driverId: 'suspend-drv-a1',
        vehicleId: 'suspend-veh-a1',
        startDate: today,
        rentalAmount: 750,
        billingPeriodicity: RecurringFrequency.WEEKLY,
      }),
    }, adminA);
    assert(response.status === 201, `suspend ACTIVE fixture create expected 201, got ${response.status}`);
    const activeCandidate = (await json(response)).item;
    await db.execute(sql`UPDATE contracts SET signature_required=false WHERE id=${activeCandidate.id}`);

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/activate`, {
      method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryA }),
    }, adminA);
    assert(response.status === 200, `suspend fixture activate expected 200, got ${response.status}`);
    assert((await json(response)).item.status === ContractStatus.ACTIVE, 'suspend fixture did not activate');

    const receivablesBefore = await scalar(sql`
      SELECT count(*)::int AS count FROM account_receivables
      WHERE company_id=${companyA} AND contract_id=${activeCandidate.id}
    `);
    const auditBefore = await scalar(sql`
      SELECT count(*)::int AS count FROM audit_logs
      WHERE company_id=${companyA} AND entity_type='Contract' AND entity_id=${activeCandidate.id}
    `);

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: '' }),
    }, adminA);
    assert(response.status === 400, `empty suspend reason expected 400, got ${response.status}`);

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: 'Pausa operacional' }),
    }, readonlyA);
    assert(response.status === 403, `READONLY suspend expected 403, got ${response.status}`);

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: 'Pausa operacional' }),
    }, adminB);
    assert(response.status === 404, `cross-tenant suspend expected 404, got ${response.status}`);

    await db.execute(sql`UPDATE vehicles SET current_driver_id='suspend-drv-a2', updated_at=NOW() WHERE id='suspend-veh-a1'`);
    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: 'Pausa operacional' }),
    }, adminA);
    assert(response.status === 409, `binding mismatch suspend expected 409, got ${response.status}`);
    const mismatchContract = await scalar(sql`SELECT status FROM contracts WHERE id=${activeCandidate.id}`);
    const mismatchReceivables = await scalar(sql`
      SELECT count(*)::int AS count FROM account_receivables
      WHERE company_id=${companyA} AND contract_id=${activeCandidate.id}
    `);
    const mismatchAudit = await scalar(sql`
      SELECT count(*)::int AS count FROM audit_logs
      WHERE company_id=${companyA} AND entity_type='Contract' AND entity_id=${activeCandidate.id}
    `);
    assert(mismatchContract?.status === ContractStatus.ACTIVE, 'binding mismatch suspend mutated contract');
    assert(Number(mismatchReceivables?.count) === Number(receivablesBefore?.count), 'binding mismatch suspend mutated receivables');
    assert(Number(mismatchAudit?.count) === Number(auditBefore?.count), 'binding mismatch suspend created audit mutation');
    await db.execute(sql`UPDATE vehicles SET current_driver_id='suspend-drv-a1', updated_at=NOW() WHERE id='suspend-veh-a1'`);

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: 'Pausa operacional programada' }),
    }, adminA);
    assert(response.status === 200, `ACTIVE suspend expected 200, got ${response.status}`);
    const suspended = (await json(response)).item;
    assert(suspended.status === ContractStatus.SUSPENDED, 'suspend did not persist SUSPENDED');
    assert(String(suspended.notes || '').includes('Pausa operacional programada'), 'suspend reason not persisted');

    const vehicleAfterSuspend = await scalar(sql`
      SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id='suspend-veh-a1'
    `);
    const receivablesAfterSuspend = await scalar(sql`
      SELECT count(*)::int AS count FROM account_receivables
      WHERE company_id=${companyA} AND contract_id=${activeCandidate.id}
    `);
    const auditAfterSuspend = await scalar(sql`
      SELECT count(*)::int AS count FROM audit_logs
      WHERE company_id=${companyA} AND entity_type='Contract' AND entity_id=${activeCandidate.id}
    `);
    assert(vehicleAfterSuspend?.status === VehicleStatus.RENTED, 'suspend released vehicle status');
    assert(vehicleAfterSuspend?.current_driver_id === 'suspend-drv-a1', 'suspend changed driver binding');
    assert(vehicleAfterSuspend?.current_contract_id === activeCandidate.id, 'suspend changed contract binding');
    assert(Number(receivablesAfterSuspend?.count) === Number(receivablesBefore?.count), 'suspend mutated receivables');
    assert(Number(auditAfterSuspend?.count) === Number(auditBefore?.count) + 1, 'suspend did not create exactly one audit');

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: 'Repetição idempotente' }),
    }, adminA);
    assert(response.status === 200, `idempotent suspend expected 200, got ${response.status}`);
    assert((await json(response)).item.status === ContractStatus.SUSPENDED, 'idempotent suspend changed status');
    const auditAfterReplay = await scalar(sql`
      SELECT count(*)::int AS count FROM audit_logs
      WHERE company_id=${companyA} AND entity_type='Contract' AND entity_id=${activeCandidate.id}
    `);
    const receivablesAfterReplay = await scalar(sql`
      SELECT count(*)::int AS count FROM account_receivables
      WHERE company_id=${companyA} AND contract_id=${activeCandidate.id}
    `);
    assert(Number(auditAfterReplay?.count) === Number(auditAfterSuspend?.count), 'idempotent suspend duplicated audit');
    assert(Number(receivablesAfterReplay?.count) === Number(receivablesBefore?.count), 'idempotent suspend mutated receivables');

    response = await request(`/api/contracts/${encodeURIComponent(activeCandidate.id)}/bill`, {
      method: 'POST', body: JSON.stringify({ dueDate: today, competenceDate: today, categoryId: incomeCategoryA }),
    }, adminA);
    assert(response.status === 409, `SUSPENDED manual billing expected 409, got ${response.status}`);
    const receivablesAfterBillAttempt = await scalar(sql`
      SELECT count(*)::int AS count FROM account_receivables
      WHERE company_id=${companyA} AND contract_id=${activeCandidate.id}
    `);
    assert(Number(receivablesAfterBillAttempt?.count) === Number(receivablesBefore?.count), 'SUSPENDED billing created receivable');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

if (process.argv[1]?.includes('contractSuspendRegression')) {
  runContractSuspendRegression()
    .then(() => console.log('Contract suspend regression PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract suspend regression::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
