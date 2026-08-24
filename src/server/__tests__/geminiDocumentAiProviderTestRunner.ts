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
  model: 'gemini-2.5-flash',
  allowedSyntheticChecksums: new Set([checksum]),
  client: {
    models: {
      async generateContent(request) {
        calls += 1;
        captured = request;
        return {
          text: JSON.stringify({
            documentType: 'INVOICE',
            fields: { invoiceNumber: 'SYNTHETIC-001', amount: 10 },
            confidence: { invoiceNumber: 1, amount: 0.99 },
            raw: { text: 'synthetic fixture', pages: 1 },
          }),
        };
      },
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
assert.equal(captured?.model, 'gemini-2.5-flash');

const config = captured?.config as Record<string, unknown> | undefined;
assert.ok(config, 'Gemini request config was not captured');
assert.equal(config.systemInstruction, DOCUMENT_AI_SYSTEM_POLICY);
assert.equal(config.responseMimeType, 'application/json');
assert.ok(config.responseJsonSchema, 'strict JSON schema was not sent');
assert.equal('tools' in config, false);
assert.equal('toolConfig' in config, false);
assert.equal('automaticFunctionCalling' in config, false);
assert.equal('tools' in (captured ?? {}), false);

await assert.rejects(
  provider.extract({
    content: Buffer.from('%PDF-1.4\n% not allowlisted\n%%EOF\n'),
    mimeType: 'application/pdf',
    policy: DOCUMENT_AI_SYSTEM_POLICY,
  }, new AbortController().signal),
  SyntheticDocumentRequiredError,
);
assert.equal(calls, 1, 'non-allowlisted bytes must be rejected before any external call');

assert.throws(() => new GeminiDocumentAiProvider({
  apiKey: 'test-only-not-a-real-key',
  model: 'gemini-2.5-flash',
  allowedSyntheticChecksums: new Set(),
}), SyntheticDocumentRequiredError);

console.log('Gemini Document AI provider synthetic-only checks passed.');
