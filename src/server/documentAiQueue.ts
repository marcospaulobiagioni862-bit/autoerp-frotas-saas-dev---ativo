import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import { syncDriverDocumentIntakeWorkerResult } from './driverDocumentIntakeAiWorkerSync';
import { syncVehicleDocumentIntakeWorkerResult } from './vehicleDocumentIntakeAiWorkerSync';
import { syncTrafficTicketDocumentIntakeWorkerResult } from './trafficTicketDocumentIntakeAiWorkerSync';
import {
  DocumentAiProcessingError,
  processDocumentAiBytes,
  type DocumentAiDocumentType,
  type DocumentAiProvider,
  type DocumentAiProposal,
} from './documentAiProcessor';

export const DOCUMENT_AI_MAX_ATTEMPTS = 3;
export const DOCUMENT_AI_STALE_PROCESSING_MS = 180_000;
export const DOCUMENT_AI_STALE_PENDING_MS = 300_000;

const SYSTEM_USER_ID = 'SYSTEM_DOC_AI';
const SYSTEM_USER_NAME = 'AutoERP Document AI Worker';

const DOCUMENT_AI_TYPES = new Set<DocumentAiDocumentType>([
  'CNH','CRLV','CRV','ATPV_E','IPVA','LICENCIAMENTO','VISTORIA','LAUDO',
  'TRAFFIC_TICKET','INVOICE','RECEIPT','CONTRACT','INSURANCE','MAINTENANCE','TRACKER',
]);

function expectedDocumentType(value: string | null): DocumentAiDocumentType | undefined {
  return value && DOCUMENT_AI_TYPES.has(value as DocumentAiDocumentType)
    ? value as DocumentAiDocumentType
    : undefined;
}

type QueryResult = { rows?: unknown[] } | unknown[];

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

// PH-071. A sincronizacao do registro de intake NAO pode derrubar a transacao que
// grava o estado da extracao. Em 16/10/2026 uma unica extracao de multa cujo sync
// lancava INTAKE_STATE_MISMATCH desfez o proprio claim por rollback: a linha voltava
// para PENDING com attempt_count = 0, sem failure_code e sem rastro, e como o claim
// pega a mais antiga primeiro (ORDER BY created_at), essa mesma linha era escolhida
// de novo a cada ciclo. Resultado: a fila inteira de Document AI parou por 4 dias,
// para todo tipo de documento e todo tenant, e a tela ficou eternamente em 50%.
// Agora a falha de sync e registrada e engolida: a extracao chega a um estado
// terminal visivel (FAILED com failure_code) e a fila anda.
async function syncDocumentIntakeWorkerResult(
  context: any,
  input: { companyId: string; extractionId: string; attachmentId: string; targetStatus: 'REVIEW_REQUIRED' | 'FAILED'; now: string; failureCode?: string },
): Promise<void> {
  try {
    const driverHandled = await syncDriverDocumentIntakeWorkerResult(context, input);
    if (!driverHandled) {
      const vehicleHandled = await syncVehicleDocumentIntakeWorkerResult(context, input);
      if (!vehicleHandled) {
        await syncTrafficTicketDocumentIntakeWorkerResult(context, input);
      }
    }
  } catch (error) {
    console.error(
      'AUTOERP_DOCUMENT_AI_INTAKE_SYNC_FAILURE',
      JSON.stringify({
        extractionId: input.extractionId,
        attachmentId: input.attachmentId,
        targetStatus: input.targetStatus,
        reason: error instanceof Error ? error.message : 'UNKNOWN',
      }),
    );
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function workerId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error('Invalid document AI worker id');
  }
  return normalized;
}

function optionalExtractionId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error('Invalid document AI extraction id');
  }
  return normalized;
}

interface ClaimedExtraction {
  id: string;
  attachmentId: string;
  attachmentChecksum: string;
  storageKey: string;
  mimeType: string;
  documentType: string | null;
}

export interface DocumentAiAttachmentReader {
  read(companyId: string, storageKey: string): Promise<Uint8Array>;
}

