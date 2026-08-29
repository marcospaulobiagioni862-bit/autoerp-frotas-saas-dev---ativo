import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AttachmentByteStorage } from '../attachmentStorage';
import { configuredDocumentAiStorageProvider, isDocumentAiAttachmentEligible } from '../documentAiAttachmentPolicy';
import type { DocumentAiProvider } from '../documentAiProcessor';
import {
  createDocumentAiRuntimeFromEnvironment,
  dispatchDocumentAiExtractionFromEnvironment,
  DocumentAiRuntimeUnavailableError,
  parseSyntheticChecksumAllowlist,
} from '../documentAiRuntime';

const bytes = Buffer.from('%PDF-1.4\n% synthetic runtime fixture\n%%EOF\n');
const checksum = createHash('sha256').update(bytes).digest('hex');
let providerCreations = 0;
let queueCalls = 0;
let observedRead: { companyId: string; storageKey: string } | undefined;
let observedExpectedExtractionId: string | undefined;

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
  DOC_AI_REAL_DOCUMENTS_ENABLED: 'false',
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

const realDocumentEnvironment = {
  ...baseEnvironment,
  DOC_AI_REAL_DOCUMENTS_ENABLED: 'true',
  DOC_AI_SYNTHETIC_SHA256_ALLOWLIST: '',
};
const realRuntime = createDocumentAiRuntimeFromEnvironment(realDocumentEnvironment, {
  storage,
  createProvider(configuration) {
    providerCreations += 1;
    assert.equal(configuration.allowRealDocuments, true);
    assert.deepEqual([...configuration.allowedSyntheticChecksums], []);
    return provider;
  },
  async processNext(_companyId, _workerId, selectedProvider) {
    queueCalls += 1;
    assert.equal(selectedProvider, provider);
    return { id: 'real-document-extraction', status: 'REVIEW_REQUIRED' };
  },
});
assert.deepEqual(
  await realRuntime.processNextForTenant('company-real', 'worker-real'),
  { id: 'real-document-extraction', status: 'REVIEW_REQUIRED' },
);
assert.equal(providerCreations, 1);
assert.equal(queueCalls, 1);

const disabledDispatch = await dispatchDocumentAiExtractionFromEnvironment(
  'company-disabled',
  'extraction-disabled',
  'worker-disabled',
  { ...baseEnvironment, DOC_AI_WORKER_ENABLED: 'false' },
  {
    storage,
    createProvider: () => { providerCreations += 1; return provider; },
    async processNext() {
      queueCalls += 1;
      return { id: 'unexpected', status: 'REVIEW_REQUIRED' };
    },
  },
);
assert.deepEqual(disabledDispatch, { state: 'DISABLED' });
assert.equal(providerCreations, 1, 'disabled dispatch created a provider');
assert.equal(queueCalls, 1, 'disabled dispatch reached the queue');

const runtime = createDocumentAiRuntimeFromEnvironment(baseEnvironment, {
  storage,
  createProvider(configuration) {
    providerCreations += 1;
    assert.equal(configuration.apiKey, baseEnvironment.GEMINI_API_KEY);
    assert.equal(configuration.model, 'gemini-2.5-flash');
    assert.equal(configuration.allowRealDocuments, false);
    assert.deepEqual([...configuration.allowedSyntheticChecksums], [checksum]);
    return provider;
  },
  async processNext(companyId, workerId, selectedProvider, reader, expectedExtractionId) {
    queueCalls += 1;
    assert.equal(companyId, 'company-synthetic');
    assert.equal(workerId, 'worker-synthetic');
    assert.equal(selectedProvider, provider);
    observedExpectedExtractionId = expectedExtractionId;
    assert.deepEqual(
      Array.from(await reader.read(companyId, `${companyId}/attachment-synthetic`)),
      Array.from(bytes),
    );
    return { id: expectedExtractionId || 'extraction-synthetic', status: 'REVIEW_REQUIRED' };
  },
});

assert.equal(runtime.providerName, 'GEMINI');
assert.equal(runtime.storageProvider, 'SERVER_FS');
assert.deepEqual(
  await runtime.processNextForTenant('company-synthetic', 'worker-synthetic'),
  { id: 'extraction-synthetic', status: 'REVIEW_REQUIRED' },
);
assert.equal(observedExpectedExtractionId, undefined);
assert.equal(providerCreations, 2);
assert.equal(queueCalls, 2);
assert.deepEqual(observedRead, {
  companyId: 'company-synthetic', storageKey: 'company-synthetic/attachment-synthetic',
});

const exactDispatch = await dispatchDocumentAiExtractionFromEnvironment(
  'company-synthetic',
  'extraction-exact',
  'worker-synthetic',
  baseEnvironment,
  {
    storage,
    createProvider() {
      providerCreations += 1;
      return provider;
    },
    async processNext(companyId, workerId, selectedProvider, _reader, expectedExtractionId) {
      queueCalls += 1;
      assert.equal(companyId, 'company-synthetic');
      assert.equal(workerId, 'worker-synthetic');
      assert.equal(selectedProvider, provider);
      assert.equal(expectedExtractionId, 'extraction-exact');
      observedExpectedExtractionId = expectedExtractionId;
      return { id: 'extraction-exact', status: 'REVIEW_REQUIRED' };
    },
  },
);
assert.deepEqual(exactDispatch, {
  state: 'PROCESSED',
  item: { id: 'extraction-exact', status: 'REVIEW_REQUIRED' },
});
assert.equal(observedExpectedExtractionId, 'extraction-exact');
assert.equal(providerCreations, 3);
assert.equal(queueCalls, 3);

const attachment = {
  isArchived: false,
  storageProvider: 'R2',
  contentState: 'AVAILABLE',
  storageKey: 'company-synthetic/attachment-r2',
  checksum,
};
assert.equal(configuredDocumentAiStorageProvider(undefined), 'SERVER_FS');
assert.equal(configuredDocumentAiStorageProvider('r2'), 'R2');
assert.equal(configuredDocumentAiStorageProvider('  server_fs  '), 'SERVER_FS');
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

console.log('DOC-AI-1B2 runtime composition, real-document opt-in and exact dispatch checks passed.');
