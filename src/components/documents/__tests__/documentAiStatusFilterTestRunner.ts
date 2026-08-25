import assert from 'node:assert/strict';
import type { DocumentAiAttachmentStatus } from '../../../api/documentAiClient';
import {
  createDocumentAiStatusCounts,
  DOCUMENT_AI_STATUS_FILTERS,
  DOCUMENT_AI_STATUS_SORTS,
  matchesDocumentAiStatusFilter,
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
};

assert.deepEqual(DOCUMENT_AI_STATUS_FILTERS, [
  'ALL',
  'NONE',
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

for (const filter of DOCUMENT_AI_STATUS_FILTERS) {
  assert.equal(
    matchesDocumentAiStatusFilter('missing', filter, statuses, true),
    true,
    'unavailable status data must never hide an attachment',
  );
}

assert.deepEqual(
  createDocumentAiStatusCounts(['pending', 'failed', 'missing', 'pending'], statuses, false),
  {
    ALL: 3,
    NONE: 1,
    PENDING: 1,
    PROCESSING: 0,
    REVIEW_REQUIRED: 0,
    APPROVED: 0,
    REJECTED: 0,
    FAILED: 1,
  },
  'counts must be sanitized, complete and deduplicated',
);

assert.deepEqual(
  createDocumentAiStatusCounts(['pending', 'failed', 'missing', 'pending'], statuses, true),
  {
    ALL: 3,
    NONE: null,
    PENDING: null,
    PROCESSING: null,
    REVIEW_REQUIRED: null,
    APPROVED: null,
    REJECTED: null,
    FAILED: null,
  },
  'unavailable status data must never be represented as zero',
);

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

console.log('PASS: document AI status filtering, counts and local sorting are deterministic and fail-open for visibility');