export type DocumentAiQueueResult =
  | { id: string; status: 'REVIEW_REQUIRED' }
  | { id: string; status: 'FAILED'; failureCode: string }
  | null;

async function recoverStaleProcessing(companyId: string): Promise<{ requeuedCount: number; failedCount: number }> {
  return await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction?.();
    if (!tx) throw new Error('Document AI persistence unavailable');

    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - DOCUMENT_AI_STALE_PROCESSING_MS).toISOString();

    const requeuedResult = await tx.execute(sql`
      UPDATE document_ai_extractions
      SET status = 'PENDING',
          worker_id = NULL,
          processing_started_at = NULL,
          failure_code = NULL,
          updated_at = ${now}
      WHERE company_id = ${companyId}
        AND status = 'PROCESSING'
        AND COALESCE(processing_started_at, updated_at, created_at) < ${staleBefore}
        AND attempt_count < ${DOCUMENT_AI_MAX_ATTEMPTS}
      RETURNING id
    `);

    const requeuedItems = rows(requeuedResult);
    for (const item of requeuedItems) {
      const extractionId = requiredString(item.id, 'extraction id');
      await context.getAuditLogRepo().create({
        id: randomUUID(),
        companyId,
        entityName: 'DocumentAiExtraction',
        entityId: extractionId,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({ status: 'PROCESSING' }),
        newState: JSON.stringify({
          event: 'AI_EXTRACTION_STALE_REQUEUED',
          status: 'PENDING',
          businessMutationApplied: false,
        }),
        userId: SYSTEM_USER_ID,
        userName: SYSTEM_USER_NAME,
        timestamp: now,
      });
    }

    const failedResult = await tx.execute(sql`
      UPDATE document_ai_extractions
      SET status = 'FAILED',
          worker_id = NULL,
          processing_started_at = NULL,
          failure_code = 'PROVIDER_TIMEOUT',
          raw_extraction = '{}'::jsonb,
          proposed_fields = '{}'::jsonb,
          field_confidence = '{}'::jsonb,
          completed_at = ${now},
          updated_at = ${now}
      WHERE company_id = ${companyId}
        AND status = 'PROCESSING'
        AND COALESCE(processing_started_at, updated_at, created_at) < ${staleBefore}
        AND attempt_count >= ${DOCUMENT_AI_MAX_ATTEMPTS}
      RETURNING id, attachment_id
    `);

    const failedItems = rows(failedResult);
    for (const item of failedItems) {
      const extractionId = requiredString(item.id, 'extraction id');
      const attachmentId = requiredString(item.attachment_id, 'attachment id');
      console.error(
        'AUTOERP_DOCUMENT_AI_STALE_PROCESSING_DETECTED',
        JSON.stringify({ companyId, extractionId, failureCode: 'PROVIDER_TIMEOUT' }),
      );
      await syncDocumentIntakeWorkerResult(context, {
        companyId,
        extractionId,
        attachmentId,
        targetStatus: 'FAILED',
        failureCode: 'PROVIDER_TIMEOUT',
        now,
      });
      await context.getAuditLogRepo().create({
        id: randomUUID(),
        companyId,
        entityName: 'DocumentAiExtraction',
        entityId: extractionId,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({ status: 'PROCESSING' }),
        newState: JSON.stringify({
          event: 'AI_EXTRACTION_STALE_FAILED',
          status: 'FAILED',
          failureCode: 'PROVIDER_TIMEOUT',
          businessMutationApplied: false,
        }),
        userId: SYSTEM_USER_ID,
        userName: SYSTEM_USER_NAME,
        timestamp: now,
      });
    }

    return { requeuedCount: requeuedItems.length, failedCount: failedItems.length };
  });
}

