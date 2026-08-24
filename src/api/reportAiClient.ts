export type ReportAiStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';
export type ReportAiScalar = string | number | boolean | null;
export type ReportAiSensitivity = 'GENERAL' | 'FINANCIAL' | 'CONTRACTUAL';

export interface ReportAiProvenance {
  kind: 'POSTGRES' | 'DOCUMENT_AI_APPROVED';
  entityType: string;
  entityId: string;
  observedAt: string;
  confidence: number | null;
  reviewedAt: string | null;
}

export interface ReportAiSuggestedField {
  field: string;
  value: ReportAiScalar;
  confidence: number | null;
  sensitivity: ReportAiSensitivity;
  requiresServerRevalidation: boolean;
  provenance: ReportAiProvenance[];
}

export interface ReportAiSuggestion {
  id: string;
  companyId: string;
  targetType: string;
  targetId: string | null;
  decision: 'HUMAN_CONFIRMATION_REQUIRED';
  suggestedFields: ReportAiSuggestedField[];
  missingFields: string[];
  warnings: Array<{ field: string; code: 'AMBIGUOUS_SOURCE' }>;
}

export interface ReportAiSuggestionRecord {
  id: string;
  companyId: string;
  targetType: string;
  targetId: string | null;
  status: ReportAiStatus;
  suggestion: ReportAiSuggestion;
  payloadHash: string;
  review: Record<string, unknown> | null;
  reviewHash: string | null;
  createdBy: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface ReportAiReviewInput {
  decision: 'CONFIRM' | 'REJECT';
  corrections?: Record<string, ReportAiScalar>;
  notes?: string;
}

type JsonRecord = Record<string, unknown>;

const STATUSES = new Set<ReportAiStatus>(['PENDING_REVIEW', 'CONFIRMED', 'REJECTED']);
const SENSITIVITIES = new Set<ReportAiSensitivity>(['GENERAL', 'FINANCIAL', 'CONTRACTUAL']);
const HASH = /^[a-f0-9]{64}$/;

function invalid(): never {
  throw new Error('Resposta inválida do preenchimento assistido.');
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as JsonRecord;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') invalid();
  return value;
}

function scalar(value: unknown): ReportAiScalar {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return invalid();
}

function parseProvenance(value: unknown): ReportAiProvenance {
  const item = asRecord(value);
  if (
    (item.kind !== 'POSTGRES' && item.kind !== 'DOCUMENT_AI_APPROVED') ||
    typeof item.entityType !== 'string' ||
    typeof item.entityId !== 'string' ||
    typeof item.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(item.observedAt)) ||
    (item.confidence !== null && (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1))
  ) invalid();
  const reviewedAt = nullableString(item.reviewedAt);
  if (reviewedAt !== null && !Number.isFinite(Date.parse(reviewedAt))) invalid();
  return {
    kind: item.kind,
    entityType: item.entityType,
    entityId: item.entityId,
    observedAt: item.observedAt,
    confidence: item.confidence as number | null,
    reviewedAt,
  };
}

function parseSuggestedField(value: unknown): ReportAiSuggestedField {
  const item = asRecord(value);
  if (
    typeof item.field !== 'string' ||
    typeof item.sensitivity !== 'string' ||
    !SENSITIVITIES.has(item.sensitivity as ReportAiSensitivity) ||
    typeof item.requiresServerRevalidation !== 'boolean' ||
    !Array.isArray(item.provenance)
  ) invalid();
  const confidence = item.confidence;
  if (confidence !== null && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) invalid();
  return {
    field: item.field,
    value: scalar(item.value),
    confidence: confidence as number | null,
    sensitivity: item.sensitivity as ReportAiSensitivity,
    requiresServerRevalidation: item.requiresServerRevalidation,
    provenance: item.provenance.map(parseProvenance),
  };
}

function parseSuggestion(value: unknown): ReportAiSuggestion {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.targetType !== 'string' ||
    item.decision !== 'HUMAN_CONFIRMATION_REQUIRED' ||
    !Array.isArray(item.suggestedFields) ||
    !Array.isArray(item.missingFields) ||
    !item.missingFields.every((field) => typeof field === 'string') ||
    !Array.isArray(item.warnings)
  ) invalid();
  const targetId = nullableString(item.targetId);
  const warnings = item.warnings.map((warning) => {
    const parsed = asRecord(warning);
    if (typeof parsed.field !== 'string' || parsed.code !== 'AMBIGUOUS_SOURCE') invalid();
    return { field: parsed.field, code: parsed.code } as const;
  });
  return {
    id: item.id,
    companyId: item.companyId,
    targetType: item.targetType,
    targetId,
    decision: item.decision,
    suggestedFields: item.suggestedFields.map(parseSuggestedField),
    missingFields: item.missingFields as string[],
    warnings,
  };
}

export function parseReportAiSuggestionRecord(value: unknown): ReportAiSuggestionRecord {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.targetType !== 'string' ||
    typeof item.status !== 'string' ||
    !STATUSES.has(item.status as ReportAiStatus) ||
    typeof item.payloadHash !== 'string' ||
    !HASH.test(item.payloadHash) ||
    typeof item.createdBy !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) invalid();
  const suggestion = parseSuggestion(item.suggestion);
  if (suggestion.id !== item.id || suggestion.companyId !== item.companyId || suggestion.targetType !== item.targetType) invalid();
  const targetId = nullableString(item.targetId);
  if (targetId !== suggestion.targetId) invalid();
  const reviewHash = nullableString(item.reviewHash);
  if (reviewHash !== null && !HASH.test(reviewHash)) invalid();
  return {
    id: item.id,
    companyId: item.companyId,
    targetType: item.targetType,
    targetId,
    status: item.status as ReportAiStatus,
    suggestion,
    payloadHash: item.payloadHash,
    review: item.review === null || item.review === undefined ? null : asRecord(item.review),
    reviewHash,
    createdBy: item.createdBy,
    reviewedBy: nullableString(item.reviewedBy),
    reviewNotes: nullableString(item.reviewNotes),
    createdAt: item.createdAt,
    reviewedAt: nullableString(item.reviewedAt),
    updatedAt: item.updatedAt,
  };
}

async function errorFrom(response: Response): Promise<Error> {
  let message = `Falha no preenchimento assistido (${response.status}).`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Keep the status-only error for non-JSON failures.
  }
  return new Error(message);
}

export class ReportAiClient {
  static async createDriverSummary(driverId: string): Promise<{ item: ReportAiSuggestionRecord; created: boolean }> {
    const response = await fetch('/api/report-ai/suggestions/driver-summary', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId }),
    });
    if (!response.ok) throw await errorFrom(response);
    const payload = asRecord(await response.json());
    if (typeof payload.created !== 'boolean') invalid();
    return { item: parseReportAiSuggestionRecord(payload.item), created: payload.created };
  }

  static async list(status?: ReportAiStatus): Promise<ReportAiSuggestionRecord[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/report-ai/suggestions${suffix}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await errorFrom(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) invalid();
    return payload.items.map(parseReportAiSuggestionRecord);
  }

  static async review(id: string, input: ReportAiReviewInput): Promise<ReportAiSuggestionRecord> {
    const response = await fetch(`/api/report-ai/suggestions/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: input.decision,
        corrections: input.corrections || {},
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      }),
    });
    if (!response.ok) throw await errorFrom(response);
    return parseReportAiSuggestionRecord(asRecord(await response.json()).item);
  }
}
