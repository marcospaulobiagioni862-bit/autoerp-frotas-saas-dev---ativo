import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';
import { createServer } from 'node:http';
import { registerVehicleRoutes } from '../vehicleRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { VEHICLE_CATEGORIES } from '../../types/enums';

const companyId = 'fleet-category-pickup-company';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export class VehicleCategoryAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    assert(VEHICLE_CATEGORIES.includes('Pickup / Caminhonete'), 'Pickup / Caminhonete is missing from the canonical categories');
    assert(VEHICLE_CATEGORIES.includes('Moto / Motocicleta'), 'Moto / Motocicleta is missing from the canonical categories');
    assert(VEHICLE_CATEGORIES.includes('Utilitário / VUC'), 'legacy Utilitário / VUC category was removed');

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const requestCompanyId = typeof req.headers['x-company-id'] === 'string' ? req.headers['x-company-id'] : '';
      const role = typeof req.headers['x-role'] === 'string' ? req.headers['x-role'] : '';
      if (requestCompanyId && role) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId: requestCompanyId,
          userId: `${requestCompanyId}-user`,
          name: `${role} Vehicle Category Integration User`,
          role,
          permissions: [],
        };
      }
      next();
    });
    registerVehicleRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object', 'integration server address unavailable');
    const base = `http://127.0.0.1:${address.port}`;
    const admin = { companyId, role: 'ADMIN' };

    const request = async (path: string, options: RequestInit = {}): Promise<globalThis.Response> => {
      const headers = new Headers(options.headers);
      if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      headers.set('x-company-id', admin.companyId);
      headers.set('x-role', admin.role);
      return await fetch(`${base}${path}`, { ...options, headers });
    };

    const baseVehicle = {
      plate: 'PIC1A23',
      renavam: '26500000001',
      brand: 'RAM',
      model: 'Rampage',
      version: 'Laramie',
      yearFabrication: 2025,
      yearModel: 2026,
      color: 'Branco',
      chassis: '9BR265PICKUP00001',
      currentKm: 100,
      nextMaintenanceKm: 10000,
      fuelType: 'Diesel',
      category: 'Pickup / Caminhonete',
      acquisitionValue: 250000,
      currentValue: 245000,
      rentalValueBase: 1800,
    };

    try {
      let response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'BAD1A23', renavam: '26500000009', category: 'Categoria inventada' }),
      });
      assert(response.status === 400, `invalid category expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'CLR1A23', renavam: '26500000002', color: '' }),
      });
      assert(response.status === 400, `missing color expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'CHS1A23', renavam: '26500000003', chassis: '' }),
      });
      assert(response.status === 400, `missing chassis expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'YER1A23', renavam: '26500000004', yearFabrication: 0 }),
      });
      assert(response.status === 400, `invalid fabrication year expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'KMN1A23', renavam: '26500000005', currentKm: 100.5 }),
      });
      assert(response.status === 400, `fractional KM expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'MNT1A23', renavam: '26500000006', currentKm: 12000, nextMaintenanceKm: 10000 }),
      });
      assert(response.status === 400, `maintenance KM regression expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...baseVehicle, plate: 'VAL1A23', renavam: '26500000007', acquisitionValue: 0 }),
      });
      assert(response.status === 400, `zero acquisition expected 400, got ${response.status}`);

      response = await request('/api/fleet/vehicles', { method: 'POST', body: JSON.stringify(baseVehicle) });
      assert(response.status === 201, `Pickup create expected 201, got ${response.status}`);
      const created = (await json(response)).item;
      assert(created.category === 'Pickup / Caminhonete', 'Pickup category was not persisted on create');

      response = await request('/api/fleet/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          ...baseVehicle,
          plate: 'BAT1A23',
          renavam: '26500000008',
          chassis: '9BR265PICKUP00008',
          currentKm: 150,
        }),
      });
      assert(response.status === 201, `KM batch fixture create expected 201, got ${response.status}`);
      const batchVehicle = (await json(response)).item;

      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}/km-records`, {
        method: 'POST',
        body: JSON.stringify({ kmValue: 100, readingType: 'PERIODIC', notes: 'KM igual não deve gravar' }),
      });
      assert(response.status === 400, `equal KM single update expected 400, got ${response.status}`);
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}/km-records`);
      assert(response.status === 200, `KM history expected 200, got ${response.status}`);
      const initialHistory = (await json(response)).items;
      assert(Array.isArray(initialHistory) && initialHistory.length === 1, 'equal KM single update created a duplicate visible KM record');

      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ brand: 'Ram' }),
      });
      assert(response.status === 200, `unrelated edit expected 200, got ${response.status}`);
      assert((await json(response)).item.category === 'Pickup / Caminhonete', 'unrelated edit reclassified the vehicle');

      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: 'Utilitário / VUC' }),
      });
      assert(response.status === 200, `legacy category edit expected 200, got ${response.status}`);
      assert((await json(response)).item.category === 'Utilitário / VUC', 'legacy category compatibility failed');

      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: 'Moto / Motocicleta' }),
      });
      assert(response.status === 200, `Motorcycle edit expected 200, got ${response.status}`);
      assert((await json(response)).item.category === 'Moto / Motocicleta', 'Motorcycle category was not persisted on edit');

      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: 'Pickup / Caminhonete' }),
      });
      assert(response.status === 200, `Pickup edit expected 200, got ${response.status}`);
      assert((await json(response)).item.category === 'Pickup / Caminhonete', 'Pickup category was not persisted on edit');

      response = await request('/api/fleet/vehicles');
      assert(response.status === 200, `vehicle list expected 200, got ${response.status}`);
      const list = (await json(response)).items;
      assert(list.some((item: any) => item.id === created.id && item.category === 'Pickup / Caminhonete'), 'Pickup category is missing from the fleet read model');

      response = await request('/api/fleet/vehicles/km-records/batch', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { vehicleId: created.id, kmValue: 200, notes: 'Leitura semanal' },
            { vehicleId: batchVehicle.id, kmValue: 150, notes: 'KM igual não deve gravar' },
          ],
        }),
      });
      assert(response.status === 400, `equal KM batch expected 400, got ${response.status}`);
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`);
      assert((await json(response)).item.currentKm === 100, 'equal KM batch partially updated the first vehicle');
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(batchVehicle.id)}`);
      assert((await json(response)).item.currentKm === 150, 'equal KM batch mutated the equal-KM vehicle');

      response = await request('/api/fleet/vehicles/km-records/batch', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { vehicleId: created.id, kmValue: 200, notes: 'Leitura semanal' },
            { vehicleId: batchVehicle.id, kmValue: 140, notes: 'Leitura inválida' },
          ],
        }),
      });
      assert(response.status === 400, `regressive KM batch expected 400, got ${response.status}`);
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`);
      assert((await json(response)).item.currentKm === 100, 'invalid KM batch partially updated the first vehicle');
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(batchVehicle.id)}`);
      assert((await json(response)).item.currentKm === 150, 'invalid KM batch mutated the regressive vehicle');

      response = await request('/api/fleet/vehicles/km-records/batch', {
        method: 'POST',
        body: JSON.stringify({
          entries: [
            { vehicleId: created.id, kmValue: 200, notes: 'Leitura semanal' },
            { vehicleId: batchVehicle.id, kmValue: 250, notes: 'Leitura semanal' },
          ],
        }),
      });
      assert(response.status === 201, `valid KM batch expected 201, got ${response.status}`);
      const batchResult = (await json(response)).items;
      assert(Array.isArray(batchResult) && batchResult.length === 2, 'valid KM batch must return both updated vehicles');
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(created.id)}`);
      assert((await json(response)).item.currentKm === 200, 'valid KM batch did not update the first vehicle');
      response = await request(`/api/fleet/vehicles/${encodeURIComponent(batchVehicle.id)}`);
      assert((await json(response)).item.currentKm === 250, 'valid KM batch did not update the second vehicle');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

if (process.argv[1]?.includes('vehicleCategoryAuthorityIntegration')) {
  VehicleCategoryAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Vehicle category authority integration PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}