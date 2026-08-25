import assert from 'node:assert/strict';
import {
  createDocumentAiAttachmentStatusSnapshot,
  createDocumentAiObservabilitySnapshot,
  inspectDocumentAiRuntimeMode,
} from '../documentAiObservability';

const checksum = 'a'.repeat(64);
const ready = {
  DOC_AI_WORKER_ENABLED: 'true',
  DOC_AI_PROVIDER: 'GEMINI',
  DOC_AI_GEMINI_MODEL: 'gemini-2.5-flash',
  DOC_AI_SYNTHETIC_SHA256_ALLOWLIST: checksum,
  GEMINI_API_KEY: 'synthetic-test-key-not-real',
  ATTACHMENT_STORAGE_PROVIDER: 'SERVER_FS',
  ATTACHMENT_STORAGE_DIR: '/tmp/autoerp-doc-ai-synthetic-test',
};

assert.equal(inspectDocumentAiRuntimeMode({}), 'DISABLED');
assert.equal(inspectDocumentAiRuntimeMode({ ...ready, DOC_AI_WORKER_ENABLED: 'false' }), 'DISABLED');
assert.equal(inspectDocumentAiRuntimeMode({ ...ready, GEMINI_API_KEY: '' }), 'MISCONFIGURED');
assert.equal(inspectDocumentAiRuntimeMode({ ...ready, DOC_AI_PROVIDER: 'OTHER' }), 'MISCONFIGURED');
assert.equal(inspectDocumentAiRuntimeMode({ ...ready, DOC_AI_SYNTHETIC_SHA256_ALLOWLIST: '' }), 'MISCONFIGURED');
assert.equal(inspectDocumentAiRuntimeMode({ ...ready, ATTACHMENT_STORAGE_DIR: '' }), 'MISCONFIGURED');
assert.equal(inspectDocumentAiRuntimeMode(ready), 'READY_SYNTHETIC_ONLY');

const snapshot = createDocumentAiObservabilitySnapshot([
  { status: 'PENDING', count: '2' },
  { status: 'REVIEW_REQUIRED', count: 3n },
  { status: 'FAILED', count: 1 },
  { status: 'UNTRUSTED', count: 999 },
  { status: 'APPROVED', count: -1 },
], ready);

assert.deepEqual(snapshot, {
  runtime: {
    mode: 'READY_SYNTHETIC_ONLY',
    provider: 'GEMINI',
    syntheticOnly: true,
    automaticExecution: false,
  },
  counts: {
    PENDING: 2,
    PROCESSING: 0,
    REVIEW_REQUIRED: 3,
    APPROVED: 0,
    REJECTED: 0,
    FAILED: 1,
    total: 6,
  },
});
assert.equal(JSON.stringify(snapshot).includes('synthetic-test-key-not-real'), false);
assert.equal(JSON.stringify(snapshot).includes(checksum), false);
assert.equal(JSON.stringify(snapshot).includes('/tmp/'), false);

const attachmentStatuses = createDocumentAiAttachmentStatusSnapshot([
  {
    attachmentId: 'attachment-1',
    status: 'FAILED',
    attemptCount: 2,
    failureCode: 'PROVIDER_TIMEOUT',
    updatedAt: '2026-08-25T12:00:00.000Z',
  },
  {
    attachmentId: 'attachment-1',
    status: 'PENDING',
    attemptCount: 1,
    failureCode: null,
    updatedAt: '2026-08-25T11:00:00.000Z',
  },
  {
    attachmentId: 'attachment-2',
    status: 'UNTRUSTED',
    attemptCount: 0,
    failureCode: null,
    updatedAt: '2026-08-25T12:00:00.000Z',
  },
  {
    attachmentId: 'attachment-3',
    status: 'REVIEW_REQUIRED',
    attemptCount: 1,
    failureCode: 'unsafe failure text',
    updatedAt: '2026-08-25T12:00:00.000Z',
  },
]);

assert.deepEqual(attachmentStatuses, {
  items: [
    {
      attachmentId: 'attachment-1',
      status: 'FAILED',
      attemptCount: 2,
      failureCode: 'PROVIDER_TIMEOUT',
      updatedAt: '2026-08-25T12:00:00.000Z',
    },
    {
      attachmentId: 'attachment-3',
      status: 'REVIEW_REQUIRED',
      attemptCount: 1,
      failureCode: null,
      updatedAt: '2026-08-25T12:00:00.000Z',
    },
  ],
});
assert.equal(JSON.stringify(attachmentStatuses).includes('companyId'), false);
assert.equal(JSON.stringify(attachmentStatuses).includes('checksum'), false);
assert.equal(JSON.stringify(attachmentStatuses).includes('provider'), false);

console.log('DOC-AI read-only observability and attachment status checks passed.');
