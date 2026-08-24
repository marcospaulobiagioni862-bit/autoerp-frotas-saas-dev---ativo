import {
  DocumentAiClient,
  parseDocumentAiExtraction,
  type DocumentAiExtraction,
} from '../documentAiClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const extraction: DocumentAiExtraction = {
  id: 'doc-ai-test-1',
  companyId: 'server-company',
  attachmentId: 'attachment-1',
  attachmentChecksum: 'a'.repeat(64),
  status: 'REVIEW_REQUIRED',
  requestedBy: 'server-user',
  provider: 'synthetic',
  model: 'synthetic-v1',
  modelVersion: null,
  detectedDocumentType: 'CRLV',
  proposedFields: { plate: 'ABC1D23' },
  fieldConfidence: { plate: 0.96 },
  reviewedBy: null,
  reviewedAt: null,
  corrections: null,
  reviewNotes: null,
  approvedAt: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

export class DocumentAiClientTestRunner {
  static async runAllTests(): Promise<void> {
    assert(parseDocumentAiExtraction(extraction).status === 'REVIEW_REQUIRED', 'valid extraction was rejected');

    let invalidRejected = false;
    try {
      parseDocumentAiExtraction({ ...extraction, attachmentChecksum: 'not-a-checksum' });
    } catch {
      invalidRejected = true;
    }
    assert(invalidRejected, 'invalid extraction payload was accepted');

    const originalFetch = globalThis.fetch;
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input: String(input), init });
        if (String(input).includes('/retry')) {
          return new Response(JSON.stringify({ item: { ...extraction, status: 'PENDING' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (String(input).includes('/review')) {
          return new Response(JSON.stringify({ item: { ...extraction, status: 'APPROVED' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ items: [extraction] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const listed = await DocumentAiClient.list('REVIEW_REQUIRED');
      assert(listed.length === 1, 'review list response was not parsed');
      assert(requests[0].input === '/api/document-ai/extractions?status=REVIEW_REQUIRED', 'status filter was not encoded');
      assert(requests[0].init?.credentials === 'include', 'list request omitted session credentials');

      const approved = await DocumentAiClient.review(extraction.id, {
        decision: 'APPROVE',
        corrections: { plate: 'XYZ9Z99' },
        notes: '  revisão segura  ',
      });
      assert(approved.status === 'APPROVED', 'review response was not parsed');
      const reviewRequest = requests[1];
      const body = JSON.parse(String(reviewRequest.init?.body || '{}'));
      assert(body.decision === 'APPROVE', 'review decision missing');
      assert(body.corrections.plate === 'XYZ9Z99', 'review correction missing');
      assert(body.notes === 'revisão segura', 'review notes were not normalized');
      assert(body.companyId === undefined && body.reviewedBy === undefined && body.status === undefined, 'client sent forged authority fields');
      assert(reviewRequest.init?.credentials === 'include', 'review request omitted session credentials');

      const retried = await DocumentAiClient.retry(extraction.id);
      assert(retried.status === 'PENDING', 'retry response was not parsed');
      const retryRequest = requests[2];
      assert(retryRequest.input === `/api/document-ai/extractions/${extraction.id}/retry`, 'retry route was not encoded');
      assert(retryRequest.init?.method === 'POST' && retryRequest.init.credentials === 'include', 'retry transport contract failed');
      assert(String(retryRequest.init.body) === '{}', 'retry must send an exact empty body');
      const retryBody = JSON.parse(String(retryRequest.init.body));
      assert(Object.keys(retryBody).length === 0, 'retry client sent browser authority or mutation fields');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

DocumentAiClientTestRunner.runAllTests()
  .then(() => console.log('Document AI client tests PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
