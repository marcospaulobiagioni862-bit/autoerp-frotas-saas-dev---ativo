import { DriverClient, DriverApiError } from '../driverClient';
import { DocumentStatus, DriverStatus } from '../../types/enums';

const driver = {
  id: 'driver-1', companyId: 'company-a', fullName: 'Motorista Teste', cpf: '12345678909',
  birthDate: '1990-01-01', phone: '11999999999', whatsapp: '11999999999',
  address: { street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '' },
  cnhNumber: '12345678900', cnhCategory: 'B', cnhExpiration: '2030-01-01',
  cnhStatus: DocumentStatus.VALID, appPlatforms: ['Uber'], status: DriverStatus.ACTIVE,
  isArchived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

export class DriverClientTestRunner {
  static async runAllTests(): Promise<void> {
    const originalFetch = globalThis.fetch;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let credentials = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        credentials = String(init?.credentials);
        return new Response(JSON.stringify({ items: [driver] }), { status: 200 });
      }) as typeof fetch;
      const items = await DriverClient.list();
      if (items.length !== 1 || credentials !== 'include') throw new Error('LIST transport');
    });

    tests.push(async () => {
      let url = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        if (init?.credentials !== 'include') throw new Error('GET credentials');
        return new Response(JSON.stringify({ item: driver }), { status: 200 });
      }) as typeof fetch;
      await DriverClient.get('driver 1');
      if (!url.includes('driver%201')) throw new Error('GET encoding');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: driver }), { status: 201 });
      }) as typeof fetch;
      await DriverClient.create({
        fullName: 'Motorista Teste', cpf: '12345678909', birthDate: '1990-01-01',
        phone: '11999999999', cnhNumber: '12345678900', cnhExpiration: '2030-01-01',
      });
      for (const key of ['companyId','userId','userName','role','status','isArchived','currentVehicleId','currentContractId','healthAndEmergency']) {
        if (key in body) throw new Error(`CREATE authority leaked ${key}`);
      }
    });

    tests.push(async () => {
      let method = '';
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...driver, fullName: 'Nome Novo' } }), { status: 200 });
      }) as typeof fetch;
      await DriverClient.update('driver-1', { fullName: 'Nome Novo' });
      if (method !== 'PATCH' || body.fullName !== 'Nome Novo') throw new Error('UPDATE transport');
    });

    tests.push(async () => {
      let url = '';
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...driver, status: DriverStatus.BLOCKED } }), { status: 200 });
      }) as typeof fetch;
      await DriverClient.changeStatus('driver-1', DriverStatus.BLOCKED, 'CNH suspensa');
      if (!url.endsWith('/status') || body.status !== DriverStatus.BLOCKED || body.reason !== 'CNH suspensa') {
        throw new Error('STATUS transport/reason');
      }
      for (const key of ['companyId','userId','userName','role','isArchived','currentVehicleId','currentContractId','healthAndEmergency']) {
        if (key in body) throw new Error(`STATUS authority leaked ${key}`);
      }
    });

    tests.push(async () => {
      let method = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        return new Response(JSON.stringify({ item: { ...driver, status: DriverStatus.ARCHIVED, isArchived: true } }), { status: 200 });
      }) as typeof fetch;
      const archived = await DriverClient.archive('driver-1');
      if (method !== 'POST' || !archived.isArchived) throw new Error('ARCHIVE transport');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let error: unknown;
      try { await DriverClient.update('driver-1', { fullName: 'Nome Novo' }); } catch (caught) { error = caught; }
      if (!(error instanceof DriverApiError) || error.status !== 403) throw new Error('403 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...driver, status: 'INVALID' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await DriverClient.get('driver-1'); } catch { failed = true; }
      if (!failed) throw new Error('malformed Driver must fail');
    });

    try {
      for (const test of tests) await test();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}
