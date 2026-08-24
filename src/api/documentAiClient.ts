export type DocumentAiStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';

export interface DocumentAiExtraction {
  id: string;
  companyId: string;
  attachmentId: string;
  attachmentChecksum: string;
  status: DocumentAiStatus;
  requestedBy: string;
  attemptCount: number;
  failureCode: string | null;
  provider: string | null;
  model: string | null;
  modelVersion: string | null;
  detectedDocumentType: string | null;
  proposedFields: Record<string, unknown>;
  fieldConfidence: Record<string, unknown>;
  reviewedBy: string | null;
  reviewedAt: string | null;
  corrections: Record<string, unknown> | null;
  reviewNotes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAiReviewInput {
  decision: 'APPROVE' | 'REJECT';
  corrections?: Record<string, unknown>;
  notes?: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Resposta inválida da revisão documental.');
  }
  return value as JsonRecord;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Resposta inválida da revisão documental.');
  return value;
}

const STATUSES = new Set<DocumentAiStatus>([
  'PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'FAILED',
]);

export function parseDocumentAiExtraction(value: unknown): DocumentAiExtraction {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.attachmentId !== 'string' ||
    typeof item.attachmentChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(item.attachmentChecksum) ||
    typeof item.status !== 'string' ||
    !STATUSES.has(item.status as DocumentAiStatus) ||
    typeof item.requestedBy !== 'string' ||
    !Number.isInteger(item.attemptCount) ||
    (item.attemptCount as number) < 0 ||
    (item.attemptCount as number) > 100 ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) {
    throw new Error('Resposta inválida da revisão documental.');
  }

  const proposedFields = asRecord(item.proposedFields);
  const fieldConfidence = asRecord(item.fieldConfidence);
  const corrections = item.corrections === null || item.corrections === undefined
    ? null
    : asRecord(item.corrections);

  return {
    id: item.id,
    companyId: item.companyId,
    attachmentId: item.attachmentId,
    attachmentChecksum: item.attachmentChecksum,
    status: item.status as DocumentAiStatus,
    requestedBy: item.requestedBy,
    attemptCount: item.attemptCount as number,
    failureCode: nullableString(item.failureCode),
    provider: nullableString(item.provider),
    model: nullableString(item.model),
    modelVersion: nullableString(item.modelVersion),
    detectedDocumentType: nullableString(item.detectedDocumentType),
    proposedFields,
    fieldConfidence,
    reviewedBy: nullableString(item.reviewedBy),
    reviewedAt: nullableString(item.reviewedAt),
    corrections,
    reviewNotes: nullableString(item.reviewNotes),
    approvedAt: nullableString(item.approvedAt),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function errorFrom(response: Response): Promise<Error> {
  let message = `Falha na revisão documental (${response.status}).`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve the status-only message for non-JSON failures.
  }
  return new Error(message);
}

export class DocumentAiClient {
  static async list(status?: DocumentAiStatus): Promise<DocumentAiExtraction[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/document-ai/extractions${suffix}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await errorFrom(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Resposta inválida da revisão documental.');
    return payload.items.map(parseDocumentAiExtraction);
  }

  static async retry(id: string): Promise<DocumentAiExtraction> {
    const response = await fetch(`/api/document-ai/extractions/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) throw await errorFrom(response);
    const payload = asRecord(await response.json());
    return parseDocumentAiExtraction(payload.item);
  }

  static async review(id: string, input: DocumentAiReviewInput): Promise<DocumentAiExtraction> {
    const response = await fetch(`/api/document-ai/extractions/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision: input.decision,
        corrections: input.corrections || {},
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      }),
    });
    if (!response.ok) throw await errorFrom(response);
    const payload = asRecord(await response.json());
    return parseDocumentAiExtraction(payload.item);
  }
}
