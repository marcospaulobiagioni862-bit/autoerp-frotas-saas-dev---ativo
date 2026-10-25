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
  let mockAccountPayables: any[] = [];
  const mockCategories: any[] = [
    {
      id: 'cat-doc-1',
      companyId: 'company-tax-test',
      name: 'Documentação e IPVA',
      type: 'EXPENSE',
      active: true,
    },
  ];

  const mockUsers: any[] = [
    {
      id: 'admin-user-id',
      companyId: 'company-tax-test',
      name: 'Admin User',
      role: 'ADMIN',
      active: true,
      permissions: ['*'],
    },
    {
      id: 'inactive-admin-id',
      companyId: 'company-tax-test',
      name: 'Inactive Admin',
      role: 'ADMIN',
      active: false,
      permissions: ['*'],
    },
  ];

  (UnitOfWork as any).run = async (_companyId: string, callback: (ctx: any) => Promise<any>) => {
    const mockCtx = {
      getUserRepo: () => ({
        findById: async (id: string) => mockUsers.find((u) => u.id === id) || null,
      }),
      getRawTransaction: () => ({
        execute: async (query: any) => {
          return { rows: [] };
        },
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
            if (Array.isArray(data)) {
              mockAccountPayables.push(...data);
            } else {
              mockAccountPayables.push(data);
            }
            return [data];
          },
        }),
      }),
    };
    return await callback(mockCtx);
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
    assert.equal(forbiddenPayablesRes.status, 403, 'Rota generate-payables deve barrar usuário sem PAYABLE_MUTATE/ADMIN com 403');

    // 2. Testa autorização como ADMIN
    currentActor = {
      userId: 'admin-user-id',
      companyId: 'company-tax-test',
      name: 'Admin User',
      role: 'ADMIN',
      permissions: ['*'],
    };

    // 3. Testa rejeição para ano não homologado no preset oficial SP (Opção A)
    const invalidYearRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uf: 'SP', referenceYear: 2024 }),
    });
    assert.equal(invalidYearRes.status, 400, 'Preset SP deve rejeitar ano não homologado com 400');

    // 4. Testa aplicação do Preset Oficial SP para 2026 (10 dígitos x 7 vencimentos = 70)
    let appliedCount = 0;
    const originalApply = VehicleTaxCalendarAuthority.applyOfficialSpPreset;
    // Test direct applyOfficialSpPreset
    const presetResult = await VehicleTaxCalendarAuthority.applyOfficialSpPreset('company-tax-test', 'admin-user-id', 2026);
    assert.equal(presetResult.appliedCount, 70);
    assert.ok(presetResult.source.includes('Sefaz-SP'));

    // Mock calendar entries for vehicle final 3
    for (let m = 1; m <= 5; m++) {
      mockCalendarEntries.push({
        id: `entry-${m}`,
        companyId: 'company-tax-test',
        uf: 'SP',
        referenceYear: 2026,
        plateLastDigit: 3,
        taxType: 'IPVA_PARCELADO',
        installment: m,
        dueDate: `2026-0${m + 1}-15`,
        notes: 'Sefaz-SP',
      });
    }

    // 5. Testa FinancialAuthorizationService barrando usuário inativo com 403
    currentActor = {
      userId: 'inactive-admin-id',
      companyId: 'company-tax-test',
      name: 'Inactive Admin',
      role: 'ADMIN',
      permissions: ['*'],
    };
    const inactiveUserRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_PARCELADO', totalAmount: 2500 }),
    });
    assert.equal(inactiveUserRes.status, 403, 'FinancialAuthorizationService deve barrar usuário inativo com 403');

    // Restaura ator ADMIN ativo
    currentActor = {
      userId: 'admin-user-id',
      companyId: 'company-tax-test',
      name: 'Admin User',
      role: 'ADMIN',
      permissions: ['*'],
    };

    // 6. Testa geração de Contas a Pagar
    const generateParceladoRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_PARCELADO', totalAmount: 2500 }),
    });
    assert.equal(generateParceladoRes.status, 201);
    const genData = await generateParceladoRes.json();
    assert.equal(genData.items.length, 5, 'Deve gerar exatamente 5 parcelas de IPVA');
    assert.equal(genData.items[0].originalAmount, '500.00');
    assert.equal(genData.items[0].originType, 'TAX_IPVA');

    // 7. Testa trava de duplicação 409 Conflict para títulos ativos
    const duplicatePayablesRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_PARCELADO', totalAmount: 2500 }),
    });
    assert.equal(duplicatePayablesRes.status, 409, 'Deve travar com 409 Conflict ao tentar gerar IPVA repetido no mesmo ano');

    // 8. Testa regeração após cancelamento (cancela os 5 títulos e regera com sucesso 201)
    mockAccountPayables.forEach((p) => {
      p.cancelledAt = new Date().toISOString();
      p.status = 'CANCELLED';
    });

    const regenerateRes = await fetch(`${baseUrl}/api/vehicle-tax-calendar/vehicle/veh-sp-123/generate-payables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceYear: 2026, taxType: 'IPVA_PARCELADO', totalAmount: 2500 }),
    });
    assert.equal(regenerateRes.status, 201, 'Deve permitir regerar títulos após cancelamento sem colisão de chave');

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