async function recoverStalePending(companyId: string): Promise<number> {
  return await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction?.();
    if (!tx) throw new Error('Document AI persistence unavailable');

    const now = new Date().toISOString();
    const staleBeforePending = new Date(Date.now() - DOCUMENT_AI_STALE_PENDING_MS).toISOString();

    const failedResult = await tx.execute(sql`
      UPDATE document_ai_extractions
      SET status = 'FAILED',
          worker_id = NULL,
          processing_started_at = NULL,
          failure_code = 'EXTRACTION_STALLED_PENDING',
          raw_extraction = '{}'::jsonb,
          proposed_fields = '{}'::jsonb,
          field_confidence = '{}'::jsonb,
          completed_at = ${now},
          updated_at = ${now}
      WHERE company_id = ${companyId}
        AND status = 'PENDING'
        AND created_at < ${staleBeforePending}
      RETURNING id, attachment_id
    `);

    const failedItems = rows(failedResult);
    for (const item of failedItems) {
      const extractionId = requiredString(item.id, 'extraction id');
      const attachmentId = requiredString(item.attachment_id, 'attachment id');
      console.error(
        'AUTOERP_DOCUMENT_AI_STALE_PENDING_DETECTED',
        JSON.stringify({ companyId, extractionId, failureCode: 'EXTRACTION_STALLED_PENDING' }),
      );
      await syncDocumentIntakeWorkerResult(context, {
        companyId,
        extractionId,
        attachmentId,
        targetStatus: 'FAILED',
        failureCode: 'EXTRACTION_STALLED_PENDING',
        now,
      });
      await context.getAuditLogRepo().create({
        id: randomUUID(),
        companyId,
        entityName: 'DocumentAiExtraction',
        entityId: extractionId,
        action: AuditAction.UPDATE,
        previousState: JSON.stringify({ status: 'PENDING' }),
        newState: JSON.stringify({
          event: 'AI_EXTRACTION_STALE_PENDING_FAILED',
          status: 'FAILED',
          failureCode: 'EXTRACTION_STALLED_PENDING',
          businessMutationApplied: false,
        }),
        userId: SYSTEM_USER_ID,
        userName: SYSTEM_USER_NAME,
        timestamp: now,
      });
    }

    return failedItems.length;
  });
}

export async function failPendingExtraction(
  companyId: string,
  extractionId: string,
  failureCode: string,
): Promise<boolean> {
  return await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction?.();
    if (!tx) throw new Error('Document AI persistence unavailable');

    const now = new Date().toISOString();
    const result = await tx.execute(sql`
      UPDATE document_ai_extractions
      SET status = 'FAILED',
          worker_id = NULL,
          processing_started_at = NULL,
          failure_code = ${failureCode},
          raw_extraction = '{}'::jsonb,
          proposed_fields = '{}'::jsonb,
          field_confidence = '{}'::jsonb,
          completed_at = ${now},
          updated_at = ${now}
      WHERE company_id = ${companyId}
        AND id = ${extractionId}
        AND status IN ('PENDING', 'PROCESSING')
      RETURNING id, attachment_id, status
    `);

    const items = rows(result);
    if (items.length === 0) return false;

    const item = items[0];
    const attachmentId = requiredString(item.attachment_id, 'attachment id');
    await syncDocumentIntakeWorkerResult(context, {
      companyId,
      extractionId,
      attachmentId,
      targetStatus: 'FAILED',
      failureCode,
      now,
    });
    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId,
      entityName: 'DocumentAiExtraction',
      entityId: extractionId,
      action: AuditAction.UPDATE,
      previousState: JSON.stringify({ status: item.status }),
      newState: JSON.stringify({
        event: 'AI_EXTRACTION_FAIL_DIRECT',
        status: 'FAILED',
        failureCode,
        businessMutationApplied: false,
      }),
      userId: SYSTEM_USER_ID,
      userName: SYSTEM_USER_NAME,
      timestamp: now,
    });
    return true;
  });
}

