import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { UnitOfWork } from '../../db/uow';
import { vehicles, accountPayables, financialCategories } from '../../db/schema';
import { registerVehicleTaxCalendarRoutes } from '../vehicleTaxCalendarRoutes';
import { VehicleTaxCalendarAuthority } from '../vehicleTaxCalendarAuthority';

async function testPresetAndPayables(): Promise<void> {
  const app = express();
  app.use(express.json());

  let currentActor: any = {
    userId: 'admin-user-id',
    companyId: 'company-tax-test',
    name: 'Admin User',
    role: 'ADMIN',
    permissions: ['*'],
  };

  app.use((req, _res, next) => {
    (req as any).principal = currentActor;
    next();
  });

  registerVehicleTaxCalendarRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server address unavailable');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const originalRun = UnitOfWork.run;

  const mockCalendarEntries: any[] = [];
  const mockVehicles = [
    {
      id: 'veh-sp-123',
      companyId: 'company-tax-test',
      plate: 'ABC1D23', // Final 3
      registrationState: 'SP',
    },
    {
      id: 'veh-no-digit',
      companyId: 'company-tax-test',
      plate: 'ABCDEFG',
      registrationState: 'SP',
    },
  ];
  const mockAccountPayables: any[] = [];
  const mockCategories: any[] = [
    {
      id: 'cat-doc-1',
      companyId: 'company-tax-test',
      name: 'Documentação e IPVA',
      type: 'EXPENSE',
      active: true,
    },
  ];

  const mockTx = {
    execute: async (query: any) => {
      // Simulate upsert into mockCalendarEntries
      return { rows: [] };
    },
    select: () => ({
      from: (table: any) => ({
        where: (_condition: any) => ({
          orderBy: () => mockCalendarEntries,
          limit: () => {
            return mockVehicles;
          },
          [Symbol.iterator]: function* () {
            yield* mockCalendarEntries;
          },
        }),
      }),
    }),
    insert: (table: any) => ({
      values: async (data: any) => {
        if (Array.isArray(data)) {
          mockAccountPayables.push(...data);
        } else {
          mockAccountPayables.push(data);
        }
        return [data];
      },
    }),
  };

  try {
    // 1. Testa Guarda 403 Forbidden para não-ADMIN nas rotas de mutação
    currentActor = {
      userId: 'driver-user-id',
      companyId: 'company-tax-test',
      name: 'Driver User',
      role: 'OPERATIONAL',
      permissions: ['VIEW_VEHICLE'],
    };

    const forbiddenManualRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(forbiddenManualRes.status, 403, 'Rota POST /api/vehicle-tax-calendar deve barrar não-ADMIN com 403');

    const forbiddenPresetRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uf: 'SP', referenceYear: 2026 }),
    });
    assert.equal(forbiddenPresetRes.status, 403, 'Rota POST /api/vehicle-tax-calendar/preset deve barrar não-ADMIN com 403');

    const forbiddenPayablesRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_COTA_UNICA', totalAmount: 1200 }),
    });
    assert.equal(forbiddenPayablesRes.status, 403, 'Rota generate-payables deve barrar usuário sem PAYABLE_MUTATE com 403');

    // 2. Testa autorização como ADMIN
    currentActor = {
      userId: 'admin-user-id',
      companyId: 'company-tax-test',
      name: 'Admin User',
      role: 'ADMIN',
      permissions: ['*'],
    };

    // 3. Testa aplicação do Preset Oficial SP
    let upsertCount = 0;
    const originalUpsert = VehicleTaxCalendarAuthority.upsert;
    VehicleTaxCalendarAuthority.upsert = async (_companyId, _actorId, input: any) => {
      upsertCount += 1;
      mockCalendarEntries.push({
        id: `entry-${upsertCount}`,
        companyId: 'company-tax-test',
        uf: input.uf,
        referenceYear: input.referenceYear,
        plateLastDigit: input.plateLastDigit,
        taxType: input.taxType,
        installment: input.installment,
        dueDate: input.dueDate,
        notes: input.notes,
      });
      return mockCalendarEntries[mockCalendarEntries.length - 1];
    };

    const presetRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uf: 'SP', referenceYear: 2026 }),
    });
    assert.equal(presetRes.status, 201);
    const presetData = await presetRes.json();
    assert.equal(presetData.appliedCount, 70, 'Preset oficial de SP deve aplicar exatamente 70 vencimentos (10 dígitos x 7 vencimentos)');
    assert.equal(upsertCount, 70);

    // 4. Testa geração de Contas a Pagar
    (UnitOfWork as any).run = async (_companyId: string, callback: (ctx: any) => Promise<any>) => {
      const mockCtx = {
        getRawTransaction: () => ({
          select: () => ({
            from: (table: any) => ({
              where: (_cond: any) => {
                const res = table === vehicles
                  ? [mockVehicles[0]]
                  : table === accountPayables
                  ? mockAccountPayables
                  : table === financialCategories
                  ? mockCategories
                  : mockCalendarEntries.filter((e) => e.plateLastDigit === 3 && e.taxType === 'IPVA_PARCELADO');

                return Object.assign(Promise.resolve(res), {
                  limit: () => Promise.resolve(res),
                  orderBy: () => Promise.resolve(res),
                });
              },
            }),
          }),
          insert: (table: any) => ({
            values: async (data: any) => {
              mockAccountPayables.push(data);
              return [data];
            },
          }),
        }),
      };
      return await callback(mockCtx);
    };

    const generateParceladoRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_PARCELADO', totalAmount: 2500 }),
    });
    if (generateParceladoRes.status !== 201) {
      console.error('generateParcelado failed:', generateParceladoRes.status, await generateParceladoRes.json());
    }
    assert.equal(generateParceladoRes.status, 201);
    const genData = await generateParceladoRes.json();
    assert.equal(genData.items.length, 5, 'Deve gerar exatamente 5 parcelas de IPVA');
    assert.equal(genData.items[0].originalAmount, '500.00');
    assert.equal(genData.items[0].originType, 'TAX_IPVA');

    // 5. Testa trava de duplicação 409 Conflict
    const duplicatePayablesRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_PARCELADO', totalAmount: 2500 }),
    });
    assert.equal(duplicatePayablesRes.status, 409, 'Deve travar com 409 Conflict ao tentar gerar IPVA repetido no mesmo ano');

    VehicleTaxCalendarAuthority.upsert = originalUpsert;
    console.log('vehicleTaxCalendarPresetAndPayablesRegression: PASS');
  } finally {
    (UnitOfWork as any).run = originalRun;
    server.close();
  }
}

testPresetAndPayables().catch((err) => {
  console.error(err);
  process.exit(1);
});
