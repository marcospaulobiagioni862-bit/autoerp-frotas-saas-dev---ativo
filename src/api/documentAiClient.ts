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

export interface DocumentAiCreateInput {
  attachmentId: string;
  idempotencyKey: string;
}

export interface DocumentAiReviewInput {
  decision: 'APPROVE' | 'REJECT';
  corrections?: Record<string, unknown>;
  notes?: string;
}

export type DocumentAiRuntimeMode = 'DISABLED' | 'MISCONFIGURED' | 'READY_SYNTHETIC_ONLY';

export interface DocumentAiAttachmentStatus {
  attachmentId: string;
  status: DocumentAiStatus;
  attemptCount: number;
  failureCode: string | null;
  updatedAt: string;
}


export interface DocumentAiExtractionHistoryItem {
  status: DocumentAiStatus;
  attemptCount: number;
  failureCode: string | null;
  updatedAt: string;
}

export interface DocumentAiObservability {
  runtime: {
    mode: DocumentAiRuntimeMode;
    provider: 'GEMINI' | null;
    syntheticOnly: true;
    automaticExecution: false;
  };
  counts: Record<DocumentAiStatus, number> & { total: number };
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Resposta inválida da revisão documental.');
  }
  return value as JsonRecord;
}

function exactRecord(value: unknown, keys: readonly string[]): JsonRecord {
  const item = asRecord(value);
  const actual = Object.keys(item).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Resposta inválida da observabilidade documental.');
  }
  return item;
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

const OBSERVABILITY_STATUSES: readonly DocumentAiStatus[] = [
  'PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'FAILED',
];

export function parseDocumentAiObservability(value: unknown): DocumentAiObservability {
  const payload = exactRecord(value, ['runtime', 'counts']);
  const runtime = exactRecord(payload.runtime, ['mode', 'provider', 'syntheticOnly', 'automaticExecution']);
  const counts = exactRecord(payload.counts, [...OBSERVABILITY_STATUSES, 'total']);
  const modes: readonly DocumentAiRuntimeMode[] = ['DISABLED', 'MISCONFIGURED', 'READY_SYNTHETIC_ONLY'];
  if (
    typeof runtime.mode !== 'string' ||
    !modes.includes(runtime.mode as DocumentAiRuntimeMode) ||
    runtime.syntheticOnly !== true ||
    runtime.automaticExecution !== false ||
    (runtime.provider !== null && runtime.provider !== 'GEMINI') ||
    (runtime.mode === 'READY_SYNTHETIC_ONLY' ? runtime.provider !== 'GEMINI' : runtime.provider !== null)
  ) {
    throw new Error('Resposta inválida da observabilidade documental.');
  }
  for (const status of OBSERVABILITY_STATUSES) {
    if (!Number.isSafeInteger(counts[status]) || (counts[status] as number) < 0) {
      throw new Error('Resposta inválida da observabilidade documental.');
    }
  }
  if (
    !Number.isSafeInteger(counts.total) ||
    (counts.total as number) < 0 ||
    counts.total !== OBSERVABILITY_STATUSES.reduce((total, status) => total + (counts[status] as number), 0)
  ) {
    throw new Error('Resposta inválida da observabilidade documental.');
  }
  return {
    runtime: {
      mode: runtime.mode as DocumentAiRuntimeMode,
      provider: runtime.provider as 'GEMINI' | null,
      syntheticOnly: true,
      automaticExecution: false,
    },
    counts: {
      PENDING: counts.PENDING as number,
      PROCESSING: counts.PROCESSING as number,
      REVIEW_REQUIRED: counts.REVIEW_REQUIRED as number,
      APPROVED: counts.APPROVED as number,
      REJECTED: counts.REJECTED as number,
      FAILED: counts.FAILED as number,
      total: counts.total as number,
    },
  };
}

