import assert from 'node:assert/strict';
import { calculateInspectionSettlement, VehicleInspectionSettlementAuthority } from '../vehicleInspectionSettlementAuthority';
import { compressImage } from '../../utils/imageCompressor';

// 1. Validação Matemática da Apuração de Desvios e Caução
console.log('1. Testando cálculo de acerto de devolução (KM, tanque, avarias e caução)...');
{
  const settlement1 = calculateInspectionSettlement({
    startOdometer: 50000,
    endOdometer: 51200,
    franchiseKm: 1000,
    excessKmRate: 1.5,
    startFuelLevel: 100,
    endFuelLevel: 50,
    fuelPricePerLiter: 6.0,
    tankCapacityLiters: 50,
    damagesCost: 400,
    washCost: 80,
    securityDepositAvailable: 1000,
  });

  // Delta KM = 1200 km, Franquia = 1000 km, Excedente = 200 km * 1.5 = R$ 300
  assert.equal(settlement1.deltaKm, 1200);
  assert.equal(settlement1.excessKm, 200);
  assert.equal(settlement1.excessKmCost, 300);

  // Combustível: delta 50% de 50L = 25L * R$ 6.0 = R$ 150
  assert.equal(settlement1.deltaFuelPercent, 50);
  assert.equal(settlement1.fuelDeltaLiters, 25);
  assert.equal(settlement1.fuelCost, 150);

  // Total de desvios = 300 (KM) + 150 (tanque) + 400 (avarias) + 80 (lavagem) = R$ 930
  assert.equal(settlement1.totalDeviations, 930);

  // Caução de R$ 1000 cobre os R$ 930:
  // Caução deduzido = R$ 930, Saldo a estornar ao motorista = R$ 70, Saldo devedor a cobrar = R$ 0
  assert.equal(settlement1.securityDepositDeducted, 930);
  assert.equal(settlement1.remainingDepositRefund, 70);
  assert.equal(settlement1.receivableAmount, 0);
}

// 2. Cenário onde Desvios Excedem o Caução (Gera Saldo Devedor a Cobrar)
console.log('2. Testando caso onde desvios superam o caução...');
{
  const settlement2 = calculateInspectionSettlement({
    startOdometer: 10000,
    endOdometer: 10500,
    franchiseKm: 0, // sem franquia
    excessKmRate: 0,
    startFuelLevel: 100,
    endFuelLevel: 100,
    damagesCost: 1500,
    washCost: 0,
    securityDepositAvailable: 800,
  });

  assert.equal(settlement2.totalDeviations, 1500);
  assert.equal(settlement2.securityDepositDeducted, 800);
  assert.equal(settlement2.remainingDepositRefund, 0);
  assert.equal(settlement2.receivableAmount, 700); // R$ 700 a faturar no Contas a Receber
}

// 3. Testando utilitário de compressão de imagens em ambiente Node/headless
console.log('3. Testando compressão client-side (fallback headless)...');
{
  const dummyFile = { size: 5000000, name: 'foto-inspecao.jpg', type: 'image/jpeg' } as any;
  const result = await compressImage(dummyFile);
  assert.ok(result.file);
  assert.equal(result.originalSize, 5000000);
}

// 4. Testando Consulta de Retenção Jurídica de 90 Dias (AUTOERP-62)
console.log('4. Testando consulta de retenção estrita de 90 dias após encerramento...');
{
  const executedQueries: string[] = [];
  const fakeTx = {
    execute: async (queryObj: any) => {
      executedQueries.push(String(queryObj));
      return {
        rows: [
          {
            id: 'att-old-1',
            file_name: 'foto-saida.jpg',
            contract_id: 'contract-finished-100-days-ago',
            end_date: '2026-06-01',
          },
        ],
      };
    },
  };

  const eligible = await VehicleInspectionSettlementAuthority.listEligiblePurgeAttachments(
    fakeTx,
    'tenant-test',
    90
  );

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'att-old-1');
  assert.equal(eligible[0].contractId, 'contract-finished-100-days-ago');
}

// 5. Testando Acerto Financeiro Integrado com Transição de Frota e Contas a Receber
console.log('5. Testando processamento transacional de acerto de devolução...');
{
  let vehicleUpdated: any = null;
  let auditLogs: any[] = [];
  let updateQueries: string[] = [];

  const fakeContext: any = {
    getRawTransaction: () => ({
      execute: async (q: any) => {
        const text = JSON.stringify(q);
        if (text.includes('SELECT * FROM vehicle_inspections')) {
          return {
            rows: [
              {
                id: 'insp-entry-1',
                company_id: 'tenant-test',
                vehicle_id: 'veh-1',
                contract_id: 'cnt-1',
                driver_id: 'drv-1',
                inspection_type: 'ENTRY',
                checklist: {},
              },
            ],
          };
        }
        if (text.includes('SELECT id FROM financial_categories')) {
          return { rows: [{ id: 'cat-income-1' }] };
        }
        if (text.includes('UPDATE vehicle_inspections')) {
          updateQueries.push(text);
          return { rows: [] };
        }
        return { rows: [] };
      },
    }),
    getVehicleRepo: () => ({
      findByIdForCompany: async () => ({
        id: 'veh-1',
        plate: 'ABC1D23',
        status: 'RENTED',
      }),
      updateForCompany: async (_cid: string, _vid: string, patch: any) => {
        vehicleUpdated = patch;
        return { id: 'veh-1', ...patch };
      },
    }),
    getAuditLogRepo: () => ({
      create: async (log: any) => {
        auditLogs.push(log);
      },
    }),
    getUserRepo: () => ({
      findById: async () => ({
        id: 'user-op',
        companyId: 'tenant-test',
        role: 'ADMIN',
        active: true,
      }),
      findByIdForCompany: async () => ({
        id: 'user-op',
        companyId: 'tenant-test',
        role: 'ADMIN',
        active: true,
      }),
    }),
    getFinancialPeriodRepo: () => ({
      findAll: async () => [],
    }),
    getReceivableRepo: () => ({
      findByIdempotencyKey: async () => null,
      create: async (r: any) => ({ ...r, id: 'rec-created-1' }),
    }),
    getContractRepo: () => ({
      findByIdForCompanyWithLock: async () => ({ id: 'cnt-1', isArchived: false }),
    }),
  };

  const settlementInput = {
    damagesCost: 650,
    receivableAmount: 350,
    excessKmCost: 0,
    fuelCost: 0,
    totalDeviations: 650,
  };

  const principal: any = {
    companyId: 'tenant-test',
    userId: 'user-op',
    name: 'Operador Pátio',
    role: 'ADMIN',
    permissions: ['*'],
  };

  const settlementResult = await VehicleInspectionSettlementAuthority.settle(
    fakeContext,
    'tenant-test',
    principal,
    'insp-entry-1',
    settlementInput
  );

  assert.equal(settlementResult.success, true);
  // Veículo com avarias detectadas deve ser transicionado para MANUTENÇÃO
  assert.ok(vehicleUpdated);
  assert.equal(vehicleUpdated.status, 'MAINTENANCE');
  // Deve registrar log de auditoria da vistoria
  assert.ok(auditLogs.some((l) => l.entityName === 'VehicleInspection'));
  assert.ok(auditLogs.some((l) => l.entityName === 'Vehicle'));
}

console.log('✅ Todos os testes de regressão do Passo 5 (AUTOERP-61 & AUTOERP-62) passaram com sucesso!');
