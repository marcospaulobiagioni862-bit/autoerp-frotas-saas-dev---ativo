import { DriverDocumentIntakeClient } from '../driverDocumentIntakeClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
const base = {
  id: 'intake-1',
  companyId: 'company-a',
  createdBy: 'user-a',
  status: 'DRAFT',
  idempotencyKey: 'idem-1',
  expiresAt: '2026-08-30T00:00:00.000Z',
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

try {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ item: base }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const created = await DriverDocumentIntakeClient.create('idem-1');
  assert(created.id === 'intake-1', 'intake create payload was not accepted');
  assert(requestUrl === '/api/driver-document-intakes', 'intake create endpoint changed');
  assert(requestInit?.method === 'POST', 'intake create must use POST');
  assert(String(requestInit?.body).includes('idem-1'), 'idempotency key was not sent');

  globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...base, status: 'INVALID' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
  let malformedRejected = false;
  try {
    await DriverDocumentIntakeClient.get('intake-1');
  } catch {
    malformedRejected = true;
  }
  assert(malformedRejected, 'unknown intake status must fail closed');

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(JSON.stringify({ item: { ...base, status: 'DOCUMENT_UPLOADED', attachmentId: 'att-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const fetched = await DriverDocumentIntakeClient.get('intake/encoded');
  assert(fetched.attachmentId === 'att-1', 'intake attachment id was not preserved');
  assert(requestUrl.endsWith('/intake%2Fencoded'), 'intake id was not URL encoded');

  const checksum = 'a'.repeat(64);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      created: true,
      item: {
        id: 'extraction-1',
        attachmentId: 'att-1',
        attachmentChecksum: checksum,
        status: 'PENDING',
        createdAt: '2026-08-29T01:00:00.000Z',
        updatedAt: '2026-08-29T01:00:00.000Z',
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const extraction = await DriverDocumentIntakeClient.requestDocumentAi('intake/encoded');
  assert(extraction.created === true, 'enqueue created flag was not preserved');
  assert(extraction.item.id === 'extraction-1', 'enqueue extraction payload was not accepted');
  assert(requestUrl.endsWith('/intake%2Fencoded/document-ai'), 'enqueue intake id was not URL encoded');
  assert(requestInit?.method === 'POST', 'enqueue must use POST');
  assert(String(requestInit?.body) === '{}', 'enqueue client must not send browser authority fields');

  globalThis.fetch = (async () => new Response(JSON.stringify({
    created: false,
    item: {
      id: 'extraction-1',
      attachmentId: 'att-1',
      attachmentChecksum: 'bad',
      status: 'PENDING',
      createdAt: '2026-08-29T01:00:00.000Z',
      updatedAt: '2026-08-29T01:00:00.000Z',
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  let malformedExtractionRejected = false;
  try {
    await DriverDocumentIntakeClient.requestDocumentAi('intake-1');
  } catch {
    malformedExtractionRejected = true;
  }
  assert(malformedExtractionRejected, 'malformed extraction summary must fail closed');

  console.log('Driver document intake client tests PASS');
} finally {
  globalThis.fetch = originalFetch;
}
