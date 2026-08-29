import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import { syncDriverDocumentIntakeWorkerResult } from './driverDocumentIntakeAiWorkerSync';
import {
  DocumentAiProcessingError,
  processDocumentAiBytes,
  type DocumentAiProvider,
  type DocumentAiProposal,
} from './documentAiProcessor';

export const DOCUMENT_AI_MAX_ATTEMPTS = 3;

const SYSTEM_USER_ID = 'SYSTEM_DOC_AI';
const SYSTEM_USER_NAME = 'AutoERP Document AI Worker';

type QueryResult = { rows?: unknown[] } | unknown[];

function rows(result: QueryResult): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
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

interface ClaimedExtraction {
  id: string;
  attachmentId: string;
  attachmentChecksum: string;
  storageKey: string;
  mimeType: string;
}

export interface DocumentAiAttachmentReader {
  read(companyId: string, storageKey: string): Promise<Uint8Array>;
}

export type DocumentAiQueueResult =
  | { id: string; status: 'REVIEW_REQUIRED' }
  | { id: string; status: 'FAILED'; failureCode: string }
  | null;

async function claim(companyId: string, claimedBy: string): Promise<ClaimedExtraction | null> {
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
                attachment.mime_type
    `);
    const item = rows(result)[0];
    if (!item) return null;
    return {
      id: requiredString(item.id, 'extraction id'),
      attachmentId: requiredString(item.attachment_id, 'attachment id'),
      attachmentChecksum: requiredString(item.attachment_checksum, 'attachment checksum'),
      storageKey: requiredString(item.storage_key, 'storage key'),
      mimeType: requiredString(item.mime_type, 'mime type'),
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

    await syncDriverDocumentIntakeWorkerResult(context, {
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

    await syncDriverDocumentIntakeWorkerResult(context, {
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
  static async processNextForTenant(
    companyId: string,
    worker: string,
    provider: DocumentAiProvider,
    reader: DocumentAiAttachmentReader,
  ): Promise<DocumentAiQueueResult> {
    const claimedBy = workerId(worker);
    const item = await claim(companyId, claimedBy);
    if (!item) return null;
    try {
      const content = await reader.read(companyId, item.storageKey);
      const proposal = await processDocumentAiBytes(provider, {
        content,
        mimeType: item.mimeType,
        expectedChecksum: item.attachmentChecksum,
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