async function claim(
  companyId: string,
  claimedBy: string,
  expectedExtractionId?: string,
): Promise<ClaimedExtraction | null> {
  const expectedId = optionalExtractionId(expectedExtractionId);
  return await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction?.();
    if (!tx) throw new Error('Document AI persistence unavailable');
    const now = new Date().toISOString();
    const result = await tx.execute(sql`
      WITH candidate AS (
        SELECT extraction.id
        FROM document_ai_extractions extraction
        JOIN file_attachments attachment
          ON attachment.company_id = extraction.company_id
         AND attachment.id = extraction.attachment_id
        WHERE extraction.company_id = ${companyId}
          AND (${expectedId}::text IS NULL OR extraction.id = ${expectedId})
          AND extraction.status = 'PENDING'
          AND extraction.attempt_count < ${DOCUMENT_AI_MAX_ATTEMPTS}
          AND attachment.is_archived = false
          AND attachment.content_state = 'AVAILABLE'
          AND attachment.storage_provider IN ('SERVER_FS', 'R2')
          AND attachment.storage_key IS NOT NULL
        ORDER BY extraction.created_at, extraction.id
        FOR UPDATE OF extraction SKIP LOCKED
        LIMIT 1
      )
      UPDATE document_ai_extractions extraction
      SET status = 'PROCESSING',
          worker_id = ${claimedBy},
          processing_started_at = ${now},
          completed_at = NULL,
          attempt_count = extraction.attempt_count + 1,
          failure_code = NULL,
          updated_at = ${now}
      FROM candidate, file_attachments attachment
      WHERE extraction.id = candidate.id
        AND extraction.company_id = ${companyId}
        AND attachment.company_id = extraction.company_id
        AND attachment.id = extraction.attachment_id
      RETURNING extraction.id,
                extraction.attachment_id,
                extraction.attachment_checksum,
                attachment.storage_key,
                attachment.mime_type,
                attachment.document_type
    `);
    const item = rows(result)[0];
    if (!item) return null;
    return {
      id: requiredString(item.id, 'extraction id'),
      attachmentId: requiredString(item.attachment_id, 'attachment id'),
      attachmentChecksum: requiredString(item.attachment_checksum, 'attachment checksum'),
      storageKey: requiredString(item.storage_key, 'storage key'),
      mimeType: requiredString(item.mime_type, 'mime type'),
      documentType: typeof item.document_type === 'string' && item.document_type.trim() ? item.document_type.trim().toUpperCase() : null,
    };
  });
}

async function complete(
  companyId: string,
  claimedBy: string,
  item: ClaimedExtraction,
  proposal: DocumentAiProposal,
): Promise<void> {
  await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction?.();
    if (!tx) throw new Error('Document AI persistence unavailable');
    const now = new Date().toISOString();
    const result = await tx.execute(sql`
      UPDATE document_ai_extractions
      SET status = 'REVIEW_REQUIRED',
          provider = ${proposal.provider},
          model = ${proposal.model},
          model_version = ${proposal.modelVersion},
          detected_document_type = ${proposal.detectedDocumentType},
          raw_extraction = ${JSON.stringify(proposal.rawExtraction)}::jsonb,
          proposed_fields = ${JSON.stringify(proposal.proposedFields)}::jsonb,
          field_confidence = ${JSON.stringify(proposal.fieldConfidence)}::jsonb,
          failure_code = NULL,
          completed_at = ${now},
          updated_at = ${now}
      WHERE company_id = ${companyId}
        AND id = ${item.id}
        AND status = 'PROCESSING'
        AND worker_id = ${claimedBy}
      RETURNING id
    `);
    if (rows(result).length !== 1) throw new Error('Document AI processing claim lost');

    await syncDocumentIntakeWorkerResult(context, {
      companyId,
      extractionId: item.id,
      attachmentId: item.attachmentId,
      targetStatus: 'REVIEW_REQUIRED',
      now,
    });

    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId,
      entityName: 'DocumentAiExtraction',
      entityId: item.id,
      action: AuditAction.UPDATE,
      previousState: JSON.stringify({ status: 'PROCESSING' }),
      newState: JSON.stringify({
        event: 'AI_EXTRACTION_PROPOSED',
        status: 'REVIEW_REQUIRED',
        attachmentId: item.attachmentId,
        provider: proposal.provider,
        model: proposal.model,
        detectedDocumentType: proposal.detectedDocumentType,
        proposedFieldKeys: Object.keys(proposal.proposedFields).sort(),
        businessMutationApplied: false,
      }),
      userId: SYSTEM_USER_ID,
      userName: SYSTEM_USER_NAME,
      timestamp: now,
    });
  });
}

