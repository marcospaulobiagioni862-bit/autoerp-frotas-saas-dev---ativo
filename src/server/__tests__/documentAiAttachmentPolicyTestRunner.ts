import { isDocumentAiAttachmentEligible } from '../documentAiAttachmentPolicy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const checksum = 'a'.repeat(64);
const base = {
  isArchived: false,
  storageProvider: 'R2',
  contentState: 'AVAILABLE',
  storageKey: 'company/attachment',
  checksum,
};

assert(isDocumentAiAttachmentEligible(base, 'R2'), 'configured R2 attachment should be eligible');
assert(!isDocumentAiAttachmentEligible(base, 'SERVER_FS'), 'storage provider mismatch must fail closed');
assert(isDocumentAiAttachmentEligible({ ...base, storageProvider: 'SERVER_FS' }, 'SERVER_FS'), 'configured SERVER_FS attachment should remain eligible');
assert(!isDocumentAiAttachmentEligible({ ...base, storageProvider: 'LEGACY_BROWSER' }, 'LEGACY_BROWSER'), 'legacy browser attachment must remain ineligible');
assert(!isDocumentAiAttachmentEligible({ ...base, contentState: 'MISSING' }, 'R2'), 'missing content must be ineligible');
assert(!isDocumentAiAttachmentEligible({ ...base, checksum: 'bad' }, 'R2'), 'invalid checksum must be ineligible');
assert(!isDocumentAiAttachmentEligible({ ...base, isArchived: true }, 'R2'), 'archived attachment must be ineligible');
assert(isDocumentAiAttachmentEligible(base, 'R2', checksum), 'matching retry checksum should be eligible');
assert(!isDocumentAiAttachmentEligible(base, 'R2', 'b'.repeat(64)), 'retry checksum mismatch must fail closed');
assert(!isDocumentAiAttachmentEligible(base, 'UNKNOWN'), 'unknown configured provider must fail closed');

console.log('Document AI attachment storage policy tests PASS');
