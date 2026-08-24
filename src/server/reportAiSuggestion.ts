import { createHash } from 'node:crypto';

export type ReportAiScalar = string | number | boolean | null;
export type ReportAiSourceKind = 'POSTGRES' | 'DOCUMENT_AI_APPROVED';
export type ReportAiSensitivity = 'GENERAL' | 'FINANCIAL' | 'CONTRACTUAL';

export interface ReportAiProvenance {
  kind: ReportAiSourceKind;
  entityType: string;
  entityId: string;
  observedAt: string;
  confidence: number | null;
  reviewedAt: string | null;
}

export interface ReportAiCandidate {
  companyId: string;
  field: string;
  value: ReportAiScalar;
  sensitivity: ReportAiSensitivity;
  source: ReportAiProvenance;
}

export interface BuildReportAiSuggestionInput {
  companyId: string;
  targetType: string;
  targetId?: string | null;
  allowedFields: readonly string[];
  requiredFields: readonly string[];
  candidates: readonly ReportAiCandidate[];
}

export interface ReportAiSuggestedField {
  field: string;
  value: ReportAiScalar;
  confidence: number | null;
  sensitivity: ReportAiSensitivity;
  requiresServerRevalidation: boolean;
  provenance: ReportAiProvenance[];
}

export interface ReportAiWarning {
  field: string;
  code: 'AMBIGUOUS_SOURCE';
}

export interface ReportAiSuggestion {
  id: string;
  companyId: string;
  targetType: string;
  targetId: string | null;
  decision: 'HUMAN_CONFIRMATION_REQUIRED';
  suggestedFields: ReportAiSuggestedField[];
  missingFields: string[];
  warnings: ReportAiWarning[];
}

export type ReportAiSuggestionFailure =
  | 'INVALID_INPUT'
  | 'CROSS_TENANT_SOURCE'
  | 'UNAPPROVED_DOCUMENT_SOURCE'
  | 'SOURCE_FIELD_NOT_ALLOWED';

