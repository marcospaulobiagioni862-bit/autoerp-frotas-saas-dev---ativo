import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
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

    const baseContract = {
      contractNumber: 'CNT-I3-A-001',
      driverId: 'i3-drv-a1',
      vehicleId: 'i3-veh-a1',
      startDate: '2026-09-01',
      rentalAmount: 750,
      billingPeriodicity: RecurringFrequency.WEEKLY,
      billingDueDayOfWeek: 1,
      billingDueDayOfMonth: 1,
      securityDepositAmount: 1200,
      franchiseKm: 1500,
      excessKmRate: 0.5,
    };

    try {
      let response = await request('/api/contracts');
      assert(response.status === 401, `no-session list expected 401, got ${response.status}`);

      response = await request('/api/contracts', {}, readonlyA);
      assert(response.status === 200, `READONLY list expected 200, got ${response.status}`);

      response = await request('/api/contracts', { method: 'POST', body: JSON.stringify(baseContract) }, readonlyA);
      assert(response.status === 403, `READONLY create expected 403, got ${response.status}`);

      response = await request('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ ...baseContract, companyId: companyB, userId: adminBId, role: 'ADMIN', status: ContractStatus.ACTIVE }),
      }, adminA);
      assert(response.status === 400, `forged authority surface expected 400, got ${response.status}`);

      response = await request('/api/contracts', { method: 'POST', body: JSON.stringify(baseContract) }, adminA);
      assert(response.status === 201, `tenant A create expected 201, got ${response.status}`);
      const created = (await json(response)).item;
      assert(created.companyId === companyA && created.status === ContractStatus.DRAFT && created.isArchived === false, 'create authority mismatch');
      await markLegacyContract(created.id);

      response = await request('/api/contracts', { method: 'POST', body: JSON.stringify(baseContract) }, adminA);
      assert(response.status === 409, `same-tenant contract number expected 409, got ${response.status}`);

      response = await request('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ ...baseContract, driverId: 'i3-drv-b1', vehicleId: 'i3-veh-b1' }),
      }, adminB);
      assert(response.status === 201, `same contract number cross-tenant expected 201, got ${response.status}`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}`, {}, adminB);
      assert(response.status === 404, `cross-tenant contract read expected 404, got ${response.status}`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status: ContractStatus.ACTIVE }),
      }, adminA);
      assert(response.status === 400, `generic PATCH lifecycle expected 400, got ${response.status}`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/activate`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 400, `activate without category expected 400, got ${response.status}`);
      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryB }) }, adminA);
      assert(response.status === 400, `cross-tenant income category expected 400, got ${response.status}`);
      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: expenseCategoryA }) }, adminA);
      assert(response.status === 400, `expense category for contract expected 400, got ${response.status}`);
      const beforeValidActivation = await scalar(sql`SELECT status FROM contracts WHERE id=${created.id}`);
      const vehicleBeforeValidActivation = await scalar(sql`SELECT status, current_contract_id FROM vehicles WHERE id='i3-veh-a1'`);
      const receivablesBeforeValidActivation = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE company_id=${companyA} AND contract_id=${created.id}`);
      assert(beforeValidActivation?.status === ContractStatus.DRAFT, 'invalid category mutated contract');
      assert(vehicleBeforeValidActivation?.status === VehicleStatus.AVAILABLE && !vehicleBeforeValidActivation?.current_contract_id, 'invalid category mutated vehicle');
      assert(Number(receivablesBeforeValidActivation?.count) === 0, 'invalid category created receivable');

      await db.execute(sql`
        INSERT INTO file_attachments (
          id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
          size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
        ) VALUES (
          'i3-att-expired-crlv', ${companyA}, 'Vehicle', 'Vehicle', 'i3-veh-a1', 'CRLV', 'expired-crlv.pdf',
          'application/pdf', 'attachment://i3-expired-crlv', 10, 10, 'SERVER_FS', 'i3/expired-crlv', repeat('f',64),
          ${adminAId}, false, 'AVAILABLE', NOW()
        ) ON CONFLICT (id) DO NOTHING
      `);
      await db.execute(sql`
        INSERT INTO documents (
          id, company_id, subject_type, subject_id, document_type, reference_year, expiration_date, attachment_id,
          version_number, is_current, is_archived, cost, created_by, created_at, updated_at
        ) VALUES (
          'i3-doc-expired-crlv', ${companyA}, 'VEHICLE', 'i3-veh-a1', 'CRLV', 2026, '2020-01-01',
          'i3-att-expired-crlv', 1, true, false, 0, ${adminAId}, NOW(), NOW()
        ) ON CONFLICT (id) DO UPDATE SET is_current=true, is_archived=false, expiration_date='2020-01-01'
      `);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryA }) }, adminA);
      assert(response.status === 409, `expired vehicle document expected activation 409, got ${response.status}`);
      const blockedContract = await scalar(sql`SELECT status FROM contracts WHERE id=${created.id}`);
      const blockedVehicle = await scalar(sql`SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id='i3-veh-a1'`);
      const blockedReceivables = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE company_id=${companyA} AND contract_id=${created.id}`);
      assert(blockedContract?.status === ContractStatus.DRAFT, 'expired document gate mutated contract');
      assert(blockedVehicle?.status === VehicleStatus.AVAILABLE && !blockedVehicle?.current_driver_id && !blockedVehicle?.current_contract_id, 'expired document gate mutated vehicle');
      assert(Number(blockedReceivables?.count) === 0, 'expired document gate created receivable');
      await db.execute(sql`UPDATE documents SET is_current=false, is_archived=true, updated_at=NOW() WHERE id='i3-doc-expired-crlv'`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryA }) }, adminA);
      assert(response.status === 200, `activate expected 200, got ${response.status}`);
      const activation = await json(response);
      assert(activation.item.status === ContractStatus.ACTIVE, 'activation did not persist ACTIVE');
      assert(Array.isArray(activation.receivables) && activation.receivables.length === 1, 'activation did not create initial receivable');
      assert(activation.receivables[0]?.categoryId === incomeCategoryA, 'activation did not persist canonical category');

      const vehicleAfterActivation = await scalar(sql`SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id='i3-veh-a1'`);
      assert(vehicleAfterActivation?.status === VehicleStatus.RENTED, 'Vehicle not RENTED after activation');
      assert(vehicleAfterActivation?.current_driver_id === 'i3-drv-a1' && vehicleAfterActivation?.current_contract_id === created.id, 'Vehicle binding mismatch');
      const initialReceivables = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE company_id=${companyA} AND contract_id=${created.id}`);
      assert(Number(initialReceivables?.count) === 1, 'initial receivable count mismatch');

      response = await request('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ ...baseContract, contractNumber: 'CNT-I3-CONFLICT', driverId: 'i3-drv-a2' }),
      }, adminA);
      assert(response.status === 201, `conflict draft create expected 201, got ${response.status}`);
      const conflictContract = (await json(response)).item;
      await markLegacyContract(conflictContract.id);
      response = await request(`/api/contracts/${encodeURIComponent(conflictContract.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryA }) }, adminA);
      assert(response.status === 409, `vehicle active conflict expected 409, got ${response.status}`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/bill`, {
        method: 'POST', body: JSON.stringify({ dueDate: '2026-09-08', competenceDate: '2026-09-08', categoryId: incomeCategoryA }),
      }, adminA);
      assert(response.status === 200, `first bill expected 200, got ${response.status}`);
      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/bill`, {
        method: 'POST', body: JSON.stringify({ dueDate: '2026-09-08', competenceDate: '2026-09-08', categoryId: incomeCategoryA }),
      }, adminA);
      assert(response.status === 200, `idempotent second bill expected 200, got ${response.status}`);
      const billedCount = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE company_id=${companyA} AND contract_id=${created.id}`);
      assert(Number(billedCount?.count) === 2, `billing idempotency expected 2 total receivables, got ${billedCount?.count}`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/archive`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 409, `ACTIVE archive expected 409, got ${response.status}`);

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/close`, {
        method: 'POST', body: JSON.stringify({ closeDate: '2026-09-30', reason: 'Integração I3' }),
      }, adminA);
      assert(response.status === 200, `close expected 200, got ${response.status}`);
      assert((await json(response)).item.status === ContractStatus.CLOSED, 'close did not persist CLOSED');
      const vehicleAfterClose = await scalar(sql`SELECT status, current_driver_id, current_contract_id FROM vehicles WHERE id='i3-veh-a1'`);
      assert(vehicleAfterClose?.status === VehicleStatus.AVAILABLE && !vehicleAfterClose?.current_driver_id && !vehicleAfterClose?.current_contract_id, 'Vehicle not released atomically');
      const historyCountAfterClose = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE company_id=${companyA} AND contract_id=${created.id}`);
      assert(Number(historyCountAfterClose?.count) === 2, 'close destroyed financial history');

      response = await request(`/api/contracts/${encodeURIComponent(created.id)}/archive`, {
        method: 'POST', body: JSON.stringify({ reason: 'Histórico concluído' }),
      }, adminA);
      assert(response.status === 200, `closed archive expected 200, got ${response.status}`);
      const archived = (await json(response)).item;
      assert(archived.status === ContractStatus.ARCHIVED && archived.isArchived === true, 'archive not soft ARCHIVED');

      response = await request('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ ...baseContract, contractNumber: 'CNT-I3-ROLLBACK', vehicleId: 'i3-veh-a2', driverId: 'i3-drv-a2' }),
      }, adminA);
      assert(response.status === 201, `rollback draft create expected 201, got ${response.status}`);
      const rollbackContract = (await json(response)).item;
      await markLegacyContract(rollbackContract.id);

      const originalAuditCreate = PostgresAuditLogRepository.prototype.create;
      PostgresAuditLogRepository.prototype.create = async function forcedAuditFailure(): Promise<any> {
        throw new Error('FORCED_CONTRACT_AUDIT_FAILURE');
      };
      try {
        response = await request(`/api/contracts/${encodeURIComponent(rollbackContract.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryA }) }, adminA);
        assert(response.status === 500, `forced audit failure expected 500, got ${response.status}`);
      } finally {
        PostgresAuditLogRepository.prototype.create = originalAuditCreate;
      }
      const rollbackState = await scalar(sql`SELECT status FROM contracts WHERE id=${rollbackContract.id}`);
      const rollbackVehicle = await scalar(sql`SELECT status, current_contract_id FROM vehicles WHERE id='i3-veh-a2'`);
      const rollbackReceivable = await scalar(sql`SELECT count(*)::int AS count FROM account_receivables WHERE contract_id=${rollbackContract.id}`);
      assert(rollbackState?.status === ContractStatus.DRAFT, 'Contract survived forced audit rollback');
      assert(rollbackVehicle?.status === VehicleStatus.AVAILABLE && !rollbackVehicle?.current_contract_id, 'Vehicle survived forced audit rollback');
      assert(Number(rollbackReceivable?.count) === 0, 'Receivable survived forced audit rollback');

      response = await request('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ ...baseContract, contractNumber: 'CNT-I3-VEH-ROLLBACK', vehicleId: 'i3-veh-a3', driverId: 'i3-drv-a3' }),
      }, adminA);
      assert(response.status === 201, `vehicle rollback draft create expected 201, got ${response.status}`);
      const vehicleRollbackContract = (await json(response)).item;
      await markLegacyContract(vehicleRollbackContract.id);
      const originalVehicleUpdate = PostgresVehicleRepository.prototype.updateForCompany;
      PostgresVehicleRepository.prototype.updateForCompany = async function forcedVehicleFailure(): Promise<any> {
        throw new Error('FORCED_CONTRACT_VEHICLE_FAILURE');
      };
      try {
        response = await request(`/api/contracts/${encodeURIComponent(vehicleRollbackContract.id)}/activate`, { method: 'POST', body: JSON.stringify({ categoryId: incomeCategoryA }) }, adminA);
        assert(response.status === 500, `forced Vehicle failure expected 500, got ${response.status}`);
      } finally {
        PostgresVehicleRepository.prototype.updateForCompany = originalVehicleUpdate;
      }
      const vehicleRollbackState = await scalar(sql`SELECT status FROM contracts WHERE id=${vehicleRollbackContract.id}`);
      assert(vehicleRollbackState?.status === ContractStatus.DRAFT, 'Contract survived forced Vehicle rollback');

      response = await request(`/api/contracts/${encodeURIComponent(vehicleRollbackContract.id)}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: '' }),
      }, adminA);
      assert(response.status === 400, `empty cancel reason expected 400, got ${response.status}`);
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
      process.exitCode = 1;
    });
}
