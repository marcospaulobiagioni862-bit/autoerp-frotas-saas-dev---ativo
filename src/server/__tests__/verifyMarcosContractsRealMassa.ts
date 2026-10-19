import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { sql } from 'drizzle-orm';
import type { AuthenticatedPrincipal } from '../auth';
import { ContractStatus, RecurringFrequency } from '../../types/enums';

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

const neonUrl = process.env.STAGING_MAIN_DATABASE_URL || process.env.HOMOLOG_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: STAGING_MAIN_DATABASE_URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

async function main() {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  process.env.ATTACHMENT_STORAGE_DIR = process.env.ATTACHMENT_STORAGE_DIR || await mkdtemp(join(tmpdir(), 'autoerp-storage-marcos-'));
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-marcos-52';

  const { db } = await import('../../db/index');
  const { registerContractRoutes } = await import('../contractRoutes');
  const { registerContractExecutionRoutes } = await import('../contractExecutionRoutes');
  const { registerContractSimpleSignRoutes } = await import('../contractSimpleSignRoutes');

  const companyId = 'staging-company-001';
  const marcosUserId = 'staging-admin-001';
  const vehicleId = '980ce7ff-b744-4200-977e-ad9c1b370ed7'; // QFU3F06
  const driverId = '79f29174-b25a-4f37-9d63-251e05222457';  // Kleber Escolpione Dias (PENDING_DOCS)
  const templateId = '76672847-6942-4f03-8506-1e975e60c458'; // contrato-01

  // Ator real do Marcos
  const marcosActor: AuthenticatedPrincipal = {
    companyId,
    userId: marcosUserId,
    name: 'Administrador Staging',
    role: 'ADMIN',
    permissions: ['*'],
  };

  console.log('=== PH-052: AUDITORIA REAL DE CONTRATOS COM LOGIN DO MARCOS ===');
  console.log('Ambiente:', 'STAGING_MAIN (Neon dev-ativo)');
  console.log('Empresa:', companyId);
  console.log('Usuário:', `${marcosActor.name} (${marcosActor.userId})`);

  // Montar servidor express com principal do Marcos
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = marcosActor;
    next();
  });

  registerContractRoutes(app);
  registerContractExecutionRoutes(app);
  registerContractSimpleSignRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Listagem inicial de contratos
    console.log('\n[1/6] Listando contratos existentes como Marcos...');
    const listRes = await fetch(`${base}/api/contracts`);
    assert.equal(listRes.status, 200, 'GET /api/contracts deve responder 200');
    const initialList = (await listRes.json()) as { items: any[] };
    console.log(`  ✓ Contratos ativos existentes: ${initialList.items.length}`);

    // Limpar contratos anteriores de teste se existirem para permitir reexecução idempotente
    for (const c of initialList.items) {
      if (c.contractNumber === 'CTR-MARCOS-PILOTO-01' || c.contractNumber === 'CTR-MARCOS-TEMP-ARCHIVE') {
        console.log(`  Limpando contrato de teste anterior ${c.contractNumber} (${c.id})...`);
        await db.execute(sql`DELETE FROM contracts WHERE id = ${c.id}`);
      }
    }

    // 2. Criar contrato piloto em DRAFT com motorista do intake (PENDING_DOCS)
    console.log('\n[2/6] Criando contrato piloto em DRAFT com motorista em PENDING_DOCS...');
    const createRes = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-idempotency-key': `marcos-contract-pilot-${Date.now()}` },
      body: JSON.stringify({
        status: ContractStatus.DRAFT,
        contractNumber: 'CTR-MARCOS-PILOTO-01',
        driverId,
        vehicleId,
        startDate: '2026-10-19',
        rentalAmount: 650,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        billingDueDayOfWeek: 1,
        securityDepositAmount: 1000,
        franchiseKm: 1000,
        excessKmRate: 0.50,
        templateId,
        notes: 'Contrato piloto para simulação do Marcos',
      }),
    });
    assert.equal(createRes.status, 201, `Criação em DRAFT deve responder 201, obtido: ${createRes.status}`);
    const createdData = (await createRes.json()) as { item: any };
    const pilotContract = createdData.item;
    console.log(`  ✓ Contrato criado com sucesso: ID ${pilotContract.id}, Número ${pilotContract.contractNumber}, Status ${pilotContract.status}`);
    assert.equal(pilotContract.status, ContractStatus.DRAFT);
    assert.equal(pilotContract.driverId, driverId);
    assert.equal(pilotContract.vehicleId, vehicleId);

    // 3. Visualizar contrato criado
    console.log('\n[3/6] Visualizando detalhes do contrato (GET /api/contracts/:id)...');
    const getRes = await fetch(`${base}/api/contracts/${pilotContract.id}`);
    assert.equal(getRes.status, 200, 'GET /api/contracts/:id deve responder 200');
    const fetchedData = (await getRes.json()) as { item: any };
    console.log(`  ✓ Contrato recuperado: Aluguel R$ ${fetchedData.item.rentalAmount}, Notas: "${fetchedData.item.notes}"`);
    assert.equal(fetchedData.item.id, pilotContract.id);

    // 4. Editar contrato (PATCH /api/contracts/:id) alterando aluguel e notas
    console.log('\n[4/6] Editando contrato como Marcos (PATCH /api/contracts/:id)...');
    const patchRes = await fetch(`${base}/api/contracts/${pilotContract.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rentalAmount: 700,
        notes: 'Simulação piloto atualizada pelo Marcos com valor reajustado',
      }),
    });
    assert.equal(patchRes.status, 200, 'PATCH /api/contracts/:id deve responder 200');
    const patchedData = (await patchRes.json()) as { item: any };
    console.log(`  ✓ Contrato atualizado: Novo aluguel R$ ${patchedData.item.rentalAmount}, Novas notas: "${patchedData.item.notes}"`);
    assert.equal(patchedData.item.rentalAmount, 700);

    // 5. Verificar auditoria no Neon
    console.log('\n[5/6] Verificando logs de auditoria no Neon...');
    const auditRes: any = await db.execute(sql`
      SELECT id, action, entity_type, entity_id, user_id, changes, timestamp
      FROM audit_logs
      WHERE company_id = ${companyId} AND entity_id = ${pilotContract.id}
      ORDER BY timestamp DESC
    `);
    console.log(`  ✓ Registros de auditoria encontrados: ${auditRes.rows.length}`);
    for (const log of auditRes.rows) {
      console.log(`    - Ação: ${log.action}, Usuário: ${log.user_id}, Data: ${log.timestamp}`);
    }
    assert(auditRes.rows.some((r: any) => r.action === 'UPDATE' && r.user_id === marcosUserId), 'Audit log deve conter UPDATE realizado por Marcos');

    // 6. Testar arquivamento sem perda de dados
    console.log('\n[6/6] Testando arquivamento de contrato...');
    const tempVehId = 'temp-veh-marcos-archive-52';
    const tempDrvId = 'temp-drv-marcos-archive-52';
    await db.execute(sql`
      INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
        (${tempVehId}, ${companyId}, 'ARC5252', 'RENAVAM_ARC_52', 'AVAILABLE', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='AVAILABLE', current_driver_id='', current_contract_id='', updated_at=NOW()
    `);
    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, phone, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
      ) VALUES
        (${tempDrvId}, ${companyId}, 'Motorista Arquivo Teste', '11988887777', '99988877766', '88877766655', true, '2035-01-01', 'ACTIVE', ARRAY[]::text[], false, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='ACTIVE', active=true, updated_at=NOW()
    `);

    // Criar um contrato temporário para teste de arquivamento
    const tempCreateRes = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-idempotency-key': `marcos-temp-archive-${Date.now()}` },
      body: JSON.stringify({
        status: ContractStatus.DRAFT,
        contractNumber: 'CTR-MARCOS-TEMP-ARCHIVE',
        driverId: tempDrvId,
        vehicleId: tempVehId,
        startDate: '2026-10-19',
        rentalAmount: 500,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        billingDueDayOfWeek: 1,
        notes: 'Contrato temporário para validar arquivamento',
      }),
    });
    assert.equal(tempCreateRes.status, 201);
    const tempContract = ((await tempCreateRes.json()) as { item: any }).item;

    const archiveRes = await fetch(`${base}/api/contracts/${tempContract.id}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Arquivamento solicitado pelo Marcos' }),
    });
    assert.equal(archiveRes.status, 200, 'POST /api/contracts/:id/archive deve responder 200');

    // Conferir que saiu da lista ativa
    const listAfterRes = await fetch(`${base}/api/contracts`);
    const listAfterData = (await listAfterRes.json()) as { items: any[] };
    assert(!listAfterData.items.some((c: any) => c.id === tempContract.id), 'Contrato arquivado NÃO deve aparecer na listagem ativa');
    console.log('  ✓ Contrato arquivado foi removido da listagem ativa com sucesso');

    // Conferir no banco Neon que a linha NÃO foi apagada
    const dbCheck: any = await db.execute(sql`
      SELECT id, contract_number, status, is_archived, notes FROM contracts WHERE id = ${tempContract.id}
    `);
    assert.equal(dbCheck.rows.length, 1, 'Linha do contrato DEVE continuar existindo no banco de dados');
    assert.equal(dbCheck.rows[0].is_archived, true, 'is_archived deve ser true');
    assert.equal(dbCheck.rows[0].status, ContractStatus.ARCHIVED, 'status deve ser ARCHIVED');
    console.log('  ✓ Conferência no Postgres Neon: linha preservada intacta com is_archived = true');

    // Limpar os registros temporários de arquivamento para não poluir o banco de homologação
    await db.execute(sql`DELETE FROM contracts WHERE id = ${tempContract.id}`);
    await db.execute(sql`DELETE FROM drivers WHERE id = ${tempDrvId}`);
    await db.execute(sql`DELETE FROM vehicles WHERE id = ${tempVehId}`);

    console.log('\n=======================================================');
    console.log('=== AUDITORIA REAL DE CONTRATOS DO MARCOS: 100% SUCESSO ===');
    console.log(`=== Contrato Piloto Ativo Mantido: ID ${pilotContract.id} ===`);
    console.log('=======================================================\n');
  } finally {
    server.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL ERROR ON REAL MASSA VERIFICATION:', err);
    process.exit(1);
  });
