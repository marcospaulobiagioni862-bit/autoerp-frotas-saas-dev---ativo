import { VehicleApiError, VehicleClient } from '../vehicleClient';
import { VehicleStatus } from '../../types/enums';

const vehicle = {
  id: 'veh-1', companyId: 'company-a', plate: 'ABC1D23', brand: 'Chevrolet', model: 'Onix', version: 'LT',
  yearFabrication: 2025, yearModel: 2026, color: 'Branco', renavam: '12345678901', chassis: '9BG123',
  currentKm: 10, nextMaintenanceKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 70000,
  currentValue: 65000, rentalValueBase: 750, status: VehicleStatus.AVAILABLE, isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

export class VehicleClientTestRunner {
  static async runAllTests() {
    const originalFetch = globalThis.fetch;
    let passed = 0;
    const tests: Array<() => Promise<void>> = [];

    tests.push(async () => {
      let credentials: RequestCredentials | undefined;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        credentials = init?.credentials;
        return new Response(JSON.stringify({ items: [vehicle] }), { status: 200 });
      }) as typeof fetch;
      const items = await VehicleClient.list();
      if (items.length !== 1 || credentials !== 'include') throw new Error('LIST transport');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: vehicle }), { status: 200 })) as typeof fetch;
      if ((await VehicleClient.get('veh 1')).id !== 'veh-1') throw new Error('GET transport');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: vehicle }), { status: 201 });
      }) as typeof fetch;
      await VehicleClient.create({ plate: 'ABC1D23', renavam: '12345678901', brand: 'Chevrolet', model: 'Onix', currentKm: 10, acquisitionValue: 1, currentValue: 1, rentalValueBase: 1 });
      for (const key of ['companyId', 'userId', 'userName', 'role', 'currentDriverId', 'currentContractId', 'status', 'isArchived']) {
        if (key in body) throw new Error(`browser authority leaked ${key}`);
      }
    });

    tests.push(async () => {
      let method = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        return new Response(JSON.stringify({ item: { ...vehicle, brand: 'GM' } }), { status: 200 });
      }) as typeof fetch;
      await VehicleClient.update('veh-1', { brand: 'GM' });
      if (method !== 'PATCH') throw new Error('UPDATE method');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...vehicle, status: VehicleStatus.MAINTENANCE } }), { status: 200 });
      }) as typeof fetch;
      const updated = await VehicleClient.changeStatus('veh-1', VehicleStatus.MAINTENANCE, 'Oficina');
      if (updated.status !== VehicleStatus.MAINTENANCE || body.status !== VehicleStatus.MAINTENANCE) throw new Error('STATUS transport');
      for (const key of ['companyId', 'userId', 'userName', 'role']) if (key in body) throw new Error(`status authority leaked ${key}`);
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;
      let error: unknown;
      try { await VehicleClient.list(); } catch (caught) { error = caught; }
      if (!(error instanceof VehicleApiError) || error.status !== 401) throw new Error('401 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let error: unknown;
      try { await VehicleClient.update('veh-1', { brand: 'GM' }); } catch (caught) { error = caught; }
      if (!(error instanceof VehicleApiError) || error.status !== 403) throw new Error('403 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...vehicle, currentKm: 'not-a-number' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await VehicleClient.get('veh-1'); } catch { failed = true; }
      if (!failed) throw new Error('malformed payload must fail');
    });

    try {
      for (const test of tests) { await test(); passed++; }
    } finally {
      globalThis.fetch = originalFetch;
    }
    const result = { passed, failed: tests.length - passed, total: tests.length };
    console.log(`VehicleClient ${passed}/${tests.length} PASS`);
    return result;
  }
}

if (process.argv[1]?.includes('vehicleClientTestRunner')) {
  VehicleClientTestRunner.runAllTests().then((result) => {
    if (result.failed) process.exit(1);
  }).catch((error) => { console.error(error); process.exit(1); });
}
