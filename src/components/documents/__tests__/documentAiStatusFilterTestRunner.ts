import assert from 'node:assert/strict';
import type { DocumentAiAttachmentStatus } from '../../../api/documentAiClient';
import {
  createDocumentAiStatusCounts,
  createDocumentCenterActiveFilters,
  createDocumentCenterResultSummary,
  DOCUMENT_CENTER_DEFAULT_FILTERS,
  getDocumentAiActionRequiredSelection,
  hasActiveDocumentCenterFilters,
  DOCUMENT_AI_STATUS_FILTERS,
  DOCUMENT_AI_STATUS_SORTS,
  matchesDocumentAiStatusFilter,
  resetDocumentCenterFilter,
  sortDocumentAiAttachments,
} from '../documentAiStatusFilter';

const statuses: Record<string, DocumentAiAttachmentStatus> = {
  pending: {
    attachmentId: 'pending',
    status: 'PENDING',
    attemptCount: 0,
    failureCode: null,
    updatedAt: '2026-08-25T20:00:00.000Z',
  },
  failed: {
    attachmentId: 'failed',
    status: 'FAILED',
    attemptCount: 2,
    failureCode: 'PROVIDER_TIMEOUT',
    updatedAt: '2026-08-25T20:01:00.000Z',
  },
  review: {
    attachmentId: 'review',
    status: 'REVIEW_REQUIRED',
    attemptCount: 1,
    failureCode: null,
    updatedAt: '2026-08-25T20:02:00.000Z',
  },
};

assert.deepEqual(DOCUMENT_AI_STATUS_FILTERS, [
  'ALL',
  'NONE',
  'ACTION_REQUIRED',
  'PENDING',
  'PROCESSING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED',
  'FAILED',
]);

assert.equal(matchesDocumentAiStatusFilter('pending', 'ALL', statuses, false), true);
assert.equal(matchesDocumentAiStatusFilter('missing', 'NONE', statuses, false), true);
assert.equal(matchesDocumentAiStatusFilter('pending', 'NONE', statuses, false), false);
assert.equal(matchesDocumentAiStatusFilter('pending', 'PENDING', statuses, false), true);
assert.equal(matchesDocumentAiStatusFilter('pending', 'FAILED', statuses, false), false);
assert.equal(matchesDocumentAiStatusFilter('failed', 'FAILED', statuses, false), true);
assert.equal(matchesDocumentAiStatusFilter('failed', 'ACTION_REQUIRED', statuses, false), true);
assert.equal(matchesDocumentAiStatusFilter('review', 'ACTION_REQUIRED', statuses, false), true);
assert.equal(matchesDocumentAiStatusFilter('pending', 'ACTION_REQUIRED', statuses, false), false);
assert.equal(matchesDocumentAiStatusFilter('missing', 'ACTION_REQUIRED', statuses, false), false);

for (const filter of DOCUMENT_AI_STATUS_FILTERS) {
  assert.equal(
    matchesDocumentAiStatusFilter('missing', filter, statuses, true),
    true,
    'unavailable status data must never hide an attachment',
  );
}

assert.deepEqual(
  createDocumentAiStatusCounts(['pending', 'failed', 'review', 'missing', 'pending'], statuses, false),
  {
    ALL: 4,
    NONE: 1,
    ACTION_REQUIRED: 2,
    PENDING: 1,
    PROCESSING: 0,
    REVIEW_REQUIRED: 1,
    APPROVED: 0,
    REJECTED: 0,
    FAILED: 1,
  },
  'counts must be sanitized, complete and deduplicated',
);

assert.deepEqual(
  createDocumentAiStatusCounts(['pending', 'failed', 'review', 'missing', 'pending'], statuses, true),
  {
    ALL: 4,
    NONE: null,
    ACTION_REQUIRED: null,
    PENDING: null,
    PROCESSING: null,
    REVIEW_REQUIRED: null,
    APPROVED: null,
    REJECTED: null,
    FAILED: null,
  },
  'unavailable status data must never be represented as zero',
);

