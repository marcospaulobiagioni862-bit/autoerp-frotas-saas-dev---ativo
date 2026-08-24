import assert from 'node:assert/strict';
import {
  ReportAiSuggestionError,
  buildReportAiSuggestion,
  type ReportAiCandidate,
} from '../reportAiSuggestion';

const companyId = 'tenant-report-ai-a';
const observedAt = '2026-08-24T20:00:00.000Z';
const reviewedAt = '2026-08-24T20:05:00.000Z';

function candidate(overrides: Partial<ReportAiCandidate> = {}): ReportAiCandidate {
  return {
    companyId,
    field: 'driverName',
    value: 'Motorista Sintético',
    sensitivity: 'GENERAL',
    source: {
      kind: 'POSTGRES',
      entityType: 'Driver',
      entityId: 'driver-synthetic-1',
      observedAt,
      confidence: null,
      reviewedAt: null,
    },
    ...overrides,
  };
}

function expectControlledFailure(run: () => unknown, code: string): void {
  assert.throws(run, (error: unknown) =>
    error instanceof ReportAiSuggestionError && error.code === code,
  );
}

const input = {
  companyId,
  targetType: 'OPERATIONAL_REPORT',
  targetId: 'report-draft-synthetic-1',
  allowedFields: ['driverName', 'plate', 'amount', 'notes'],
  requiredFields: ['driverName', 'plate', 'amount', 'notes'],
  candidates: [
    candidate(),
    candidate({
      field: 'plate',
      value: 'ABC1D23',
      source: {
        kind: 'DOCUMENT_AI_APPROVED',
        entityType: 'DocumentAiExtraction',
        entityId: 'extraction-synthetic-1',
        observedAt,
        confidence: 0.93,
        reviewedAt,
      },
    }),
    candidate({
      field: 'amount',
      value: 125.5,
      sensitivity: 'FINANCIAL',
      source: {
        kind: 'POSTGRES',
        entityType: 'Receivable',
        entityId: 'receivable-synthetic-1',
        observedAt,
        confidence: null,
        reviewedAt: null,
      },
    }),
  ],
} as const;

const first = buildReportAiSuggestion(input);
const replay = buildReportAiSuggestion(input);

assert.equal(first.id, replay.id, 'same trusted context must generate the same suggestion id');
assert.equal(first.decision, 'HUMAN_CONFIRMATION_REQUIRED');
assert.equal(first.suggestedFields.length, 3);
assert.deepEqual(first.missingFields, ['notes'], 'missing values must remain explicitly missing');
assert.equal(first.warnings.length, 0);

const plate = first.suggestedFields.find((field) => field.field === 'plate');
assert.ok(plate, 'approved document field missing');
assert.equal(plate.confidence, 0.93);
assert.equal(plate.provenance[0].kind, 'DOCUMENT_AI_APPROVED');
assert.equal(plate.provenance[0].reviewedAt, reviewedAt);

const amount = first.suggestedFields.find((field) => field.field === 'amount');
assert.ok(amount, 'financial field missing');
assert.equal(amount.requiresServerRevalidation, true);
assert.equal(amount.sensitivity, 'FINANCIAL');

const ambiguous = buildReportAiSuggestion({
  ...input,
  candidates: [
    candidate(),
    candidate({ field: 'plate', value: 'ABC1D23' }),
    candidate({
      field: 'plate',
      value: 'DEF4G56',
      source: {
        kind: 'POSTGRES',
        entityType: 'Vehicle',
        entityId: 'vehicle-synthetic-2',
        observedAt,
        confidence: null,
        reviewedAt: null,
      },
    }),
  ],
});
assert.equal(
  ambiguous.suggestedFields.some((field) => field.field === 'plate'),
  false,
  'conflicting values must never be selected silently',
);
assert.deepEqual(ambiguous.warnings, [{ field: 'plate', code: 'AMBIGUOUS_SOURCE' }]);
assert.ok(ambiguous.missingFields.includes('plate'));

expectControlledFailure(() => buildReportAiSuggestion({
  ...input,
  candidates: [candidate({ companyId: 'tenant-report-ai-b' })],
}), 'CROSS_TENANT_SOURCE');

expectControlledFailure(() => buildReportAiSuggestion({
  ...input,
  candidates: [candidate({
    field: 'plate',
    value: 'ABC1D23',
    source: {
      kind: 'DOCUMENT_AI_APPROVED',
      entityType: 'DocumentAiExtraction',
      entityId: 'extraction-not-reviewed',
      observedAt,
      confidence: 0.8,
      reviewedAt: null,
    },
  })],
}), 'UNAPPROVED_DOCUMENT_SOURCE');

expectControlledFailure(() => buildReportAiSuggestion({
  ...input,
  candidates: [candidate({ field: 'serverOnlyField' })],
}), 'SOURCE_FIELD_NOT_ALLOWED');

expectControlledFailure(() => buildReportAiSuggestion({
  ...input,
  requiredFields: ['fieldOutsideAllowlist'],
}), 'INVALID_INPUT');

console.log('REPORT-AI-1A suggestion foundation: PASS');
