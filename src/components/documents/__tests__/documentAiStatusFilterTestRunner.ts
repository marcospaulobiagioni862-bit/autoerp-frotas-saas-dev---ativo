import assert from 'node:assert/strict';
import type { DocumentAiAttachmentStatus } from '../../../api/documentAiClient';
import {
  createDocumentAiStatusCounts,
  DOCUMENT_AI_STATUS_FILTERS,
  matchesDocumentAiStatusFilter,
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

console.log('PASS: document AI status filtering and counts are deterministic and fail-open for visibility');