assert.deepEqual(
  getDocumentAiActionRequiredSelection(false),
  { statusFilter: 'ACTION_REQUIRED', sort: 'REVIEW_PRIORITY' },
  'the action-required shortcut must use only sanitized local selection values',
);
assert.equal(
  getDocumentAiActionRequiredSelection(true),
  null,
  'the action-required shortcut must be unavailable when statuses are unavailable',
);

assert.deepEqual(DOCUMENT_CENTER_DEFAULT_FILTERS, {
  searchTerm: '',
  entityType: 'ALL',
  documentType: 'ALL',
  statusFilter: 'ALL',
  sort: 'ATTACHMENT_NEWEST',
});
assert.equal(hasActiveDocumentCenterFilters(DOCUMENT_CENTER_DEFAULT_FILTERS), false);
assert.deepEqual(
  createDocumentCenterActiveFilters(DOCUMENT_CENTER_DEFAULT_FILTERS),
  [],
  'the safe default state must not invent active filter labels',
);

const allFiltersActive = {
  searchTerm: 'CRLV 2026',
  entityType: 'VEHICLE',
  documentType: 'CRLV',
  statusFilter: 'ACTION_REQUIRED' as const,
  sort: 'REVIEW_PRIORITY' as const,
};
assert.deepEqual(
  createDocumentCenterActiveFilters(allFiltersActive),
  [
    { key: 'searchTerm', label: 'Busca: CRLV 2026' },
    { key: 'entityType', label: 'Módulo: VEHICLE' },
    { key: 'documentType', label: 'Tipo: CRLV' },
    { key: 'statusFilter', label: 'Estado: Ação necessária' },
    { key: 'sort', label: 'Ordenação: Prioridade de triagem' },
  ],
  'active filter summary must preserve deterministic control order and sanitized labels',
);

const filterKeys = ['searchTerm', 'entityType', 'documentType', 'statusFilter', 'sort'] as const;
for (const key of filterKeys) {
  const reset = resetDocumentCenterFilter(allFiltersActive, key);
  assert.equal(reset[key], DOCUMENT_CENTER_DEFAULT_FILTERS[key], `reset must restore only ${key} to its safe default`);
  for (const otherKey of filterKeys) {
    if (otherKey === key) continue;
    assert.equal(reset[otherKey], allFiltersActive[otherKey], `resetting ${key} must preserve ${otherKey}`);
  }
}
assert.deepEqual(
  allFiltersActive,
  {
    searchTerm: 'CRLV 2026',
    entityType: 'VEHICLE',
    documentType: 'CRLV',
    statusFilter: 'ACTION_REQUIRED',
    sort: 'REVIEW_PRIORITY',
  },
  'individual reset must not mutate the current filter state',
);

assert.deepEqual(
  createDocumentCenterResultSummary(4, 4, false),
  { total: 4, visible: 4, filtered: false, filteredEmpty: false },
);
assert.deepEqual(
  createDocumentCenterResultSummary(4, 2, true),
  { total: 4, visible: 2, filtered: true, filteredEmpty: false },
);
assert.deepEqual(
  createDocumentCenterResultSummary(4, 0, true),
  { total: 4, visible: 0, filtered: true, filteredEmpty: true },
);
assert.deepEqual(
  createDocumentCenterResultSummary(0, 0, true),
  { total: 0, visible: 0, filtered: true, filteredEmpty: false },
  'an empty authorized collection must not be misreported as hidden by filters',
);
for (const invalidCounts of [[-1, 0], [1, -1], [1, 2], [1.5, 1]] as const) {
  assert.throws(
    () => createDocumentCenterResultSummary(invalidCounts[0], invalidCounts[1], true),
    /Invalid document result summary/,
  );
}
for (const activeFilters of [
  { ...DOCUMENT_CENTER_DEFAULT_FILTERS, searchTerm: 'CRLV' },
  { ...DOCUMENT_CENTER_DEFAULT_FILTERS, entityType: 'VEHICLE' },
  { ...DOCUMENT_CENTER_DEFAULT_FILTERS, documentType: 'INSURANCE' },
  { ...DOCUMENT_CENTER_DEFAULT_FILTERS, statusFilter: 'ACTION_REQUIRED' as const },
  { ...DOCUMENT_CENTER_DEFAULT_FILTERS, sort: 'REVIEW_PRIORITY' as const },
]) {
  assert.equal(hasActiveDocumentCenterFilters(activeFilters), true, 'each local control must activate clear filters');
  assert.equal(createDocumentCenterActiveFilters(activeFilters).length, 1, 'each changed control must produce exactly one active filter item');
}

