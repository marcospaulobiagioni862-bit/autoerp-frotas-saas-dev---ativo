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

  console.log('=== PH-052 / PH-062: AUDITORIA REAL DE CONTRATOS COM LOGIN DO MARCOS ===');
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
    console.log('\n[1/7] Listando contratos existentes como Marcos...');
    const listRes = await fetch(`${base}/api/contracts`);
    assert.equal(listRes.status, 200, 'GET /api/contracts deve responder 200');
    const initialList = (await listRes.json()) as { items: any[] };
    console.log(`  ✓ Contratos ativos existentes: ${initialList.items.length}`);

    const existingPilotBeforeCleanup = initialList.items.find((c: any) => c.contractNumber === 'CTR-MARCOS-PILOTO-01');
    const existingPilotIdBeforeCleanup = existingPilotBeforeCleanup?.id;

    // Limpar APENAS fixtures temporárias descartáveis (CTR-VERIFY-TMP-* ou legadas CTR-MARCOS-TEMP-ARCHIVE)
    // REGRA DE OURO (PH-062): NUNCA DELETAR 'CTR-MARCOS-PILOTO-01' nem contratos de usuário!
    for (const c of initialList.items) {
      if (typeof c.contractNumber === 'string' && (c.contractNumber.startsWith('CTR-VERIFY-TMP-') || c.contractNumber === 'CTR-MARCOS-TEMP-ARCHIVE')) {
        console.log(`  Limpando fixture descartável anterior ${c.contractNumber} (${c.id})...`);
        await db.execute(sql`DELETE FROM contracts WHERE id = ${c.id}`);
      }
    }

    if (existingPilotIdBeforeCleanup) {
      const checkSurvived: any = await db.execute(sql`SELECT id FROM contracts WHERE id = ${existingPilotIdBeforeCleanup}`);
      assert.equal(checkSurvived.rows.length, 1, `CONTRATO PILOTO ${existingPilotIdBeforeCleanup} FOI APAGADO INDEVIDAMENTE NO CLEANUP!`);
    }

    // 2. Garantir contrato piloto do Marcos (CTR-MARCOS-PILOTO-01) via verificação/upsert sem destruição
    console.log('\n[2/7] Verificando contrato piloto do Marcos (CTR-MARCOS-PILOTO-01)...');
    let pilotContract = initialList.items.find((c: any) => c.contractNumber === 'CTR-MARCOS-PILOTO-01');
    if (!pilotContract) {
      console.log('  Contrato piloto não encontrado. Criando CTR-MARCOS-PILOTO-01 inicial para simulação do Marcos...');
      const createRes = await fetch(`${base}/api/contracts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-idempotency-key': 'marcos-contract-pilot-seed' },
        body: JSON.stringify({
          status: ContractStatus.DRAFT,
          contractNumber: 'CTR-MARCOS-PILOTO-01',
          driverId,
          vehicleId,
          startDate: '2026-10-19',
          rentalAmount: 700,
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
      pilotContract = ((await createRes.json()) as { item: any }).item;
      console.log(`  ✓ Contrato piloto criado: ID ${pilotContract.id}, Número ${pilotContract.contractNumber}, Status ${pilotContract.status}`);
    } else {
      console.log(`  ✓ Contrato piloto CTR-MARCOS-PILOTO-01 existente PRESERVADO INTACTO (ID: ${pilotContract.id}, Status: ${pilotContract.status}, Aluguel: R$ ${pilotContract.rentalAmount})`);
    }

    // Validar leitura do contrato piloto (sempre idempotente e não-destrutiva)
    const getPilotRes = await fetch(`${base}/api/contracts/${pilotContract.id}`);
    assert.equal(getPilotRes.status, 200, 'GET /api/contracts/:id deve responder 200 para o contrato piloto');
    const fetchedPilot = ((await getPilotRes.json()) as { item: any }).item;
    assert.equal(fetchedPilot.id, pilotContract.id, 'ID do contrato piloto deve ser estritamente preservado');

    // 3. Provisionar fixture descartável para validação de ciclo completo (criação, edição, auditoria e soft-archive)
    const tmpTimestamp = Date.now();
    const tempContractNumber = `CTR-VERIFY-TMP-${tmpTimestamp}`;
    const tempVehId = `temp-veh-verify-${tmpTimestamp}`;
    const tempDrvId = `temp-drv-verify-${tmpTimestamp}`;

    await db.execute(sql`
      INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
        (${tempVehId}, ${companyId}, 'TMP5252', 'RENAVAM_TMP_52', 'AVAILABLE', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='AVAILABLE', current_driver_id='', current_contract_id='', updated_at=NOW()
    `);
    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, phone, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
      ) VALUES
        (${tempDrvId}, ${companyId}, 'Motorista Descartável Teste', '11988887777', '99988877766', '88877766655', true, '2035-01-01', 'PENDING_DOCS', ARRAY[]::text[], false, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='PENDING_DOCS', active=true, updated_at=NOW()
    `);

    // Criar contrato temporário em DRAFT com motorista PENDING_DOCS (valida afrouxamento de guarda PH-052)
    console.log(`\n[3/7] Criando fixture descartável ${tempContractNumber} com motorista em PENDING_DOCS...`);
    const tempCreateRes = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-idempotency-key': `verify-tmp-create-${tmpTimestamp}` },
      body: JSON.stringify({
        status: ContractStatus.DRAFT,
        contractNumber: tempContractNumber,
        driverId: tempDrvId,
        vehicleId: tempVehId,
        startDate: '2026-10-19',
        rentalAmount: 650,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        billingDueDayOfWeek: 1,
        securityDepositAmount: 1000,
        franchiseKm: 1000,
        excessKmRate: 0.50,
        templateId,
        notes: 'Fixture temporária descartável para validação de ciclo de vida',
      }),
    });
    assert.equal(tempCreateRes.status, 201, `Criação em DRAFT deve responder 201, obtido: ${tempCreateRes.status}`);
    const tempContract = ((await tempCreateRes.json()) as { item: any }).item;
    console.log(`  ✓ Fixture criada com sucesso: ID ${tempContract.id}, Número ${tempContract.contractNumber}`);

    // 4. Visualizar detalhes da fixture (GET /api/contracts/:id)
    console.log('\n[4/7] Visualizando detalhes da fixture (GET /api/contracts/:id)...');
    const getTempRes = await fetch(`${base}/api/contracts/${tempContract.id}`);
    assert.equal(getTempRes.status, 200, 'GET /api/contracts/:id deve responder 200');
    const fetchedTemp = ((await getTempRes.json()) as { item: any }).item;
    assert.equal(fetchedTemp.id, tempContract.id);
    console.log(`  ✓ Fixture recuperada: Aluguel R$ ${fetchedTemp.rentalAmount}, Status: ${fetchedTemp.status}`);

    // 5. Editar fixture como Marcos (PATCH /api/contracts/:id) alterando aluguel e notas
    console.log('\n[5/7] Editando fixture via PATCH (reajuste R$ 650 -> R$ 700)...');
    const patchTempRes = await fetch(`${base}/api/contracts/${tempContract.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rentalAmount: 700,
        notes: 'Fixture atualizada pelo Marcos via PATCH com valor reajustado',
      }),
    });
    assert.equal(patchTempRes.status, 200, 'PATCH /api/contracts/:id deve responder 200');
    const patchedTemp = ((await patchTempRes.json()) as { item: any }).item;
    assert.equal(patchedTemp.rentalAmount, 700);
    console.log(`  ✓ Fixture atualizada: Novo aluguel R$ ${patchedTemp.rentalAmount}`);

    // 6. Verificar logs de auditoria no Neon para a fixture criada e editada
    console.log('\n[6/7] Verificando logs de auditoria no Neon para a fixture...');
    const auditRes: any = await db.execute(sql`
      SELECT id, action, entity_type, entity_id, user_id, timestamp
      FROM audit_logs
      WHERE company_id = ${companyId} AND entity_id = ${tempContract.id}
      ORDER BY timestamp DESC
    `);
    console.log(`  ✓ Registros de auditoria encontrados para a fixture: ${auditRes.rows.length}`);
    for (const log of auditRes.rows) {
      console.log(`    - Ação: ${log.action}, Usuário: ${log.user_id}, Data: ${log.timestamp}`);
    }
    assert(auditRes.rows.some((r: any) => r.action === 'CREATE' && r.user_id === marcosUserId), 'Audit log deve conter CREATE por Marcos');
    assert(auditRes.rows.some((r: any) => r.action === 'UPDATE' && r.user_id === marcosUserId), 'Audit log deve conter UPDATE por Marcos');

    // 7. Testar arquivamento sem perda de dados (soft-archive) e teardown seguro
    console.log('\n[7/7] Testando arquivamento da fixture (POST /api/contracts/:id/archive)...');
    const archiveRes = await fetch(`${base}/api/contracts/${tempContract.id}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Arquivamento de teste automatizado' }),
    });
    assert.equal(archiveRes.status, 200, 'POST /api/contracts/:id/archive deve responder 200');

    // Conferir que saiu da listagem ativa
    const listAfterRes = await fetch(`${base}/api/contracts`);
    const listAfterData = (await listAfterRes.json()) as { items: any[] };
    assert(!listAfterData.items.some((c: any) => c.id === tempContract.id), 'Contrato arquivado NÃO deve aparecer na listagem ativa');
    console.log('  ✓ Fixture arquivada removida da listagem ativa');

    // Conferir no banco Neon que a linha NÃO foi apagada no produto (soft-archive via UPDATE)
    const dbCheck: any = await db.execute(sql`
      SELECT id, contract_number, status, is_archived FROM contracts WHERE id = ${tempContract.id}
    `);
    assert.equal(dbCheck.rows.length, 1, 'Linha da fixture DEVE existir no banco após arquivamento');
    assert.equal(dbCheck.rows[0].is_archived, true, 'is_archived deve ser true');
    assert.equal(dbCheck.rows[0].status, ContractStatus.ARCHIVED, 'status deve ser ARCHIVED');
    console.log('  ✓ Prova de soft-archive no Neon: linha preservada com is_archived = true e status ARCHIVED');

    // TEARDOWN ESTREITO E RESTRITO (PH-062):
    // Limpar EXCLUSIVAMENTE a fixture temporária descartável (com filtro restrito de prefixo)
    console.log(`\nLimpeza de teardown: removendo exclusivamente fixture descartável ${tempContractNumber}...`);
    await db.execute(sql`DELETE FROM contracts WHERE id = ${tempContract.id} AND contract_number LIKE 'CTR-VERIFY-TMP-%'`);
    await db.execute(sql`DELETE FROM drivers WHERE id = ${tempDrvId}`);
    await db.execute(sql`DELETE FROM vehicles WHERE id = ${tempVehId}`);

    // CONFERÊNCIA SAGRADA FINAL (INVARIANTE ANTI-REGRESSÃO PH-062):
    // O contrato piloto CTR-MARCOS-PILOTO-01 NUNCA PODE TER SIDO DELETADO NEM ALTERADO EM SEU ID
    const pilotFinalCheck: any = await db.execute(sql`
      SELECT id, contract_number, status, rental_amount FROM contracts WHERE id = ${pilotContract.id}
    `);
    assert.equal(pilotFinalCheck.rows.length, 1, 'CONTRATO PILOTO DO MARCOS DEVE CONTINUAR EXISTINDO NO BANCO COM O MESMO ID');
    assert.equal(pilotFinalCheck.rows[0].contract_number, 'CTR-MARCOS-PILOTO-01');
    assert.equal(pilotFinalCheck.rows[0].id, pilotContract.id, 'ID do contrato piloto não pode ter mudado');
    console.log(`  ✓ CONFERÊNCIA INVARIANTE: CTR-MARCOS-PILOTO-01 (ID: ${pilotContract.id}) 100% INTACTO NO BANCO NEON`);

    console.log('\n=======================================================');
    console.log('=== AUDITORIA REAL DE CONTRATOS DO MARCOS: 100% SUCESSO ===');
    console.log(`=== Contrato Piloto Permanente do Marcos Mantido: ID ${pilotContract.id} ===`);
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