export class ReportAiSuggestionError extends Error {
  constructor(public readonly code: ReportAiSuggestionFailure) {
    super(code);
    this.name = 'ReportAiSuggestionError';
  }
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const TARGET_TYPE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SENSITIVITY_RANK: Record<ReportAiSensitivity, number> = {
  GENERAL: 0,
  CONTRACTUAL: 1,
  FINANCIAL: 2,
};

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function validScalar(value: unknown): value is ReportAiScalar {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.length <= 4_000;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortedUniqueFields(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length > 250) {
    throw new ReportAiSuggestionError('INVALID_INPUT');
  }
  const result = [...new Set(values)];
  if (result.some((value) => typeof value !== 'string' || !IDENTIFIER.test(value))) {
    throw new ReportAiSuggestionError('INVALID_INPUT');
  }
  return result.sort();
}

function validateSource(source: ReportAiProvenance): void {
  if (
    !source ||
    (source.kind !== 'POSTGRES' && source.kind !== 'DOCUMENT_AI_APPROVED') ||
    !validId(source.entityType) ||
    !validId(source.entityId) ||
    !validTimestamp(source.observedAt) ||
    (source.confidence !== null && (
      typeof source.confidence !== 'number' ||
      !Number.isFinite(source.confidence) ||
      source.confidence < 0 ||
      source.confidence > 1
    )) ||
    (source.reviewedAt !== null && !validTimestamp(source.reviewedAt))
  ) {
    throw new ReportAiSuggestionError('INVALID_INPUT');
  }
  if (source.kind === 'DOCUMENT_AI_APPROVED' && source.reviewedAt === null) {
    throw new ReportAiSuggestionError('UNAPPROVED_DOCUMENT_SOURCE');
  }
}

function sourceKey(source: ReportAiProvenance): string {
  return [
    source.kind,
    source.entityType,
    source.entityId,
    source.observedAt,
    source.reviewedAt ?? '',
  ].join('|');
}

function copySource(source: ReportAiProvenance): ReportAiProvenance {
  return {
    kind: source.kind,
    entityType: source.entityType,
    entityId: source.entityId,
    observedAt: source.observedAt,
    confidence: source.confidence,
    reviewedAt: source.reviewedAt,
  };
}

export function buildReportAiSuggestion(input: BuildReportAiSuggestionInput): ReportAiSuggestion {
  if (
    !input ||
    !validId(input.companyId) ||
    typeof input.targetType !== 'string' ||
    !TARGET_TYPE.test(input.targetType) ||
    (input.targetId !== undefined && input.targetId !== null && !validId(input.targetId)) ||
    !Array.isArray(input.candidates) ||
    input.candidates.length > 1_000
  ) {
    throw new ReportAiSuggestionError('INVALID_INPUT');
  }

  const allowedFields = sortedUniqueFields(input.allowedFields);
  const requiredFields = sortedUniqueFields(input.requiredFields);
  const allowed = new Set(allowedFields);
  if (requiredFields.some((field) => !allowed.has(field))) {
    throw new ReportAiSuggestionError('INVALID_INPUT');
  }

  const grouped = new Map<string, ReportAiCandidate[]>();
  for (const candidate of input.candidates) {
    if (!candidate || !validId(candidate.companyId) || candidate.companyId !== input.companyId) {
      throw new ReportAiSuggestionError('CROSS_TENANT_SOURCE');
    }
    if (typeof candidate.field !== 'string' || !allowed.has(candidate.field)) {
      throw new ReportAiSuggestionError('SOURCE_FIELD_NOT_ALLOWED');
    }
    if (
      !validScalar(candidate.value) ||
      !['GENERAL', 'FINANCIAL', 'CONTRACTUAL'].includes(candidate.sensitivity)
    ) {
      throw new ReportAiSuggestionError('INVALID_INPUT');
    }
    validateSource(candidate.source);
    const values = grouped.get(candidate.field) ?? [];
    values.push(candidate);
    grouped.set(candidate.field, values);
  }

  const suggestedFields: ReportAiSuggestedField[] = [];
  const warnings: ReportAiWarning[] = [];
  const missing = new Set(requiredFields);

  for (const field of allowedFields) {
    const candidates = grouped.get(field) ?? [];
    if (candidates.length === 0) continue;

    const distinctValues = new Map<string, ReportAiCandidate[]>();
    for (const candidate of candidates) {
      const key = stableJson(candidate.value);
      const values = distinctValues.get(key) ?? [];
      values.push(candidate);
      distinctValues.set(key, values);
    }
    if (distinctValues.size !== 1) {
      warnings.push({ field, code: 'AMBIGUOUS_SOURCE' });
      continue;
    }

    const sameValue = [...distinctValues.values()][0];
    const provenanceByKey = new Map<string, ReportAiProvenance>();
    for (const candidate of sameValue) {
      provenanceByKey.set(sourceKey(candidate.source), copySource(candidate.source));
    }
    const provenance = [...provenanceByKey.values()].sort((left, right) =>
      sourceKey(left).localeCompare(sourceKey(right)),
    );
    const scores = provenance
      .map((source) => source.confidence)
      .filter((score): score is number => score !== null);
    const sensitivity = sameValue.reduce<ReportAiSensitivity>(
      (current, candidate) =>
        SENSITIVITY_RANK[candidate.sensitivity] > SENSITIVITY_RANK[current]
          ? candidate.sensitivity
          : current,
      'GENERAL',
    );

    suggestedFields.push({
      field,
      value: sameValue[0].value,
      confidence: scores.length > 0 ? Math.min(...scores) : null,
      sensitivity,
      requiresServerRevalidation: sensitivity !== 'GENERAL',
      provenance,
    });
    missing.delete(field);
  }

  const targetId = input.targetId ?? null;
  const missingFields = [...missing].sort();
  const canonical = {
    companyId: input.companyId,
    targetType: input.targetType,
    targetId,
    suggestedFields,
    missingFields,
    warnings,
  };
  const id = `rai_${createHash('sha256').update(stableJson(canonical)).digest('hex').slice(0, 32)}`;

  return {
    id,
    companyId: input.companyId,
    targetType: input.targetType,
    targetId,
    decision: 'HUMAN_CONFIRMATION_REQUIRED',
    suggestedFields,
    missingFields,
    warnings,
  };
}