async function fail(companyId: string, claimedBy: string, item: ClaimedExtraction, failureCode: string): Promise<void> {
  await UnitOfWork.run(companyId, async (context: any) => {
    const tx = context.getRawTransaction?.();
    if (!tx) throw new Error('Document AI persistence unavailable');
    const now = new Date().toISOString();
    const result = await tx.execute(sql`
      UPDATE document_ai_extractions
      SET status = 'FAILED',
          failure_code = ${failureCode},
          raw_extraction = '{}'::jsonb,
          proposed_fields = '{}'::jsonb,
          field_confidence = '{}'::jsonb,
          completed_at = ${now},
          updated_at = ${now}
      WHERE company_id = ${companyId}
        AND id = ${item.id}
        AND status = 'PROCESSING'
        AND worker_id = ${claimedBy}
      RETURNING id
    `);
    if (rows(result).length !== 1) throw new Error('Document AI processing claim lost');

    await syncDocumentIntakeWorkerResult(context, {
      companyId,
      extractionId: item.id,
      attachmentId: item.attachmentId,
      targetStatus: 'FAILED',
      failureCode,
      now,
    });

    await context.getAuditLogRepo().create({
      id: randomUUID(),
      companyId,
      entityName: 'DocumentAiExtraction',
      entityId: item.id,
      action: AuditAction.UPDATE,
      previousState: JSON.stringify({ status: 'PROCESSING' }),
      newState: JSON.stringify({ event: 'AI_EXTRACTION_FAILED', status: 'FAILED', failureCode }),
      userId: SYSTEM_USER_ID,
      userName: SYSTEM_USER_NAME,
      timestamp: now,
    });
  });
}

export class DocumentAiQueueService {
  static async recoverStaleExtractions(companyId: string): Promise<{
    requeuedProcessing: number;
    failedProcessing: number;
    failedPending: number;
  }> {
    const processing = await recoverStaleProcessing(companyId);
    const failedPending = await recoverStalePending(companyId);
    return {
      requeuedProcessing: processing.requeuedCount,
      failedProcessing: processing.failedCount,
      failedPending,
    };
  }

  static async failPendingExtraction(
    companyId: string,
    extractionId: string,
    failureCode: string,
  ): Promise<boolean> {
    return await failPendingExtraction(companyId, extractionId, failureCode);
  }

  static async processNextForTenant(
    companyId: string,
    worker: string,
    provider: DocumentAiProvider,
    reader: DocumentAiAttachmentReader,
    expectedExtractionId?: string,
  ): Promise<DocumentAiQueueResult> {
    const claimedBy = workerId(worker);
    await DocumentAiQueueService.recoverStaleExtractions(companyId);
    const item = await claim(companyId, claimedBy, expectedExtractionId);
    if (!item) return null;
    try {
      const content = await reader.read(companyId, item.storageKey);
      const proposal = await processDocumentAiBytes(provider, {
        content,
        mimeType: item.mimeType,
        expectedChecksum: item.attachmentChecksum,
        expectedDocumentType: expectedDocumentType(item.documentType),
      });
      await complete(companyId, claimedBy, item, proposal);
      return { id: item.id, status: 'REVIEW_REQUIRED' };
    } catch (error) {
      const failureCode = error instanceof DocumentAiProcessingError
        ? error.failureCode
        : 'ATTACHMENT_READ_OR_PROVIDER_FAILURE';
      await fail(companyId, claimedBy, item, failureCode);
      return { id: item.id, status: 'FAILED', failureCode };
    }
  }
}
