import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GeminiDocumentAiProvider,
  SyntheticDocumentRequiredError,
} from '../geminiDocumentAiProvider';
import {
  DOCUMENT_AI_SYSTEM_POLICY,
  processDocumentAiBytes,
} from '../documentAiProcessor';

const syntheticPdf = Buffer.from('%PDF-1.4\n% AutoERP synthetic fixture only\n%%EOF\n');
const checksum = createHash('sha256').update(syntheticPdf).digest('hex');
let calls = 0;
let captured: Record<string, unknown> | undefined;

const provider = new GeminiDocumentAiProvider({
  apiKey: 'test-only-not-a-real-key',
  model: 'gemini-3.6-flash',
  allowedSyntheticChecksums: new Set([checksum]),
  client: {
    async create(request) {
      calls += 1;
      captured = request;
      return {
        steps: [{
          type: 'model_output',
          content: [{
            type: 'text',
            text: JSON.stringify({
              documentType: 'INVOICE',
              fields: { invoiceNumber: 'SYNTHETIC-001', amount: 10 },
              confidence: { invoiceNumber: 1, amount: 0.99 },
              raw: { text: 'synthetic fixture', pages: 1 },
            }),
          }],
        }],
      };
    },
  },
});

const allowed = await processDocumentAiBytes(provider, {
  content: syntheticPdf,
  mimeType: 'application/pdf',
  expectedChecksum: checksum,
});
assert.equal(calls, 1);
assert.equal(allowed.detectedDocumentType, 'INVOICE');
assert.deepEqual(allowed.proposedFields, { invoiceNumber: 'SYNTHETIC-001', amount: 10 });
assert.equal(captured?.model, 'gemini-3.6-flash');
assert.equal(captured?.system_instruction, DOCUMENT_AI_SYSTEM_POLICY);
assert.equal(captured?.store, false);

const responseFormat = captured?.response_format as Record<string, unknown> | undefined;
assert.ok(responseFormat, 'Gemini response format was not captured');
assert.equal(responseFormat.type, 'text');
assert.equal(responseFormat.mime_type, 'application/json');
assert.ok(responseFormat.schema, 'strict JSON schema was not sent');
assert.equal('tools' in (captured ?? {}), false);

const input = captured?.input as Array<Record<string, unknown>> | undefined;
assert.ok(input && input.length === 2, 'Gemini multimodal input was not captured');
assert.equal(input[0]?.type, 'text');
assert.equal(input[1]?.type, 'document');
assert.equal(input[1]?.mime_type, 'application/pdf');
assert.equal(typeof input[1]?.data, 'string');

await assert.rejects(
  provider.extract({
    content: Buffer.from('%PDF-1.4\n% not allowlisted\n%%EOF\n'),
    mimeType: 'application/pdf',
    policy: DOCUMENT_AI_SYSTEM_POLICY,
  }, new AbortController().signal),
  SyntheticDocumentRequiredError,
);
assert.equal(calls, 1, 'non-allowlisted bytes must be rejected before any external call');

const sensitiveApiKey = 'gemini-secret-must-not-leak';
const sensitiveDocument = 'base64-document-must-not-leak';
const sensitivePrompt = 'private-policy-must-not-leak';
const sensitiveResponse = 'raw-provider-response-must-not-leak';
const providerError = Object.assign(new Error(`provider failure ${sensitiveApiKey} ${sensitiveDocument} ${sensitivePrompt} ${sensitiveResponse}`), {
  name: 'GeminiProviderError',
  status: 429,
  code: 'RATE_LIMITED',
  apiKey: sensitiveApiKey,
  request: { document: sensitiveDocument, prompt: sensitivePrompt },
  response: sensitiveResponse,
});
const logged: unknown[][] = [];
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => { logged.push(args); };
try {
  const failingProvider = new GeminiDocumentAiProvider({
    apiKey: sensitiveApiKey,
    model: 'gemini-3.6-flash',
    allowedSyntheticChecksums: new Set([checksum]),
    client: { async create() { throw providerError; } },
  });
  await assert.rejects(
    failingProvider.extract({
      content: syntheticPdf,
      mimeType: 'application/pdf',
      policy: sensitivePrompt,
    }, new AbortController().signal),
    error => error === providerError,
  );
} finally {
  console.error = originalConsoleError;
}
assert.equal(logged.length, 1, 'provider failure must emit exactly one sanitized diagnostic');
const serializedLog = JSON.stringify(logged);
assert.match(serializedLog, /GeminiProviderError/);
assert.match(serializedLog, /429/);
assert.match(serializedLog, /RATE_LIMITED/);
for (const forbidden of [sensitiveApiKey, sensitiveDocument, sensitivePrompt, sensitiveResponse]) {
  assert.equal(serializedLog.includes(forbidden), false, `sanitized diagnostic leaked: ${forbidden}`);
}

assert.throws(() => new GeminiDocumentAiProvider({
  apiKey: 'test-only-not-a-real-key',
  model: 'gemini-3.6-flash',
  allowedSyntheticChecksums: new Set(),
}), SyntheticDocumentRequiredError);

console.log('Gemini Document AI Interactions API synthetic-only checks passed.');
