import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  DocumentAiQueueService,
  DOCUMENT_AI_STALE_PENDING_MS,
  DOCUMENT_AI_STALE_PROCESSING_MS,
  DOCUMENT_AI_MAX_ATTEMPTS,
} from '../documentAiQueue';
import {
  dispatchDocumentAiExtractionFromEnvironment,
} from '../documentAiRuntime';
import { inspectDocumentAiRuntimeMode } from '../documentAiObservability';

const companyId = 'doc-ai-stalled-test-company';
const bytes = new TextEncoder().encode('stalled queue test doc');
const checksum = createHash('sha256').update(bytes).digest('hex');

async function cleanTestData(): Promise<void> {
  await db.execute(sql`DELETE FROM driver_document_intakes WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM vehicle_document_intakes WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM document_ai_extractions WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM file_attachments WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
}

async function ensureCanonicalTables(): Promise<void> {
  const regCheck: any = await db.execute(sql`SELECT to_regclass('driver_document_intakes') AS tbl`);
  const hasTables = Boolean(regCheck.rows?.[0]?.tbl || regCheck[0]?.tbl);

  if (!hasTables) {
    const client = (db as any).$client;
    if (client && typeof client.exec === 'function') {
      const migrationFiles = readdirSync('drizzle')
        .filter((name) => name.endsWith('.sql'))
        .sort();
      for (const file of migrationFiles) {
        const sqlContent = readFileSync(`drizzle/${file}`, 'utf8');
        await client.exec(sqlContent);
      }
    } else {
      throw new Error(
        'Tabela "driver_document_intakes" não encontrada e a conexão não é PGlite. ' +
        'Este teste requer que as migrações canônicas tenham sido executadas (job integration do CI via migrate_test_db.cjs).'
      );
    }
  }
}

async function seedTestData(): Promise<void> {
  await ensureCanonicalTables();
  await cleanTestData();
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at)
    VALUES (${companyId}, 'Stalled Queue Test Co', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at)
    VALUES ('stalled-test-user', ${companyId}, 'Stalled User', 'stalled@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function runTests(): Promise<void> {
  console.log('--- Starting PH-077 Document AI Stalled Queue Regressions ---');
  await seedTestData();

  // =========================================================================
  // 1. Invariantes de constantes e tempo de corte
  // =========================================================================
  assert.equal(DOCUMENT_AI_MAX_ATTEMPTS, 3, 'Máximo de tentativas deve ser 3');
  assert.equal(DOCUMENT_AI_STALE_PROCESSING_MS, 180_000, 'Stale processing threshold deve ser 180s');
  assert.equal(DOCUMENT_AI_STALE_PENDING_MS, 300_000, 'Stale pending threshold deve ser 300s (5 minutos)');

  // =========================================================================
  // 2. Extração PENDING estagnada vira FAILED (Item b)
  // =========================================================================
  console.log('Testando Item (b): Extração PENDING estagnada vira FAILED');
  const stalePendingTime = new Date(Date.now() - 400_000).toISOString(); // > 5 minutos atrás
  const freshPendingTime = new Date().toISOString();

  await db.execute(sql`
    INSERT INTO file_attachments (
      id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
      size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
    ) VALUES
      ('att-stale-pending', ${companyId}, 'Vehicle', 'Vehicle', 'veh-1', 'CRLV', 'stale.pdf', 'application/pdf', 'attachment://stale', 24, 24, 'SERVER_FS', ${`${companyId}/stale`}, ${checksum}, 'stalled-test-user', false, 'AVAILABLE', NOW()),
      ('att-fresh-pending', ${companyId}, 'Vehicle', 'Vehicle', 'veh-2', 'CRLV', 'fresh.pdf', 'application/pdf', 'attachment://fresh', 24, 24, 'SERVER_FS', ${`${companyId}/fresh`}, ${checksum}, 'stalled-test-user', false, 'AVAILABLE', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO document_ai_extractions (
      id, company_id, attachment_id, attachment_checksum, idempotency_key, status, requested_by, attempt_count, created_at, updated_at
    ) VALUES
      ('ext-stale-pending', ${companyId}, 'att-stale-pending', ${checksum}, 'req-stale-pending', 'PENDING', 'stalled-test-user', 0, ${stalePendingTime}, ${stalePendingTime}),
      ('ext-fresh-pending', ${companyId}, 'att-fresh-pending', ${checksum}, 'req-fresh-pending', 'PENDING', 'stalled-test-user', 0, ${freshPendingTime}, ${freshPendingTime})
    ON CONFLICT (id) DO NOTHING
  `);

  const recoverResult1 = await DocumentAiQueueService.recoverStaleExtractions(companyId);
  assert.equal(recoverResult1.failedPending, 1, 'Exatamente 1 job estagnado em PENDING deve ser recuperado como FAILED');

  const checkStalePendingResult: any = await db.execute(sql`
    SELECT id, status, failure_code FROM document_ai_extractions WHERE company_id = ${companyId} AND id = 'ext-stale-pending'
  `);
  const staleRow = checkStalePendingResult.rows?.[0] ?? checkStalePendingResult[0];
  assert.equal(staleRow.status, 'FAILED', 'Extração PENDING antiga deve virar FAILED');
  assert.equal(staleRow.failure_code, 'EXTRACTION_STALLED_PENDING', 'Failure code deve ser EXTRACTION_STALLED_PENDING');

  const checkFreshPendingResult: any = await db.execute(sql`
    SELECT id, status, failure_code FROM document_ai_extractions WHERE company_id = ${companyId} AND id = 'ext-fresh-pending'
  `);
  const freshRow = checkFreshPendingResult.rows?.[0] ?? checkFreshPendingResult[0];
  assert.equal(freshRow.status, 'PENDING', 'Extração PENDING recente NÃO pode ser alterada');
  assert.equal(freshRow.failure_code, null);

  // =========================================================================
  // 3. Reaper de PROCESSING travado (Item c)
  // =========================================================================
  console.log('Testando Item (c): Reaper de PROCESSING travado');
  const staleProcTime = new Date(Date.now() - 240_000).toISOString(); // > 3 min atrás

  await db.execute(sql`
    INSERT INTO file_attachments (
      id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
      size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
    ) VALUES
      ('att-proc-attempt3', ${companyId}, 'Vehicle', 'Vehicle', 'veh-3', 'CRLV', 'p3.pdf', 'application/pdf', 'attachment://p3', 24, 24, 'SERVER_FS', ${`${companyId}/p3`}, ${checksum}, 'stalled-test-user', false, 'AVAILABLE', NOW()),
      ('att-proc-attempt1', ${companyId}, 'Vehicle', 'Vehicle', 'veh-4', 'CRLV', 'p1.pdf', 'application/pdf', 'attachment://p1', 24, 24, 'SERVER_FS', ${`${companyId}/p1`}, ${checksum}, 'stalled-test-user', false, 'AVAILABLE', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO document_ai_extractions (
      id, company_id, attachment_id, attachment_checksum, idempotency_key, status, requested_by, attempt_count, processing_started_at, created_at, updated_at
    ) VALUES
      ('ext-proc-attempt3', ${companyId}, 'att-proc-attempt3', ${checksum}, 'req-proc-p3', 'PROCESSING', 'stalled-test-user', 3, ${staleProcTime}, ${staleProcTime}, ${staleProcTime}),
      ('ext-proc-attempt1', ${companyId}, 'att-proc-attempt1', ${checksum}, 'req-proc-p1', 'PROCESSING', 'stalled-test-user', 1, ${staleProcTime}, ${staleProcTime}, ${staleProcTime})
    ON CONFLICT (id) DO NOTHING
  `);

  const recoverResult2 = await DocumentAiQueueService.recoverStaleExtractions(companyId);
  assert.equal(recoverResult2.failedProcessing, 1, 'Job com attempt 3 travado deve ir para FAILED');
  assert.equal(recoverResult2.requeuedProcessing, 1, 'Job com attempt 1 travado deve voltar para PENDING');

  const checkProcAttempt3: any = await db.execute(sql`
    SELECT id, status, failure_code FROM document_ai_extractions WHERE company_id = ${companyId} AND id = 'ext-proc-attempt3'
  `);
  const proc3Row = checkProcAttempt3.rows?.[0] ?? checkProcAttempt3[0];
  assert.equal(proc3Row.status, 'FAILED', 'Tentativa 3 travada vira FAILED');
  assert.equal(proc3Row.failure_code, 'PROVIDER_TIMEOUT', 'Failure code deve ser PROVIDER_TIMEOUT');

  const checkProcAttempt1: any = await db.execute(sql`
    SELECT id, status, failure_code, worker_id, processing_started_at FROM document_ai_extractions WHERE company_id = ${companyId} AND id = 'ext-proc-attempt1'
  `);
  const proc1Row = checkProcAttempt1.rows?.[0] ?? checkProcAttempt1[0];
  assert.equal(proc1Row.status, 'PENDING', 'Tentativa 1 travada volta para PENDING');
  assert.equal(proc1Row.worker_id, null, 'Worker ID deve ser limpo');
  assert.equal(proc1Row.processing_started_at, null, 'Processing started at deve ser limpo');

  // =========================================================================
  // 4. Falha rápida no dispatch quando runtime está DISABLED / indisponível (Item a e d)
  // =========================================================================
  console.log('Testando Item (a) e (d): Falha rápida no dispatch quando runtime está desabilitado');
  await db.execute(sql`
    INSERT INTO file_attachments (
      id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
      size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
    ) VALUES
      ('att-dispatch-dis', ${companyId}, 'DriverDocumentIntake', 'DriverDocumentIntake', 'driver-intake-dis', 'CNH', 'cnh.pdf', 'application/pdf', 'attachment://dis', 24, 24, 'SERVER_FS', ${`${companyId}/dis`}, ${checksum}, 'stalled-test-user', false, 'AVAILABLE', NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO driver_document_intakes (
      id, company_id, idempotency_key, created_by, status, attachment_id, expires_at, created_at, updated_at
    ) VALUES
      ('driver-intake-dis', ${companyId}, 'driver-key-dis', 'stalled-test-user', 'EXTRACTING', 'att-dispatch-dis', NOW() + INTERVAL '1 day', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO document_ai_extractions (
      id, company_id, attachment_id, attachment_checksum, idempotency_key, status, requested_by, attempt_count, created_at, updated_at
    ) VALUES
      ('ext-dispatch-dis', ${companyId}, 'att-dispatch-dis', ${checksum}, 'req-dispatch-dis', 'PENDING', 'stalled-test-user', 0, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  const dispatchResult = await dispatchDocumentAiExtractionFromEnvironment(
    companyId,
    'ext-dispatch-dis',
    'worker-test',
    { DOC_AI_WORKER_ENABLED: 'false' },
  );
  assert.deepEqual(dispatchResult, { state: 'DISABLED' }, 'Dispatch com runtime desligado retorna { state: "DISABLED" }');

  const checkDispatchExtraction: any = await db.execute(sql`
    SELECT id, status, failure_code FROM document_ai_extractions WHERE company_id = ${companyId} AND id = 'ext-dispatch-dis'
  `);
  const disExtRow = checkDispatchExtraction.rows?.[0] ?? checkDispatchExtraction[0];
  assert.equal(disExtRow.status, 'FAILED', 'Extração despachada com runtime desabilitado deve falhar imediatamente');
  assert.equal(disExtRow.failure_code, 'RUNTIME_DISABLED', 'Failure code deve ser RUNTIME_DISABLED');

  const checkDriverIntake: any = await db.execute(sql`
    SELECT id, status FROM driver_document_intakes WHERE company_id = ${companyId} AND id = 'driver-intake-dis'
  `);
  const disIntakeRow = checkDriverIntake.rows?.[0] ?? checkDriverIntake[0];
  assert.equal(disIntakeRow.status, 'FAILED', 'Intake do motorista deve ser sincronizado imediatamente para FAILED');

  // =========================================================================
  // 5. Alerta de Runtime (Item d)
  // =========================================================================
  console.log('Testando Item (d): Alerta quando o runtime cair (MISCONFIGURED)');
  const loggedErrors: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args.map(String).join(' '));
    originalConsoleError(...args);
  };

  try {
    const misconfiguredMode = inspectDocumentAiRuntimeMode({
      DOC_AI_WORKER_ENABLED: 'true',
      DOC_AI_PROVIDER: 'INVALID_PROVIDER',
    });
    assert.equal(misconfiguredMode, 'MISCONFIGURED', 'Runtime com provider inválido deve ser MISCONFIGURED');
    const alertFound = loggedErrors.some((log) => log.includes('AUTOERP_DOCUMENT_AI_RUNTIME_ALERT') && log.includes('MISCONFIGURED'));
    assert.ok(alertFound, 'Deve emitir log estruturado AUTOERP_DOCUMENT_AI_RUNTIME_ALERT');
  } finally {
    console.error = originalConsoleError;
  }

  // =========================================================================
  // 6. Verificação de Invariantes Estáticas de Tela (Item a)
  // =========================================================================
  console.log('Testando Item (a): Invariantes estáticas nas telas contra barra infinita');
  const vehicleModalSource = readFileSync(new URL('../../components/fleet/VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8');
  const driverModalSource = readFileSync(new URL('../../components/drivers/DriverCnhIntakeModal.tsx', import.meta.url), 'utf8');
  const ticketModalSource = readFileSync(new URL('../../components/trafficTickets/TrafficTicketDocumentIntakeModal.tsx', import.meta.url), 'utf8');

  // Vehicle modal
  assert.ok(vehicleModalSource.includes('MAX_AI_POLLING_MS'), 'VehicleDocumentIntakeModal deve definir tempo limite de espera');
  assert.ok(vehicleModalSource.includes('EXTRACTION_STALLED_PENDING'), 'VehicleDocumentIntakeModal deve tratar EXTRACTION_STALLED_PENDING');
  assert.ok(vehicleModalSource.includes('RUNTIME_DISABLED'), 'VehicleDocumentIntakeModal deve tratar RUNTIME_DISABLED');
  assert.ok(vehicleModalSource.includes('Leitura por IA indisponível'), 'VehicleDocumentIntakeModal deve informar falha honesta');

  // Driver CNH modal
  assert.ok(driverModalSource.includes('timedOut'), 'DriverCnhIntakeModal deve ter controle de timeout');
  assert.ok(driverModalSource.includes('EXTRACTION_STALLED_PENDING'), 'DriverCnhIntakeModal deve tratar EXTRACTION_STALLED_PENDING');
  assert.ok(driverModalSource.includes('RUNTIME_DISABLED'), 'DriverCnhIntakeModal deve tratar RUNTIME_DISABLED');
  assert.ok(driverModalSource.includes('Leitura por IA indisponível'), 'DriverCnhIntakeModal deve informar falha honesta');

  // Traffic ticket modal
  assert.ok(ticketModalSource.includes('timedOut'), 'TrafficTicketDocumentIntakeModal deve ter controle de timeout');
  assert.ok(ticketModalSource.includes('EXTRACTION_STALLED_PENDING'), 'TrafficTicketDocumentIntakeModal deve tratar EXTRACTION_STALLED_PENDING');
  assert.ok(ticketModalSource.includes('RUNTIME_DISABLED'), 'TrafficTicketDocumentIntakeModal deve tratar RUNTIME_DISABLED');
  assert.ok(ticketModalSource.includes('Leitura por IA indisponível'), 'TrafficTicketDocumentIntakeModal deve informar falha honesta');

  // Cleanup final
  await cleanTestData();
  console.log('--- All PH-077 Document AI Stalled Queue Regressions: PASS ---');
}

runTests().catch((error) => {
  console.error('PH-077 Test Failure:', error);
  process.exit(1);
});
