import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { createServer } from 'node:http';
import { registerDriverRoutes } from '../driverRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { DriverStatus } from '../../types/enums';
import { PostgresAuditLogRepository } from '../../db/repositories/postgresRepositories';

const companyA = 'security-2i2-company-a';
const companyB = 'security-2i2-company-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export class DriverAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const companyId = typeof req.headers['x-company-id'] === 'string' ? req.headers['x-company-id'] : '';
      const role = typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : '';
      if (companyId && role) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId,
          userId: `${companyId}-user`,
          name: `${role} Integration User`,
          role,
          permissions: [],
        };
      }
      next();
    });
    registerDriverRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object', 'integration server address unavailable');
    const base = `http://127.0.0.1:${address.port}`;

    const request = async (
      path: string,
      options: RequestInit = {},
      principal?: { companyId: string; role: string }
    ): Promise<globalThis.Response> => {
      const headers = new Headers(options.headers);
      if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      if (principal) {
        headers.set('x-company-id', principal.companyId);
        headers.set('x-role', principal.role);
      }
      return await fetch(`${base}${path}`, { ...options, headers });
    };

    const adminA = { companyId: companyA, role: 'ADMIN' };
    const adminB = { companyId: companyB, role: 'ADMIN' };
    const readonlyA = { companyId: companyA, role: 'READONLY' };

    const baseDriver = {
      fullName: 'Motorista Autoridade A',
      cpf: '52998224725',
      rg: '123456789',
      birthDate: '1990-01-01',
      phone: '11999999999',
      whatsapp: '11999999999',
      email: 'a@example.test',
      address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01001000' },
      cnhNumber: '12345678900',
      cnhCategory: 'B',
      cnhExpiration: '2035-01-01',
      appPlatforms: ['Uber'],
    };

    try {
      let response = await request('/api/drivers');
      assert(response.status === 401, `no-session list expected 401, got ${response.status}`);

      response = await request('/api/drivers', {}, readonlyA);
      assert(response.status === 200, `READONLY list expected 200, got ${response.status}`);

      response = await request('/api/drivers', {
        method: 'POST', body: JSON.stringify(baseDriver),
      }, readonlyA);
      assert(response.status === 403, `READONLY create expected 403, got ${response.status}`);

      const invalidCases = [
        { label: 'cpf', body: { ...baseDriver, cpf: '11111111111' } },
        { label: 'cnh', body: { ...baseDriver, cnhNumber: '12345678901' } },
        { label: 'birthDate', body: { ...baseDriver, birthDate: '2999-01-01' } },
        { label: 'phone-empty', body: { ...baseDriver, phone: '' } },
        { label: 'phone-short', body: { ...baseDriver, phone: '1234' } },
        { label: 'phone-repeated', body: { ...baseDriver, phone: '11111111111' } },
        { label: 'whatsapp-invalid', body: { ...baseDriver, whatsapp: 'abc' } },
      ];
      for (const invalid of invalidCases) {
        response = await request('/api/drivers', {
          method: 'POST', body: JSON.stringify(invalid.body),
        }, adminA);
        assert(response.status === 400, `invalid ${invalid.label} expected 400, got ${response.status}`);
      }

      response = await request('/api/drivers', {
        method: 'POST',
        body: JSON.stringify({
          ...baseDriver,
          companyId: companyB,
          status: DriverStatus.ARCHIVED,
          isArchived: true,
          currentVehicleId: 'forged-vehicle',
          currentContractId: 'forged-contract',
          healthAndEmergency: { bloodType: 'O+' },
          userId: 'forged-user',
          role: 'ADMIN',
        }),
      }, adminA);
      assert(response.status === 201, `tenant A create expected 201, got ${response.status}`);
      const createdPayload = await json(response);
      const driverA = createdPayload.item;
      assert(driverA.companyId === companyA, 'browser-forged companyId became authoritative');
      assert(driverA.status === DriverStatus.ACTIVE && driverA.isArchived === false, 'browser-forged status/archive became authoritative');
      assert(!driverA.currentVehicleId && !driverA.currentContractId, 'browser-forged links became authoritative');
      assert(!driverA.healthAndEmergency, 'health leaked into Driver core payload');
      assert(driverA.phone === '11999999999' && driverA.whatsapp === '11999999999', 'phone normalization mismatch');

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}`, {
        method: 'PATCH', body: JSON.stringify({ phone: '(15) 99742-4411', whatsapp: '+55 (15) 99742-4411' }),
      }, adminA);
      assert(response.status === 200, `formatted phone update expected 200, got ${response.status}`);
      const normalizedContact = (await json(response)).item;
      assert(normalizedContact.phone === '15997424411', 'formatted phone was not normalized');
      assert(normalizedContact.whatsapp === '5515997424411', 'country WhatsApp was not normalized');

      response = await request('/api/drivers', { method: 'POST', body: JSON.stringify(baseDriver) }, adminA);
      assert(response.status === 409, `same-tenant duplicate expected 409, got ${response.status}`);

      response = await request('/api/drivers', {
        method: 'POST', body: JSON.stringify({ ...baseDriver, fullName: 'Motorista Mesmo Documento Tenant B' }),
      }, adminB);
      assert(response.status === 201, `cross-tenant duplicate documents must be allowed, got ${response.status}`);

      response = await request('/api/drivers', {
        method: 'POST',
        body: JSON.stringify({
          ...baseDriver,
          fullName: 'Motorista CNH Vencida',
          cpf: '12312312387',
          cnhNumber: '24681357982',
          cnhExpiration: '2020-01-01',
        }),
      }, adminA);
      assert(response.status === 201, `expired CNH create expected 201/BLOCKED, got ${response.status}`);
      const expiredDriver = (await json(response)).item;
      assert(expiredDriver.status === DriverStatus.BLOCKED, 'expired CNH Driver was not born BLOCKED');

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}`, {}, adminB);
      assert(response.status === 404, `cross-tenant Driver read expected 404, got ${response.status}`);

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status: DriverStatus.BLOCKED }),
      }, adminA);
      assert(response.status === 400, `generic PATCH status expected 400, got ${response.status}`);

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: DriverStatus.BLOCKED, reason: 'Bloqueio de teste' }),
      }, readonlyA);
      assert(response.status === 403, `READONLY status expected 403, got ${response.status}`);

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: DriverStatus.BLOCKED, reason: 'Bloqueio de teste' }),
      }, adminA);
      assert(response.status === 200, `ADMIN status expected 200, got ${response.status}`);
      const blocked = (await json(response)).item;
      assert(blocked.status === DriverStatus.BLOCKED, 'status endpoint did not persist BLOCKED');
      assert(String(blocked.notes || '').includes('Bloqueio de teste'), 'status reason was not retained in Driver notes');

      response = await request('/api/drivers/missing-driver/health', {}, adminA);
      assert(response.status === 404, `missing health GET expected 404, got ${response.status}`);

      response = await request('/api/drivers/missing-driver/health', {
        method: 'PUT', body: JSON.stringify({ health: { bloodType: 'O+' } }),
      }, adminA);
      assert(response.status === 404, `orphan health PUT expected 404, got ${response.status}`);

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/health`, {
        method: 'PUT', body: JSON.stringify({ health: { bloodType: 'O+', allergies: 'Nenhuma' } }),
      }, adminA);
      assert(response.status === 200, `existing health PUT expected 200, got ${response.status}`);

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/health`, {}, adminA);
      assert(response.status === 200, `existing health GET expected 200, got ${response.status}`);
      assert((await json(response)).health.bloodType === 'O+', 'health read/write mismatch');

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/health`, {}, adminB);
      assert(response.status === 404, `cross-tenant health GET expected 404, got ${response.status}`);

      const originalAuditCreate = PostgresAuditLogRepository.prototype.create;
      PostgresAuditLogRepository.prototype.create = async function forcedAuditFailure(): Promise<any> {
        throw new Error('FORCED_AUDIT_FAILURE');
      };
      try {
        response = await request('/api/drivers', {
          method: 'POST',
          body: JSON.stringify({
            ...baseDriver,
            fullName: 'Motorista Rollback',
            cpf: '11144477735',
            cnhNumber: '98765432109',
          }),
        }, adminA);
        assert(response.status === 500, `forced audit failure expected 500, got ${response.status}`);
      } finally {
        PostgresAuditLogRepository.prototype.create = originalAuditCreate;
      }

      response = await request('/api/drivers', {}, adminA);
      assert(response.status === 200, `post-rollback list expected 200, got ${response.status}`);
      const afterRollback = await json(response);
      assert(!afterRollback.items.some((item: any) => item.cpf === '11144477735'), 'Driver write survived forced audit rollback');

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/archive`, { method: 'POST', body: '{}' }, adminA);
      assert(response.status === 200, `archive expected 200, got ${response.status}`);
      const archived = (await json(response)).item;
      assert(archived.status === DriverStatus.ARCHIVED && archived.isArchived === true, 'archive is not soft ARCHIVED');

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}`, {}, adminA);
      assert(response.status === 404, `archived core GET expected 404, got ${response.status}`);

      response = await request(`/api/drivers/${encodeURIComponent(driverA.id)}/health`, {}, adminA);
      assert(response.status === 404, `archived Driver health GET expected 404, got ${response.status}`);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

if (process.argv[1]?.includes('driverAuthorityIntegration')) {
  DriverAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Driver authority integration PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
