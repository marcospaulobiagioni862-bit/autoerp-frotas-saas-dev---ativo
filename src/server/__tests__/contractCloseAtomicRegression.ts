import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { sql } from 'drizzle-orm';
import type { AuthenticatedPrincipal } from '../auth';
import { ContractStatus, OriginType, VehicleStatus } from '../../types/enums';

// Carregar variáveis Neon
try {
  const envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn('Could not read ~/.config/autoerp-neon.env:', e);
}

const neonUrl = process.env.HOMOLOG_DATABASE_URL || process.env.STAGING_MAIN_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: Database URL is required to run contract close atomic regression.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

export async function runContractCloseAtomicRegression(): Promise<void> {
  const { db } = await import('../../db/index');
  const { registerContractRoutes } = await import('../contractRoutes');

  const companyId = 'staging-company-001';
  console.log('=== TESTE DE REGRESSÃO: ENCERRAMENTO ATÔMICO E LEITURA DE KM (AUTOERP-09) ===');

  // 1. Criar dados de isolamento para o teste
  const testVehicleId = `test-veh-close-${randomUUID().slice(0, 8)}`;
  const testDriverId = `test-drv-close-${randomUUID().slice(0, 8)}`;
  const testContractId = `test-cnt-close-${randomUUID().slice(0, 8)}`;
  const contractNumber = `CNT-TEST-${randomUUID().slice(0, 6).toUpperCase()}`;

  const today = new Date().toISOString().slice(0, 10);
  const initialKm = 20000;

  try {
    // 1.1 Inserir motorista e veículo de teste
    const testCpf = String(Math.floor(10000000000 + Math.random() * 89999999999));
    const testCnh = String(Math.floor(10000000000 + Math.random() * 89999999999));

    await db.execute(sql`
      INSERT INTO drivers (id, company_id, name, cpf, cnh, cnh_category, cnh_expiration, status, is_archived, created_at, updated_at)
      VALUES (${testDriverId}, ${companyId}, 'Motorista Teste Close', ${testCpf}, ${testCnh}, 'B', '2028-12-31', 'ACTIVE', false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    const testPlate = `CLS${Math.floor(10 + Math.random() * 89)}D${Math.floor(10 + Math.random() * 89)}`;
    const testRenavam = String(Math.floor(10000000000 + Math.random() * 89999999999));

    await db.execute(sql`
      INSERT INTO vehicles (id, company_id, plate, brand, model, renavam, current_km, status, is_archived, current_driver_id, current_contract_id, created_at, updated_at)
      VALUES (${testVehicleId}, ${companyId}, ${testPlate}, 'Fiat', 'Mobi Close', ${testRenavam}, ${initialKm}, 'RENTED', false, ${testDriverId}, ${testContractId}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    // 1.2 Inserir contrato ativo com franquia de KM
    await db.execute(sql`
      INSERT INTO contracts (
        id, company_id, contract_number, driver_id, vehicle_id, start_date, end_date,
        rental_amount, billing_periodicity, franchise_km, excess_km_rate,
        status, signature_required, is_archived, created_at, updated_at
      ) VALUES (
        ${testContractId}, ${companyId}, ${contractNumber}, ${testDriverId}, ${testVehicleId}, ${today}, NULL,
        700.00, 'WEEKLY', 1000, 0.50,
        'ACTIVE', false, false, NOW(), NOW()
      );
    `);

    // 1.3 Inserir leitura inicial de entrega CHECK_OUT (20.000 km)
    await db.execute(sql`
      INSERT INTO vehicle_km_records (id, company_id, vehicle_id, driver_id, contract_id, km_value, record_date, reading_type, notes, created_at)
      VALUES (${'km-out-' + randomUUID()}, ${companyId}, ${testVehicleId}, ${testDriverId}, ${testContractId}, ${initialKm}, ${today}, 'CHECK_OUT', 'Saída teste', NOW());
    `);

    // 2. Subir servidor Express com rotas reais de contrato
    const app = express();
    app.use(express.json());

    const adminActor: AuthenticatedPrincipal = {
      companyId,
      userId: 'v2demo-ngcompany001-user-admin',
      name: 'Admin Test Close',
      role: 'ADMIN',
      permissions: ['*'],
    };

    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = adminActor;
      next();
    });

    registerContractRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // -----------------------------------------------------------------------
      // CENÁRIO 1: Bloqueio obrigatório quando falta leitura de devolução CHECK_IN
      // -----------------------------------------------------------------------
      console.log('1. Testando trava obrigatória de odômetro de devolução no encerramento...');
      const attemptNoKmRes = await fetch(`${baseUrl}/api/contracts/${testContractId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Tentativa sem leitura de KM' }),
      });

      assert.equal(attemptNoKmRes.status, 409, 'Encerramento sem odômetro deve ser recusado com HTTP 409');
      const noKmErrorJson = await attemptNoKmRes.json();
      assert(
        String(noKmErrorJson.error).includes('leitura do odômetro de devolução'),
        `Mensagem de erro deve explicar bloqueio de odômetro: ${noKmErrorJson.error}`
      );

      // Conferir invariante: o contrato continua ACTIVE e veículo continua RENTED
      const contractCheck1: any = await db.execute(sql`SELECT status FROM contracts WHERE id = ${testContractId}`);
      assert.equal(contractCheck1.rows[0].status, 'ACTIVE', 'Contrato deve permanecer ACTIVE após bloqueio');

      const vehicleCheck1: any = await db.execute(sql`SELECT status, current_contract_id FROM vehicles WHERE id = ${testVehicleId}`);
      assert.equal(vehicleCheck1.rows[0].status, 'RENTED', 'Veículo deve permanecer RENTED após bloqueio');
      assert.equal(vehicleCheck1.rows[0].current_contract_id, testContractId, 'Vínculo do veículo deve ser preservado');
      console.log('   ✓ Trava de odômetro validada: HTTP 409 emitido, estado preservado.');

      // -----------------------------------------------------------------------
      // CENÁRIO 2: Rejeição de odômetro final inferior ao KM atual do veículo
      // -----------------------------------------------------------------------
      console.log('2. Testando rejeição de odômetro final inferior ao KM atual do veículo...');
      const attemptDecreasedKmRes = await fetch(`${baseUrl}/api/contracts/${testContractId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ finalKm: initialKm - 50, reason: 'Odômetro adulterado' }),
      });

      assert.equal(attemptDecreasedKmRes.status, 409, 'Odômetro regredido deve retornar HTTP 409');
      const decrErrorJson = await attemptDecreasedKmRes.json();
      assert(
        String(decrErrorJson.error).includes('não pode ser inferior ao odômetro atual'),
        `Mensagem de erro deve apontar inconsistência: ${decrErrorJson.error}`
      );
      console.log('   ✓ Validação de integridade de odômetro confirmada: HTTP 409 emitido.');

      // -----------------------------------------------------------------------
      // CENÁRIO 3: Encerramento atômico com excedente de KM e criação do recebível
      // -----------------------------------------------------------------------
      console.log('3. Testando encerramento atômico com finalKm e geração de KM excedente...');
      // initialKm = 20000. Franquia semanal = 1000. finalKm = 21600.
      // Percorrido = 1600. Excedente = 600 km * R$ 0.50 = R$ 300.00
      const finalKm = 21600;
      const expectedExcessAmount = 300.00;

      const successfulCloseRes = await fetch(`${baseUrl}/api/contracts/${testContractId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          finalKm,
          reason: 'Devolução com conferência de odômetro no encerramento',
        }),
      });

      assert.equal(successfulCloseRes.status, 200, 'Encerramento com odômetro válido deve retornar HTTP 200');
      const closePayload = await successfulCloseRes.json();
      assert.equal(closePayload.item.status, ContractStatus.CLOSED, 'Payload deve conter contrato CLOSED');
      assert(Array.isArray(closePayload.receivables), 'Payload deve retornar lista de receivables');

      // Conferir no banco Neon as 4 entidades atualizadas na mesma transação:
      // 1. Contrato
      const contractDb: any = await db.execute(sql`SELECT status, end_date FROM contracts WHERE id = ${testContractId}`);
      assert.equal(contractDb.rows[0].status, 'CLOSED', 'Contrato deve estar CLOSED no banco');
      assert.equal(contractDb.rows[0].end_date, today, 'Data de encerramento deve ser gravada');

      // 2. Veículo
      const vehicleDb: any = await db.execute(sql`SELECT status, current_km, current_contract_id, current_driver_id FROM vehicles WHERE id = ${testVehicleId}`);
      assert.equal(vehicleDb.rows[0].status, 'AVAILABLE', 'Veículo deve estar AVAILABLE no banco');
      assert.equal(vehicleDb.rows[0].current_km, finalKm, 'KM atual do veículo deve ser atualizado para o finalKm');
      assert.ok(!vehicleDb.rows[0].current_contract_id, 'current_contract_id deve ser liberado (null ou vazio)');
      assert.ok(!vehicleDb.rows[0].current_driver_id, 'current_driver_id deve ser liberado (null ou vazio)');

      // 3. Leitura de KM CHECK_IN
      const checkinDb: any = await db.execute(sql`
        SELECT km_value, reading_type FROM vehicle_km_records
        WHERE contract_id = ${testContractId} AND reading_type = 'CHECK_IN'
      `);
      assert.equal(checkinDb.rows.length, 1, 'Deve existir exatamente uma leitura CHECK_IN registrada');
      assert.equal(checkinDb.rows[0].km_value, finalKm, 'CHECK_IN deve ter gravado o odômetro final');

      // 4. Título a receber (KM_EXCESS)
      const receivableDb: any = await db.execute(sql`
        SELECT origin_type, origin_id, original_amount, description FROM account_receivables
        WHERE contract_id = ${testContractId} AND origin_type = 'KM_EXCESS'
      `);
      assert.equal(receivableDb.rows.length, 1, 'Deve existir título de KM_EXCESS criado no banco');
      assert.equal(receivableDb.rows[0].origin_id, `${testContractId}:close`, 'originId canônico de encerramento');
      assert.equal(Number(receivableDb.rows[0].original_amount), expectedExcessAmount, `Valor cobrado deve ser R$ ${expectedExcessAmount}`);
      console.log(`   ✓ Encerramento atômico comprovado: contrato CLOSED, veículo AVAILABLE (${finalKm} km), CHECK_IN gravado e título R$ ${expectedExcessAmount} criado!`);

      // -----------------------------------------------------------------------
      // CENÁRIO 4: Idempotência de encerramento
      // -----------------------------------------------------------------------
      console.log('4. Testando idempotência de re-encerramento...');
      const reCloseRes = await fetch(`${baseUrl}/api/contracts/${testContractId}/close`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ finalKm, reason: 'Re-encerramento' }),
      });
      assert.equal(reCloseRes.status, 200, 'Re-execução deve ser idempotente com HTTP 200');

      const receivableCount: any = await db.execute(sql`
        SELECT count(*) FROM account_receivables WHERE contract_id = ${testContractId} AND origin_type = 'KM_EXCESS'
      `);
      assert.equal(Number(receivableCount.rows[0].count), 1, 'Não deve duplicar título financeiro no re-fechamento');
      console.log('   ✓ Idempotência validada: zero duplicação.');

    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    // Limpeza higiênica dos dados de teste
    await db.execute(sql`DELETE FROM account_receivables WHERE contract_id = ${testContractId};`);
    await db.execute(sql`DELETE FROM vehicle_km_records WHERE contract_id = ${testContractId} OR vehicle_id = ${testVehicleId};`);
    await db.execute(sql`DELETE FROM contracts WHERE id = ${testContractId};`);
    await db.execute(sql`DELETE FROM vehicles WHERE id = ${testVehicleId};`);
    await db.execute(sql`DELETE FROM drivers WHERE id = ${testDriverId};`);
  }

  console.log('\n=== SUÍTE DE REGRESSÃO AUTOERP-09: 100% VERDE ===\n');
}

if (process.argv[1]?.endsWith('contractCloseAtomicRegression.ts')) {
  runContractCloseAtomicRegression()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
