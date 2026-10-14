import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
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

// 4. Testando Consulta de Retenção Jurídica de 90 Dias (AUTOERP-62) contra Schema e Dados Reais
console.log('4. Testando consulta de retenção estrita de 90 dias após encerramento contra PostgreSQL in-memory...');
{
  const pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE contracts (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      status text NOT NULL,
      end_date text
    );
    CREATE TABLE vehicle_inspections (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      contract_id text NOT NULL
    );
    CREATE TABLE file_attachments (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      file_name text NOT NULL,
      is_archived boolean NOT NULL DEFAULT false
    );
  `);

  // 1) Contrato CLOSED encerrado há 100 dias (deve ser capturado na janela de 90d)
  await pglite.exec(`
    INSERT INTO contracts (id, company_id, status, end_date)
    VALUES ('cnt-closed-100d', 'tenant-test', 'CLOSED', (CURRENT_DATE - INTERVAL '100 days')::date::text);

    INSERT INTO vehicle_inspections (id, company_id, contract_id)
    VALUES ('insp-1', 'tenant-test', 'cnt-closed-100d');

    INSERT INTO file_attachments (id, company_id, entity_type, entity_id, file_name, is_archived)
    VALUES ('att-eligible-1', 'tenant-test', 'VehicleInspection', 'insp-1', 'foto-frente.jpg', false);
  `);

  // 2) Contrato FINISHED encerrado há 110 dias (deve ser capturado)
  await pglite.exec(`
    INSERT INTO contracts (id, company_id, status, end_date)
    VALUES ('cnt-finished-110d', 'tenant-test', 'FINISHED', (CURRENT_DATE - INTERVAL '110 days')::date::text);

    INSERT INTO vehicle_inspections (id, company_id, contract_id)
    VALUES ('insp-2', 'tenant-test', 'cnt-finished-110d');

    INSERT INTO file_attachments (id, company_id, entity_type, entity_id, file_name, is_archived)
    VALUES ('att-eligible-2', 'tenant-test', 'VehicleInspection', 'insp-2', 'foto-traseira.jpg', false);
  `);

  // 3) Contrato CLOSED encerrado há 30 dias (recente -> NÃO deve ser purgado)
  await pglite.exec(`
    INSERT INTO contracts (id, company_id, status, end_date)
    VALUES ('cnt-closed-recent', 'tenant-test', 'CLOSED', (CURRENT_DATE - INTERVAL '30 days')::date::text);

    INSERT INTO vehicle_inspections (id, company_id, contract_id)
    VALUES ('insp-3', 'tenant-test', 'cnt-closed-recent');

    INSERT INTO file_attachments (id, company_id, entity_type, entity_id, file_name, is_archived)
    VALUES ('att-recent', 'tenant-test', 'VehicleInspection', 'insp-3', 'foto-recente.jpg', false);
  `);

  // 4) Contrato ACTIVE (ativo -> NUNCA deve ser purgado)
  await pglite.exec(`
    INSERT INTO contracts (id, company_id, status, end_date)
    VALUES ('cnt-active', 'tenant-test', 'ACTIVE', (CURRENT_DATE - INTERVAL '120 days')::date::text);

    INSERT INTO vehicle_inspections (id, company_id, contract_id)
    VALUES ('insp-4', 'tenant-test', 'cnt-active');

    INSERT INTO file_attachments (id, company_id, entity_type, entity_id, file_name, is_archived)
    VALUES ('att-active', 'tenant-test', 'VehicleInspection', 'insp-4', 'foto-ativa.jpg', false);
  `);

  // 5) Outro tenant (cross-tenant -> NUNCA deve vazar)
  await pglite.exec(`
    INSERT INTO contracts (id, company_id, status, end_date)
    VALUES ('cnt-other-tenant', 'tenant-outro', 'CLOSED', (CURRENT_DATE - INTERVAL '120 days')::date::text);

    INSERT INTO vehicle_inspections (id, company_id, contract_id)
    VALUES ('insp-5', 'tenant-outro', 'cnt-other-tenant');

    INSERT INTO file_attachments (id, company_id, entity_type, entity_id, file_name, is_archived)
    VALUES ('att-other-tenant', 'tenant-outro', 'VehicleInspection', 'insp-5', 'foto-outro.jpg', false);
  `);

  const dialect = new PgDialect();
  const realTx = {
    execute: async (queryObj: any) => {
      const compiled = dialect.sqlToQuery(queryObj);
      const res = await pglite.query(compiled.sql, compiled.params);
      return res;
    },
  };

  const eligible = await VehicleInspectionSettlementAuthority.listEligiblePurgeAttachments(
    realTx,
    'tenant-test',
    90
  );

  assert.equal(eligible.length, 2, 'Deve identificar exatamente os 2 anexos com contratos CLOSED/FINISHED > 90 dias');
  const ids = eligible.map((e) => e.id).sort();
  assert.deepEqual(ids, ['att-eligible-1', 'att-eligible-2']);

  // Testar com janela de 150 dias: nenhum deve ser elegível
  const eligible150 = await VehicleInspectionSettlementAuthority.listEligiblePurgeAttachments(
    realTx,
    'tenant-test',
    150
  );
  assert.equal(eligible150.length, 0, 'Com cutoff de 150 dias, nenhum anexo deve ser elegível');
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
