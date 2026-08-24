import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { auditLogs, documentAiExtractions } from '../../db/schema';
import { UnitOfWork } from '../../db/uow';
import { DocumentAiQueueService } from '../documentAiQueue';
import type { DocumentAiProvider } from '../documentAiProcessor';

const companyA = 'doc-ai-queue-company-a';
const companyB = 'doc-ai-queue-company-b';
const bytes = new TextEncoder().encode('synthetic queue document');
const checksum = createHash('sha256').update(bytes).digest('hex');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const provider: DocumentAiProvider = {
  name: 'SYNTHETIC',
  model: 'queue-fixture',
  modelVersion: '1',
  async extract() {
    return {
      documentType: 'CRLV',
      fields: { plate: 'ABC1D23', renavam: '00123456789' },
      confidence: { plate: 0.99, renavam: 0.8 },
      raw: { text: 'synthetic', pages: 1 },
    };
  },
};

const reader = {
  async read(companyId: string, storageKey: string): Promise<Uint8Array> {
    assert(storageKey.startsWith(`${companyId}/`), 'reader received cross-tenant storage key');
    return bytes;
  },
};

async function seed(): Promise<void> {
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyA}, 'DOC AI Queue A', 'ACTIVE', NOW(), NOW()),
      (${companyB}, 'DOC AI Queue B', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      ('doc-ai-queue-user-a', ${companyA}, 'Queue A', 'queue-a@example.test', 'ADMIN', true, NOW(), NOW()),
      ('doc-ai-queue-user-b', ${companyB}, 'Queue B', 'queue-b@example.test', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO file_attachments (
      id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
      size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
    ) VALUES
      ('queue-att-a1', ${companyA}, 'Vehicle', 'Vehicle', 'queue-veh-a1', 'CRLV', 'a1.pdf', 'application/pdf', 'attachment://a1', 24, 24, 'SERVER_FS', ${`${companyA}/a1`}, ${checksum}, 'doc-ai-queue-user-a', false, 'AVAILABLE', NOW()),
      ('queue-att-a2', ${companyA}, 'Vehicle', 'Vehicle', 'queue-veh-a2', 'CRLV', 'a2.pdf', 'application/pdf', 'attachment://a2', 24, 24, 'SERVER_FS', ${`${companyA}/a2`}, ${checksum}, 'doc-ai-queue-user-a', false, 'AVAILABLE', NOW()),
      ('queue-att-a3', ${companyA}, 'Vehicle', 'Vehicle', 'queue-veh-a3', 'CRLV', 'a3.pdf', 'application/pdf', 'attachment://a3', 24, 24, 'SERVER_FS', ${`${companyA}/a3`}, ${checksum}, 'doc-ai-queue-user-a', false, 'AVAILABLE', NOW()),
      ('queue-att-a4', ${companyA}, 'Vehicle', 'Vehicle', 'queue-veh-a4', 'CRLV', 'a4.pdf', 'application/pdf', 'attachment://a4', 24, 24, 'SERVER_FS', ${`${companyA}/a4`}, ${checksum}, 'doc-ai-queue-user-a', false, 'AVAILABLE', NOW()),
      ('queue-att-b1', ${companyB}, 'Vehicle', 'Vehicle', 'queue-veh-b1', 'CRLV', 'b1.pdf', 'application/pdf', 'attachment://b1', 24, 24, 'SERVER_FS', ${`${companyB}/b1`}, ${checksum}, 'doc-ai-queue-user-b', false, 'AVAILABLE', NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO document_ai_extractions (
      id, company_id, attachment_id, attachment_checksum, idempotency_key, status, requested_by, attempt_count, created_at, updated_at
    ) VALUES
      ('queue-ext-a1', ${companyA}, 'queue-att-a1', ${checksum}, 'queue-request-a1', 'PENDING', 'doc-ai-queue-user-a', 0, NOW(), NOW()),
      ('queue-ext-a2', ${companyA}, 'queue-att-a2', ${checksum}, 'queue-request-a2', 'PENDING', 'doc-ai-queue-user-a', 0, NOW(), NOW()),
      ('queue-ext-a3', ${companyA}, 'queue-att-a3', ${checksum}, 'queue-request-a3', 'PENDING', 'doc-ai-queue-user-a', 0, NOW(), NOW()),
      ('queue-ext-a4', ${companyA}, 'queue-att-a4', ${checksum}, 'queue-request-a4', 'PENDING', 'doc-ai-queue-user-a', 3, NOW(), NOW()),
      ('queue-ext-b1', ${companyB}, 'queue-att-b1', ${checksum}, 'queue-request-b1', 'PENDING', 'doc-ai-queue-user-b', 0, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function run(): Promise<void> {
  await seed();
  const concurrent = await Promise.all([
    DocumentAiQueueService.processNextForTenant(companyA, 'worker-a', provider, reader),
    DocumentAiQueueService.processNextForTenant(companyA, 'worker-b', provider, reader),
  ]);
  assert(concurrent.every((item) => item?.status === 'REVIEW_REQUIRED'), 'concurrent claims must both complete');
  assert(concurrent[0]?.id !== concurrent[1]?.id, 'SKIP LOCKED must not claim the same extraction twice');

  const invalidProvider: DocumentAiProvider = {
    ...provider,
    async extract() { return { toolCall: { name: 'mutateERP' } }; },
  };
  const failed = await DocumentAiQueueService.processNextForTenant(companyA, 'worker-c', invalidProvider, reader);
  assert(failed?.status === 'FAILED' && failed.failureCode === 'PROVIDER_OUTPUT_INVALID', 'invalid output must fail closed');
  assert(await DocumentAiQueueService.processNextForTenant(companyA, 'worker-d', provider, reader) === null, 'tenant A queue must be drained');

  const tenantB = await DocumentAiQueueService.processNextForTenant(companyB, 'worker-b1', provider, reader);
  assert(tenantB?.id === 'queue-ext-b1' && tenantB.status === 'REVIEW_REQUIRED', 'tenant B item not processed independently');

  const rowsA = await UnitOfWork.run(companyA, async (context: any) => {
    const tx = context.getRawTransaction();
    return await tx.select().from(documentAiExtractions).where(eq(documentAiExtractions.companyId, companyA));
  });
  assert(rowsA.filter((item: any) => item.status === 'REVIEW_REQUIRED').length === 2, 'expected two proposals for tenant A');
  assert(rowsA.filter((item: any) => item.status === 'FAILED').length === 1, 'expected one controlled failure for tenant A');
  const processedA = rowsA.filter((item: any) => item.id !== 'queue-ext-a4');
  assert(processedA.every((item: any) => item.attemptCount === 1 && item.workerId), 'processing lifecycle metadata missing');
  const exhausted = rowsA.find((item: any) => item.id === 'queue-ext-a4');
  assert(exhausted?.status === 'PENDING' && exhausted.attemptCount === 3 && !exhausted.workerId, 'max-attempt extraction must not be claimed');

  const audits = await UnitOfWork.run(companyA, async (context: any) => {
    const tx = context.getRawTransaction();
    return await tx.select().from(auditLogs).where(and(
      eq(auditLogs.companyId, companyA),
      eq(auditLogs.entityType, 'DocumentAiExtraction'),
    ));
  });
  assert(audits.length === 3, `expected three queue audits, got ${audits.length}`);
  assert(audits.every((item: any) => !String(item.newState).includes('synthetic queue document')), 'audit must not contain document bytes');

  console.log('DOC-AI-1B queue integration: PASS');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});

