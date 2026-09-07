import { VehicleApiError, VehicleClient } from '../vehicleClient';
import { VehicleStatus } from '../../types/enums';

const vehicle = {
  id: 'veh-1', companyId: 'company-a', plate: 'ABC1D23', brand: 'Chevrolet', model: 'Onix', version: 'LT',
  yearFabrication: 2025, yearModel: 2026, color: 'Branco', renavam: '12345678901', chassis: '9BG123',
  currentKm: 10, nextMaintenanceKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 70000,
  currentValue: 65000, rentalValueBase: 750, status: VehicleStatus.AVAILABLE, isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const kmRecord = {
  id: 'km-1', companyId: 'company-a', vehicleId: 'veh-1', kmValue: 20, recordDate: '2026-01-02',
  readingType: 'PERIODIC', notes: 'Leitura', createdAt: '2026-01-02T00:00:00.000Z',
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
      await VehicleClient.create({ plate: 'ABC1D23', renavam: '12345678901', brand: 'Chevrolet', model: 'Onix', yearFabrication: 2025, yearModel: 2026, color: 'Branco', chassis: '9BG123', fuelType: 'Flex', category: 'Hatch / Sedan Compacto', currentKm: 10, acquisitionValue: 1, currentValue: 1, rentalValueBase: 1 });
      for (const key of ['companyId', 'userId', 'userName', 'role', 'currentDriverId', 'currentContractId', 'status', 'isArchived']) {
        if (key in body) throw new Error(`browser authority leaked ${key}`);
      }
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...vehicle, brand: 'GM' } }), { status: 200 });
      }) as typeof fetch;
      await VehicleClient.update('veh-1', { brand: 'GM' });
      if (body.brand !== 'GM' || 'currentKm' in body) throw new Error('UPDATE authority surface');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ item: { ...vehicle, status: VehicleStatus.MAINTENANCE } }), { status: 200 });
      }) as typeof fetch;
      await VehicleClient.changeStatus('veh-1', VehicleStatus.MAINTENANCE, 'Oficina');
      if (body.status !== VehicleStatus.MAINTENANCE || 'companyId' in body || 'userId' in body) throw new Error('STATUS authority');
    });

    tests.push(async () => {
      let url = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        if (init?.credentials !== 'include') throw new Error('KM list missing credentials');
        return new Response(JSON.stringify({ items: [kmRecord] }), { status: 200 });
      }) as typeof fetch;
      const items = await VehicleClient.listKm('veh 1');
      if (items.length !== 1 || items[0].kmValue !== 20 || !url.includes('veh%201/km-records')) throw new Error('KM LIST transport');
    });

    tests.push(async () => {
      let body: Record<string, unknown> = {};
      let method = '';
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        method = String(init?.method);
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ record: kmRecord, vehicle: { ...vehicle, currentKm: 20 } }), { status: 201 });
      }) as typeof fetch;
      const result = await VehicleClient.recordKm('veh-1', { kmValue: 20, readingType: 'PERIODIC', notes: 'Leitura' });
      if (method !== 'POST' || result.record.kmValue !== 20 || result.vehicle.currentKm !== 20) throw new Error('KM RECORD transport');
      for (const key of ['companyId', 'userId', 'userName', 'role', 'driverId', 'contractId', 'vehicleId']) {
        if (key in body) throw new Error(`KM browser authority leaked ${key}`);
      }
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
      try { await VehicleClient.recordKm('veh-1', { kmValue: 20, readingType: 'PERIODIC' }); } catch (caught) { error = caught; }
      if (!(error instanceof VehicleApiError) || error.status !== 403) throw new Error('KM 403 fail closed');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...vehicle, currentKm: 'not-a-number' } }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await VehicleClient.get('veh-1'); } catch { failed = true; }
      if (!failed) throw new Error('malformed Vehicle must fail');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ ...kmRecord, readingType: 'INVALID' }] }), { status: 200 })) as typeof fetch;
      let failed = false;
      try { await VehicleClient.listKm('veh-1'); } catch { failed = true; }
      if (!failed) throw new Error('malformed KM list must fail');
    });

    tests.push(async () => {
      globalThis.fetch = (async () => new Response(JSON.stringify({ record: { ...kmRecord, kmValue: '20' }, vehicle }), { status: 201 })) as typeof fetch;
      let failed = false;
      try { await VehicleClient.recordKm('veh-1', { kmValue: 20, readingType: 'PERIODIC' }); } catch { failed = true; }
      if (!failed) throw new Error('malformed KM result must fail');
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