assert.deepEqual(DOCUMENT_AI_STATUS_SORTS, [
  'ATTACHMENT_NEWEST',
  'REVIEW_PRIORITY',
  'EXTRACTION_UPDATED_DESC',
  'EXTRACTION_UPDATED_ASC',
]);

const sortableAttachments = [
  { id: 'approved', createdAt: '2026-08-25T20:04:00.000Z' },
  { id: 'new-review', createdAt: '2026-08-25T20:03:00.000Z' },
  { id: 'missing', createdAt: '2026-08-25T20:02:00.000Z' },
  { id: 'failed-sort', createdAt: '2026-08-25T20:01:00.000Z' },
  { id: 'old-review', createdAt: '2026-08-25T20:00:00.000Z' },
];
const sortStatuses: Record<string, DocumentAiAttachmentStatus> = {
  approved: { attachmentId: 'approved', status: 'APPROVED', attemptCount: 1, failureCode: null, updatedAt: '2026-08-25T20:05:00.000Z' },
  'new-review': { attachmentId: 'new-review', status: 'REVIEW_REQUIRED', attemptCount: 1, failureCode: null, updatedAt: '2026-08-25T20:04:00.000Z' },
  'failed-sort': { attachmentId: 'failed-sort', status: 'FAILED', attemptCount: 2, failureCode: 'PROVIDER_TIMEOUT', updatedAt: '2026-08-25T20:03:00.000Z' },
  'old-review': { attachmentId: 'old-review', status: 'REVIEW_REQUIRED', attemptCount: 1, failureCode: null, updatedAt: '2026-08-25T20:01:00.000Z' },
};
const originalOrder = sortableAttachments.map(({ id }) => id);

assert.deepEqual(
  sortDocumentAiAttachments(sortableAttachments, 'ATTACHMENT_NEWEST', sortStatuses).map(({ id }) => id),
  ['approved', 'new-review', 'missing', 'failed-sort', 'old-review'],
  'the default sort must preserve newest attachment first',
);
assert.deepEqual(
  sortDocumentAiAttachments(sortableAttachments, 'REVIEW_PRIORITY', sortStatuses).map(({ id }) => id),
  ['old-review', 'new-review', 'failed-sort', 'missing', 'approved'],
  'review priority must surface actionable states and the oldest item within each priority',
);
assert.deepEqual(
  sortDocumentAiAttachments(sortableAttachments, 'EXTRACTION_UPDATED_DESC', sortStatuses).map(({ id }) => id),
  ['approved', 'new-review', 'failed-sort', 'missing', 'old-review'],
  'updated descending must use sanitized extraction time and attachment time as fallback',
);
assert.deepEqual(
  sortDocumentAiAttachments(sortableAttachments, 'EXTRACTION_UPDATED_ASC', sortStatuses).map(({ id }) => id),
  ['old-review', 'missing', 'failed-sort', 'new-review', 'approved'],
  'updated ascending must use sanitized extraction time and attachment time as fallback',
);
assert.deepEqual(sortableAttachments.map(({ id }) => id), originalOrder, 'sorting must not mutate authorized input data');

console.log('PASS: document AI filtering, active filter summary, contextual result summary, deterministic reset, counts and local sorting are deterministic and fail-open for visibility');
