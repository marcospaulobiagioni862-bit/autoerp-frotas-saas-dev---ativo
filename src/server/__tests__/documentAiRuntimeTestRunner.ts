import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AttachmentByteStorage } from '../attachmentStorage';
import { configuredDocumentAiStorageProvider, isDocumentAiAttachmentEligible } from '../documentAiAttachmentPolicy';
import type { DocumentAiProvider } from '../documentAiProcessor';
import {
  createDocumentAiRuntimeFromEnvironment,
  DocumentAiRuntimeUnavailableError,
  parseSyntheticChecksumAllowlist,
} from '../documentAiRuntime';

const bytes = Buffer.from('%PDF-1.4\n% synthetic runtime fixture\n%%EOF\n');
const checksum = createHash('sha256').update(bytes).digest('hex');
let providerCreations = 0;
let queueCalls = 0;
let observedRead: { companyId: string; storageKey: string } | undefined;

const storage: AttachmentByteStorage = {
  provider: 'SERVER_FS',
  getConfiguration: () => ({
    provider: 'SERVER_FS', configured: true, durableRequested: false,
    durable: false, ephemeralPath: true, maxBytes: 10 * 1024 * 1024,
  }),
  async write() { throw new Error('write must not be used by Document AI runtime'); },
  async read(companyId, storageKey) {
    observedRead = { companyId, storageKey };
    assert.ok(storageKey.startsWith(`${companyId}/`), 'runtime reader crossed tenant storage ownership');
    return bytes;
  },
  async remove() { throw new Error('remove must not be used by Document AI runtime'); },
  async exists() { return true; },
};

const provider: DocumentAiProvider = {
  name: 'GEMINI', model: 'gemini-2.5-flash',
  async extract() { throw new Error('provider must not be called by composition test'); },
};

const baseEnvironment = {
  DOC_AI_WORKER_ENABLED: 'true',
  DOC_AI_PROVIDER: 'GEMINI',
  DOC_AI_GEMINI_MODEL: 'gemini-2.5-flash',
  DOC_AI_SYNTHETIC_SHA256_ALLOWLIST: checksum,
  GEMINI_API_KEY: 'synthetic-test-key-not-real',
};

for (const environment of [
  {},
  { ...baseEnvironment, DOC_AI_WORKER_ENABLED: 'false' },
  { ...baseEnvironment, DOC_AI_PROVIDER: 'OTHER' },
  { ...baseEnvironment, GEMINI_API_KEY: '' },
  { ...baseEnvironment, DOC_AI_SYNTHETIC_SHA256_ALLOWLIST: '' },
  { ...baseEnvironment, DOC_AI_SYNTHETIC_SHA256_ALLOWLIST: 'not-a-sha256' },
]) {
  assert.throws(
    () => createDocumentAiRuntimeFromEnvironment(environment, {
      storage,
      createProvider: () => { providerCreations += 1; return provider; },
    }),
    DocumentAiRuntimeUnavailableError,
  );
}
assert.equal(providerCreations, 0, 'invalid or disabled runtime created a provider');
assert.deepEqual([...parseSyntheticChecksumAllowlist(`${checksum},${checksum}`)], [checksum]);

const runtime = createDocumentAiRuntimeFromEnvironment(baseEnvironment, {
  storage,
  createProvider(configuration) {
    providerCreations += 1;
    assert.equal(configuration.apiKey, baseEnvironment.GEMINI_API_KEY);
    assert.equal(configuration.model, 'gemini-2.5-flash');
    assert.deepEqual([...configuration.allowedSyntheticChecksums], [checksum]);
    return provider;
  },
  async processNext(companyId, workerId, selectedProvider, reader) {
    queueCalls += 1;
    assert.equal(companyId, 'company-synthetic');
    assert.equal(workerId, 'worker-synthetic');
    assert.equal(selectedProvider, provider);
    assert.deepEqual(
      Array.from(await reader.read(companyId, `${companyId}/attachment-synthetic`)),
      Array.from(bytes),
    );
    return { id: 'extraction-synthetic', status: 'REVIEW_REQUIRED' };
  },
});

assert.equal(runtime.providerName, 'GEMINI');
assert.equal(runtime.storageProvider, 'SERVER_FS');
assert.deepEqual(
  await runtime.processNextForTenant('company-synthetic', 'worker-synthetic'),
  { id: 'extraction-synthetic', status: 'REVIEW_REQUIRED' },
);
assert.equal(providerCreations, 1);
assert.equal(queueCalls, 1);
assert.deepEqual(observedRead, {
  companyId: 'company-synthetic', storageKey: 'company-synthetic/attachment-synthetic',
});

const attachment = {
  isArchived: false,
  storageProvider: 'R2',
  contentState: 'AVAILABLE',
  storageKey: 'company-synthetic/attachment-r2',
  checksum,
};
assert.equal(configuredDocumentAiStorageProvider(undefined), 'SERVER_FS');
assert.equal(configuredDocumentAiStorageProvider('r2'), 'R2');
assert.equal(configuredDocumentAiStorageProvider('legacy_browser'), null);
assert.equal(isDocumentAiAttachmentEligible(attachment, 'R2'), true);
assert.equal(isDocumentAiAttachmentEligible(attachment, 'SERVER_FS'), false);
assert.equal(isDocumentAiAttachmentEligible({ ...attachment, storageProvider: 'SERVER_FS' }, 'SERVER_FS'), true);
assert.equal(isDocumentAiAttachmentEligible({ ...attachment, storageProvider: 'LEGACY_BROWSER' }, null), false);
assert.equal(isDocumentAiAttachmentEligible({ ...attachment, contentState: 'MISSING' }, 'R2'), false);
assert.equal(isDocumentAiAttachmentEligible({ ...attachment, checksum: 'bad' }, 'R2'), false);
assert.equal(isDocumentAiAttachmentEligible({ ...attachment, isArchived: true }, 'R2'), false);
assert.equal(isDocumentAiAttachmentEligible(attachment, 'R2', checksum), true);
assert.equal(isDocumentAiAttachmentEligible(attachment, 'R2', 'b'.repeat(64)), false);

console.log('DOC-AI-1B2 runtime composition checks passed.');
