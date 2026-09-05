import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GeminiDocumentAiProvider,
  SyntheticDocumentRequiredError,
} from '../geminiDocumentAiProvider';
import {
  DOCUMENT_AI_SYSTEM_POLICY,
  DocumentAiProcessingError,
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

const schema = responseFormat.schema as Record<string, unknown>;
const variants = schema.anyOf as Array<Record<string, unknown>> | undefined;
assert.ok(Array.isArray(variants) && variants.length === 11, 'schema must contain one variant per document type');
const cnhVariant = variants.find((variant) => {
  const properties = variant.properties as Record<string, unknown> | undefined;
  const documentType = properties?.documentType as Record<string, unknown> | undefined;
  const values = documentType?.enum as unknown[] | undefined;
  return Array.isArray(values) && values.length === 1 && values[0] === 'CNH';
});
assert.ok(cnhVariant, 'CNH schema variant missing');
for (const vehicleDocumentType of ['CRLV', 'CRV', 'ATPV_E']) {
  const vehicleVariant = variants.find((variant) => {
    const properties = variant.properties as Record<string, unknown> | undefined;
    const documentType = properties?.documentType as Record<string, unknown> | undefined;
    const values = documentType?.enum as unknown[] | undefined;
    return Array.isArray(values) && values.length === 1 && values[0] === vehicleDocumentType;
  });
  assert.ok(vehicleVariant, `${vehicleDocumentType} schema variant missing`);
}

const cnhProperties = cnhVariant.properties as Record<string, unknown>;
const cnhFields = cnhProperties.fields as Record<string, unknown>;
const cnhFieldProperties = cnhFields.properties as Record<string, unknown>;
assert.equal('name' in cnhFieldProperties, true, 'CNH schema must expose CNH fields');
assert.equal('registrationNumber' in cnhFieldProperties, true, 'CNH schema must expose CNH number');
assert.equal('plate' in cnhFieldProperties, false, 'CNH schema must not expose CRLV fields');
assert.equal('renavam' in cnhFieldProperties, false, 'CNH schema must not expose CRLV fields');
assert.deepEqual(cnhVariant.required, ['documentType', 'fields', 'confidence', 'raw']);

const trafficVariant = variants.find((variant) => {
  const properties = variant.properties as Record<string, unknown> | undefined;
  const documentType = properties?.documentType as Record<string, unknown> | undefined;
  const values = documentType?.enum as unknown[] | undefined;
  return Array.isArray(values) && values.length === 1 && values[0] === 'TRAFFIC_TICKET';
});
assert.ok(trafficVariant, 'TRAFFIC_TICKET schema variant missing');
const trafficProperties = trafficVariant.properties as Record<string, unknown>;
const trafficFields = trafficProperties.fields as Record<string, unknown>;
const trafficFieldProperties = trafficFields.properties as Record<string, unknown>;
for (const field of ['plate','noticeNumber','organName','infractionCode','description','infractionDate','infractionTime','infractionLocation','dueDate','discountDueDate','amount','discountAmount','points']) {
  assert.equal(field in trafficFieldProperties, true, `TRAFFIC_TICKET schema field missing: ${field}`);
}
assert.equal('driverName' in trafficFieldProperties, false, 'traffic ticket AI must not infer driver identity in the document schema');
assert.equal('contractNumber' in trafficFieldProperties, false, 'traffic ticket AI must not infer contract authority');

const input = captured?.input as Array<Record<string, unknown>> | undefined;
assert.ok(input && input.length === 2, 'Gemini multimodal input was not captured');
assert.equal(input[0]?.type, 'text');
assert.equal(input[1]?.type, 'document');
assert.equal(input[1]?.mime_type, 'application/pdf');
assert.equal(typeof input[1]?.data, 'string');
assert.match(String(input[0]?.text ?? ''), /omit any field that is absent or uncertain/i);
assert.match(String(input[0]?.text ?? ''), /otherwise omit the field/i);

const tolerantProvider = new GeminiDocumentAiProvider({
  apiKey: 'test-only-not-a-real-key',
  model: 'gemini-3.6-flash',
  allowedSyntheticChecksums: new Set([checksum]),
  client: {
    async create() {
      return {
        output_text: JSON.stringify({
          documentType: 'CNH',
          fields: {
            name: 'MOTORISTA LEGIVEL',
            cpf: '12345678900',
            registrationNumber: '01234567890',
            category: null,
            ear: false,
          },
          confidence: {
            name: 0.99,
            cpf: 'alta',
            registrationNumber: 1.2,
            category: 0.8,
            ear: 0.95,
          },
          raw: { text: 'CNH sintética legível', pages: 1 },
        }),
      };
    },
  },
});

const tolerantCnh = await processDocumentAiBytes(tolerantProvider, {
  content: syntheticPdf,
  mimeType: 'application/pdf',
  expectedChecksum: checksum,
});
assert.equal(tolerantCnh.detectedDocumentType, 'CNH');
assert.deepEqual(tolerantCnh.proposedFields, { name: 'MOTORISTA LEGIVEL' });
assert.deepEqual(tolerantCnh.fieldConfidence, { name: 0.99 });
assert.equal('ear' in tolerantCnh.proposedFields, false, 'EAR=false from AI must be discarded for human review');
assert.equal('cpf' in tolerantCnh.proposedFields, false, 'field with malformed confidence must not invalidate readable CNH');
assert.equal('registrationNumber' in tolerantCnh.proposedFields, false, 'field with out-of-range confidence must be discarded only');

const positiveEarProvider = new GeminiDocumentAiProvider({
  apiKey: 'test-only-not-a-real-key',
  model: 'gemini-3.6-flash',
  allowedSyntheticChecksums: new Set([checksum]),
  client: {
    async create() {
      return {
        output_text: JSON.stringify({
          documentType: 'CNH',
          fields: { name: 'MOTORISTA EAR', ear: true },
          confidence: { name: 0.99, ear: 0.91 },
          raw: {},
        }),
      };
    },
  },
});
const positiveEar = await processDocumentAiBytes(positiveEarProvider, {
  content: syntheticPdf,
  mimeType: 'application/pdf',
  expectedChecksum: checksum,
});
assert.equal(positiveEar.proposedFields.ear, true, 'visible positive EAR must remain eligible for approval');

await assert.rejects(
  provider.extract({
    content: Buffer.from('%PDF-1.4\n% not allowlisted\n%%EOF\n'),
    mimeType: 'application/pdf',
    policy: DOCUMENT_AI_SYSTEM_POLICY,
  }, new AbortController().signal),
  SyntheticDocumentRequiredError,
);
assert.equal(calls, 1, 'non-allowlisted bytes must be rejected before any external call');

let transientCalls = 0;
const transientWarnings: unknown[][] = [];
const originalTransientConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => { transientWarnings.push(args); };
try {
  const transientProvider = new GeminiDocumentAiProvider({
    apiKey: 'test-only-not-a-real-key',
    model: 'gemini-3.7-flash',
    allowedSyntheticChecksums: new Set([checksum]),
    client: {
      async create() {
        transientCalls += 1;
        if (transientCalls === 1) {
          throw Object.assign(new Error('temporary upstream failure'), {
            status: 500,
            code: 'Internal Server Error',
          });
        }
        return {
          output_text: JSON.stringify({
            documentType: 'CNH',
            fields: { name: 'MOTORISTA APOS RETRY' },
            confidence: { name: 0.99 },
            raw: {},
          }),
        };
      },
    },
  });
  const recovered = await processDocumentAiBytes(transientProvider, {
    content: syntheticPdf,
    mimeType: 'application/pdf',
    expectedChecksum: checksum,
  });
  assert.equal(recovered.proposedFields.name, 'MOTORISTA APOS RETRY');
} finally {
  console.warn = originalTransientConsoleWarn;
}
assert.equal(transientCalls, 2, 'HTTP 500 must receive one bounded retry before succeeding');
assert.equal(transientWarnings.length, 1, 'transient retry must emit one sanitized warning');
assert.match(JSON.stringify(transientWarnings), /500/);

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
let rateLimitedCalls = 0;
const warned: unknown[][] = [];
const errored: unknown[][] = [];
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
console.warn = (...args: unknown[]) => { warned.push(args); };
console.error = (...args: unknown[]) => { errored.push(args); };
try {
  const failingProvider = new GeminiDocumentAiProvider({
    apiKey: sensitiveApiKey,
    model: 'gemini-3.6-flash',
    allowedSyntheticChecksums: new Set([checksum]),
    client: {
      async create() {
        rateLimitedCalls += 1;
        throw providerError;
      },
    },
  });
  await assert.rejects(
    processDocumentAiBytes(failingProvider, {
      content: syntheticPdf,
      mimeType: 'application/pdf',
      expectedChecksum: checksum,
    }),
    (error: unknown) => error instanceof DocumentAiProcessingError && error.failureCode === 'PROVIDER_RATE_LIMITED',
  );
} finally {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}
assert.equal(rateLimitedCalls, 1, 'HTTP 429 must not trigger immediate repeated provider calls');
assert.equal(warned.length, 1, 'rate limit must emit exactly one sanitized warning');
assert.equal(errored.length, 0, 'rate limit must not be logged as a generic provider error');
const serializedLog = JSON.stringify(warned);
assert.match(serializedLog, /429/);
for (const forbidden of [sensitiveApiKey, sensitiveDocument, sensitivePrompt, sensitiveResponse, 'RATE_LIMITED']) {
  assert.equal(serializedLog.includes(forbidden), false, `sanitized rate-limit diagnostic leaked: ${forbidden}`);
}

assert.throws(() => new GeminiDocumentAiProvider({
  apiKey: 'test-only-not-a-real-key',
  model: 'gemini-3.6-flash',
  allowedSyntheticChecksums: new Set(),
}), SyntheticDocumentRequiredError);

console.log('Gemini Document AI Interactions API synthetic-only checks passed.');
