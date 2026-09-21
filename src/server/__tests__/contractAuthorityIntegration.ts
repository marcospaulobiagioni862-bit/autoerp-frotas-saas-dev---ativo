import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { seedContractSignedFixture } from './contractSignedFixture';
import { registerContractRoutes } from '../contractRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { ContractStatus, RecurringFrequency, VehicleStatus } from '../../types/enums';
import { PostgresAuditLogRepository, PostgresVehicleRepository } from '../../db/repositories/postgresRepositories';

const companyA = 'security-2i3-company-a';
const companyB = 'security-2i3-company-b';
const adminAId = 'security-2i3-admin-a';
const adminBId = 'security-2i3-admin-b';
const readonlyAId = 'security-2i3-readonly-a';
const incomeCategoryA = 'finance-r3-contract-income-a';
const expenseCategoryA = 'finance-r3-contract-expense-a';
const incomeCategoryB = 'finance-r3-contract-income-b';

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

async function markLegacyContract(contractId: string): Promise<void> {
  await db.execute(sql`UPDATE contracts SET signature_required = false WHERE id = ${contractId}`);
  await seedContractSignedFixture(contractId);
}

export class ContractAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
        (${companyA}, 'I3 Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'I3 Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
        (${adminAId}, ${companyA}, 'I3 Admin A', 'i3-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
        (${adminBId}, ${companyB}, 'I3 Admin B', 'i3-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
        (${readonlyAId}, ${companyA}, 'I3 Readonly A', 'i3-readonly-a@example.test', 'READONLY', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO financial_categories (id, company_id, name, type, active, created_at, updated_at) VALUES
        (${incomeCategoryA}, ${companyA}, 'Receita de Aluguel', 'INCOME', true, NOW(), NOW()),
        (${expenseCategoryA}, ${companyA}, 'Despesa Operacional', 'EXPENSE', true, NOW(), NOW()),
        (${incomeCategoryB}, ${companyB}, 'Receita de Aluguel B', 'INCOME', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
        ('i3-veh-a1', ${companyA}, 'I3A1A01', 'I3RENAVAM-A1', 'AVAILABLE', NOW(), NOW()),
        ('i3-veh-a2', ${companyA}, 'I3A2A02', 'I3RENAVAM-A2', 'AVAILABLE', NOW(), NOW()),
        ('i3-veh-a3', ${companyA}, 'I3A3A03', 'I3RENAVAM-A3', 'AVAILABLE', NOW(), NOW()),
        ('i3-veh-b1', ${companyB}, 'I3B1B01', 'I3RENAVAM-B1', 'AVAILABLE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
      ) VALUES
        ('i3-drv-a1', ${companyA}, 'Driver A1', '52998224725', '12345678900', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
        ('i3-drv-a2', ${companyA}, 'Driver A2', '11144477735', '02650306461', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
        ('i3-drv-a3', ${companyA}, 'Driver A3', '39053344705', '98765432100', true, '2035-01-01', 'ACTIVE', ARRAY['99'], false, NOW(), NOW()),
        ('i3-drv-b1', ${companyB}, 'Driver B1', '16899535009', '24681357982', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO insurances (
        id, company_id, vehicle_id, insurance_company, policy_number, coverage_details,
        deductible_amount, total_premium_amount, installments_count, start_date, end_date, status,
        account_payable_ids, created_by, created_at, updated_at
      ) VALUES
        ('i3-ins-a1', ${companyA}, 'i3-veh-a1', 'Seguradora A', 'POL-I3-A1', 'Cobertura teste', 1000, 1200, 12, '2026-01-01', '2027-12-31', 'ACTIVE', '[]'::jsonb, ${adminAId}, NOW(), NOW()),
        ('i3-ins-a2', ${companyA}, 'i3-veh-a2', 'Seguradora A', 'POL-I3-A2', 'Cobertura teste', 1000, 1200, 12, '2026-01-01', '2027-12-31', 'ACTIVE', '[]'::jsonb, ${adminAId}, NOW(), NOW()),
        ('i3-ins-a3', ${companyA}, 'i3-veh-a3', 'Seguradora A', 'POL-I3-A3', 'Cobertura teste', 1000, 1200, 12, '2026-01-01', '2027-12-31', 'ACTIVE', '[]'::jsonb, ${adminAId}, NOW(), NOW()),
        ('i3-ins-b1', ${companyB}, 'i3-veh-b1', 'Seguradora B', 'POL-I3-B1', 'Cobertura teste', 1000, 1200, 12, '2026-01-01', '2027-12-31', 'ACTIVE', '[]'::jsonb, ${adminBId}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='ACTIVE', start_date='2026-01-01', end_date='2027-12-31', updated_at=NOW()
    `);
    await db.execute(sql`
      INSERT INTO file_attachments (
        id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
        size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
      ) VALUES
        ('i3-att-valid-a1', ${companyA}, 'Vehicle', 'Vehicle', 'i3-veh-a1', 'CRLV', 'annual-a1.pdf', 'application/pdf', 'attachment://i3-valid-a1', 10, 10, 'SERVER_FS', 'i3/valid-a1', repeat('a',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i3-att-valid-a2', ${companyA}, 'Vehicle', 'Vehicle', 'i3-veh-a2', 'CRLV', 'annual-a2.pdf', 'application/pdf', 'attachment://i3-valid-a2', 10, 10, 'SERVER_FS', 'i3/valid-a2', repeat('b',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i3-att-valid-a3', ${companyA}, 'Vehicle', 'Vehicle', 'i3-veh-a3', 'CRLV', 'annual-a3.pdf', 'application/pdf', 'attachment://i3-valid-a3', 10, 10, 'SERVER_FS', 'i3/valid-a3', repeat('c',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i3-att-valid-b1', ${companyB}, 'Vehicle', 'Vehicle', 'i3-veh-b1', 'CRLV', 'annual-b1.pdf', 'application/pdf', 'attachment://i3-valid-b1', 10, 10, 'SERVER_FS', 'i3/valid-b1', repeat('d',64), ${adminBId}, false, 'AVAILABLE', NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO documents (
        id, company_id, subject_type, subject_id, document_type, reference_year, expiration_date, attachment_id,
        version_number, is_current, is_archived, cost, created_by, created_at, updated_at
      ) VALUES
        ('i3-doc-valid-ipva', ${companyA}, 'VEHICLE', 'i3-veh-a1', 'IPVA', 2026, '2035-01-01', 'i3-att-valid-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-crlv', ${companyA}, 'VEHICLE', 'i3-veh-a1', 'CRLV', 2026, '2035-01-01', 'i3-att-valid-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-lic', ${companyA}, 'VEHICLE', 'i3-veh-a1', 'LICENCIAMENTO', 2026, '2035-01-01', 'i3-att-valid-a1', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-a2-ipva', ${companyA}, 'VEHICLE', 'i3-veh-a2', 'IPVA', 2026, '2035-01-01', 'i3-att-valid-a2', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-a2-crlv', ${companyA}, 'VEHICLE', 'i3-veh-a2', 'CRLV', 2026, '2035-01-01', 'i3-att-valid-a2', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-a2-lic', ${companyA}, 'VEHICLE', 'i3-veh-a2', 'LICENCIAMENTO', 2026, '2035-01-01', 'i3-att-valid-a2', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-a3-ipva', ${companyA}, 'VEHICLE', 'i3-veh-a3', 'IPVA', 2026, '2035-01-01', 'i3-att-valid-a3', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-a3-crlv', ${companyA}, 'VEHICLE', 'i3-veh-a3', 'CRLV', 2026, '2035-01-01', 'i3-att-valid-a3', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-a3-lic', ${companyA}, 'VEHICLE', 'i3-veh-a3', 'LICENCIAMENTO', 2026, '2035-01-01', 'i3-att-valid-a3', 1, true, false, 0, ${adminAId}, NOW(), NOW()),
        ('i3-doc-valid-b1-ipva', ${companyB}, 'VEHICLE', 'i3-veh-b1', 'IPVA', 2026, '2035-01-01', 'i3-att-valid-b1', 1, true, false, 0, ${adminBId}, NOW(), NOW()),
        ('i3-doc-valid-b1-crlv', ${companyB}, 'VEHICLE', 'i3-veh-b1', 'CRLV', 2026, '2035-01-01', 'i3-att-valid-b1', 1, true, false, 0, ${adminBId}, NOW(), NOW()),
        ('i3-doc-valid-b1-lic', ${companyB}, 'VEHICLE', 'i3-veh-b1', 'LICENCIAMENTO', 2026, '2035-01-01', 'i3-att-valid-b1', 1, true, false, 0, ${adminBId}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET is_current=true, is_archived=false, expiration_date='2035-01-01', updated_at=NOW()
    `);

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const companyId = typeof req.headers['x-company-id'] === 'string' ? req.headers['x-company-id'] : '';
      const role = typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : '';
      const userId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : '';
      if (companyId && role && userId) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId, userId, name: `${role} Contract Integration`, role, permissions: [],
        };
      }
      next();
    });
    registerContractRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object', 'integration server unavailable');
    const base = `http://127.0.0.1:${address.port}`;

    const request = async (
      path: string,
      options: RequestInit = {},
      principal?: { companyId: string; role: string; userId: string }
    ): Promise<globalThis.Response> => {
      const headers = new Headers(options.headers);
      if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      if (principal) {
        headers.set('x-company-id', principal.companyId);
        headers.set('x-role', principal.role);
        headers.set('x-user-id', principal.userId);
      }
      return await fetch(`${base}${path}`, { ...options, headers });
    };

    const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
    const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
    const readonlyA = { companyId: companyA, role: 'READONLY', userId: readonlyAId };

    try {
      const baseContract = {
        contractNumber: 'CNT-V2-P0-A-001',
        driverId: 'i3-drv-a1',
        vehicleId: 'i3-veh-a1',
        startDate: '2026-08-01',
        rentalAmount: 750,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        billingDueDayOfWeek: 1,
        billingDueDayOfMonth: 1,
        securityDepositAmount: 1200,
        franchiseKm: 1500,
        excessKmRate: 0.5,
      };
      const create = (body: Record<string, unknown>, principal: typeof adminA, key?: string) =>
        request('/api/contracts', {
          method: 'POST',
          headers: key ? { 'x-idempotency-key': key } : undefined,
          body: JSON.stringify(body),
        }, principal);

      let response = await request('/api/contracts');
      assert(response.status === 401, `no-session list expected 401, got ${response.status}`);
      response = await create(baseContract, readonlyA, 'v2-readonly');
      assert(response.status === 403, `READONLY create expected 403, got ${response.status}`);
      response = await create(baseContract, adminA);
      assert(response.status === 400, `missing idempotency key expected 400, got ${response.status}`);

      const keyA = 'v2-contract-create-a-001';
      const [first, replay] = await Promise.all([
        create(baseContract, adminA, keyA),
        create(baseContract, adminA, keyA),
      ]);
      assert(first.status === 201 && replay.status === 201, `same-key create expected 201/201, got ${first.status}/${replay.status}`);
      const firstPayload = await json(first);
      const replayPayload = await json(replay);
      const created = firstPayload.item;
      assert(created.id === replayPayload.item.id, 'same idempotency key created more than one contract');
      assert(created.companyId === companyA && created.status === ContractStatus.ACTIVE && !created.isArchived, 'V2 contract must be ACTIVE atomically');

      const boundVehicle = await scalar(sql`SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id='i3-veh-a1'`);
      assert(boundVehicle?.status === VehicleStatus.RENTED && boundVehicle?.current_driver_id === 'i3-drv-a1' && boundVehicle?.current_contract_id === created.id, 'vehicle/driver binding was not atomic');
      const receivables = await db.execute(sql`SELECT origin_type, origin_id FROM account_receivables WHERE company_id=${companyA} AND contract_id=${created.id} ORDER BY origin_type`);
      const origins = (receivables.rows || []).map((row: any) => row.origin_type).sort();
      assert(origins.length === 2 && origins[0] === 'CONTRACT_RENT' && origins[1] === 'SECURITY_DEPOSIT', 'rent and deposit CR must be created exactly once');
      const contractCount = await scalar(sql`SELECT count(*)::int AS count FROM contracts WHERE company_id=${companyA} AND notes LIKE ${'%[V2-IDEMPOTENCY:' + keyA + ']%'}`);
      assert(Number(contractCount?.count) === 1, 'same-key replay persisted more than one contract');

      response = await create({ ...baseContract, contractNumber: 'CNT-V2-P0-A-002', driverId: 'i3-drv-a2' }, adminA, 'v2-contract-vehicle-conflict');
      assert(response.status === 409, `bound vehicle expected 409, got ${response.status}`);
      response = await create({ ...baseContract, contractNumber: 'CNT-V2-P0-A-003', vehicleId: 'i3-veh-a2' }, adminA, 'v2-contract-driver-conflict');
      assert(response.status === 409, `bound driver expected 409, got ${response.status}`);

      const companyBResponse = await create({ ...baseContract, driverId: 'i3-drv-b1', vehicleId: 'i3-veh-b1' }, adminB, 'v2-contract-create-b-001');
      assert(companyBResponse.status === 201, `cross-tenant independent create expected 201, got ${companyBResponse.status}`);
      response = await request(`/api/contracts/${encodeURIComponent(created.id)}`, {}, adminB);
      assert(response.status === 404, `cross-tenant contract read expected 404, got ${response.status}`);

      const originalAuditCreate = PostgresAuditLogRepository.prototype.create;
      PostgresAuditLogRepository.prototype.create = async function forcedAuditFailure(): Promise<any> {
        throw new Error('FORCED_V2_AUDIT_FAILURE');
      };
      try {
        response = await create({ ...baseContract, contractNumber: 'CNT-V2-P0-A-ROLLBACK', driverId: 'i3-drv-a3', vehicleId: 'i3-veh-a3' }, adminA, 'v2-contract-rollback');
        assert(response.status === 500, `forced audit failure expected 500, got ${response.status}`);
      } finally {
        PostgresAuditLogRepository.prototype.create = originalAuditCreate;
      }
      const rolledBack = await scalar(sql`SELECT count(*)::int AS count FROM contracts WHERE company_id=${companyA} AND contract_number='CNT-V2-P0-A-ROLLBACK'`);
      const rollbackVehicle = await scalar(sql`SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id='i3-veh-a3'`);
      assert(Number(rolledBack?.count) === 0, 'audit failure must rollback contract');
      assert(rollbackVehicle?.status === VehicleStatus.AVAILABLE && !rollbackVehicle?.current_driver_id && !rollbackVehicle?.current_contract_id, 'audit failure must rollback vehicle binding');
      console.log('V2 P0 contract authority: PASS');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

if (process.argv[1]?.includes('contractAuthorityIntegration')) {
  ContractAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Contract authority integration PASS'))
    .catch((error) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error title=Contract authority integration::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
      process.exitCode = 1;
    });
}
