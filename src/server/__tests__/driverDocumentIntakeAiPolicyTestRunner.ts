import assert from 'node:assert/strict';
import { canQueueDriverDocumentIntakeCnh } from '../driverDocumentIntakeAiPolicy';

const checksum = 'a'.repeat(64);
const intake = {
  id: 'intake-1',
  companyId: 'company-a',
  createdBy: 'user-a',
  status: 'DOCUMENT_UPLOADED',
  attachmentId: 'attachment-1',
  expiresAt: '2026-08-30T00:00:00.000Z',
};
const attachment = {
  id: 'attachment-1',
  companyId: 'company-a',
  entityType: 'DriverDocumentIntake',
  entityId: 'intake-1',
  documentType: 'CNH',
  isArchived: false,
  contentState: 'AVAILABLE',
  storageProvider: 'R2',
  storageKey: 'company-a/attachment-1',
  checksum,
};
const authority = { companyId: 'company-a', userId: 'user-a', nowIso: '2026-08-29T01:00:00.000Z' };

assert.equal(canQueueDriverDocumentIntakeCnh(intake, attachment, authority), true);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, createdBy: 'user-b' }, attachment, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, companyId: 'company-b' }, attachment, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, status: 'DRAFT' }, attachment, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, expiresAt: authority.nowIso }, attachment, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, attachmentId: 'other' }, attachment, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh(intake, { ...attachment, entityId: 'another-intake' }, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh(intake, { ...attachment, documentType: 'RG' }, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh(intake, { ...attachment, contentState: 'MISSING' }, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh(intake, { ...attachment, storageProvider: 'LEGACY_BROWSER' }, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh(intake, { ...attachment, checksum: 'bad' }, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, archivedAt: '2026-08-29T00:00:00.000Z' }, attachment, authority), false);
assert.equal(canQueueDriverDocumentIntakeCnh({ ...intake, consumedAt: '2026-08-29T00:00:00.000Z' }, attachment, authority), false);

console.log('Driver intake DOC-AI queue policy checks passed.');