export function parseDocumentAiAttachmentStatuses(value: unknown): DocumentAiAttachmentStatus[] {
  const payload = exactRecord(value, ['items']);
  if (!Array.isArray(payload.items)) {
    throw new Error('Resposta inválida do estado documental.');
  }
  const seen = new Set<string>();
  return payload.items.map((value) => {
    const item = exactRecord(value, ['attachmentId', 'status', 'attemptCount', 'failureCode', 'updatedAt']);
    if (
      typeof item.attachmentId !== 'string' ||
      !item.attachmentId ||
      item.attachmentId.length > 120 ||
      seen.has(item.attachmentId) ||
      typeof item.status !== 'string' ||
      !STATUSES.has(item.status as DocumentAiStatus) ||
      !Number.isSafeInteger(item.attemptCount) ||
      (item.attemptCount as number) < 0 ||
      (item.attemptCount as number) > 100 ||
      (item.failureCode !== null && (
        typeof item.failureCode !== 'string' ||
        !/^[A-Z0-9_:-]{1,120}$/.test(item.failureCode)
      )) ||
      typeof item.updatedAt !== 'string' ||
      !item.updatedAt
    ) {
      throw new Error('Resposta inválida do estado documental.');
    }
    seen.add(item.attachmentId);
    return {
      attachmentId: item.attachmentId,
      status: item.status as DocumentAiStatus,
      attemptCount: item.attemptCount as number,
      failureCode: item.failureCode as string | null,
      updatedAt: item.updatedAt,
    };
  });
}


export function parseDocumentAiExtractionHistory(value: unknown): DocumentAiExtractionHistoryItem[] {
  const payload = exactRecord(value, ['items']);
  if (!Array.isArray(payload.items) || payload.items.length > 100) {
    throw new Error('Resposta inválida do histórico documental.');
  }
  return payload.items.map((value) => {
    const item = exactRecord(value, ['status', 'attemptCount', 'failureCode', 'updatedAt']);
    if (
      typeof item.status !== 'string' || !STATUSES.has(item.status as DocumentAiStatus) ||
      !Number.isSafeInteger(item.attemptCount) || (item.attemptCount as number) < 0 || (item.attemptCount as number) > 100 ||
      (item.failureCode !== null && (typeof item.failureCode !== 'string' || !/^[A-Z0-9_:-]{1,120}$/.test(item.failureCode))) ||
      typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))
    ) {
      throw new Error('Resposta inválida do histórico documental.');
    }
    return {
      status: item.status as DocumentAiStatus,
      attemptCount: item.attemptCount as number,
      failureCode: item.failureCode as string | null,
      updatedAt: item.updatedAt,
    };
  });
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
  static async create(input: DocumentAiCreateInput): Promise<DocumentAiExtraction> {
    const response = await fetch('/api/document-ai/extractions', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attachmentId: input.attachmentId,
        idempotencyKey: input.idempotencyKey,
      }),
    });
    if (!response.ok) throw await errorFrom(response);
    const payload = asRecord(await response.json());
    return parseDocumentAiExtraction(payload.item);
  }


  static async attachmentHistory(attachmentId: string): Promise<DocumentAiExtractionHistoryItem[]> {
    if (typeof attachmentId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(attachmentId)) {
      throw new Error('Anexo inválido para histórico documental.');
    }
    const response = await fetch(`/api/document-ai/attachments/${encodeURIComponent(attachmentId)}/history`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await errorFrom(response);
    return parseDocumentAiExtractionHistory(await response.json());
  }

  static async attachmentStatuses(): Promise<DocumentAiAttachmentStatus[]> {
    const response = await fetch('/api/document-ai/attachment-statuses', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await errorFrom(response);
    return parseDocumentAiAttachmentStatuses(await response.json());
  }

  static async observability(): Promise<DocumentAiObservability> {
    const response = await fetch('/api/document-ai/observability', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await errorFrom(response);
    return parseDocumentAiObservability(await response.json());
  }

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
