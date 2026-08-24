import {
  ReportAiClient,
  parseReportAiSuggestionRecord,
  type ReportAiSuggestionRecord,
} from '../reportAiClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const record: ReportAiSuggestionRecord = {
  id: 'rai_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  companyId: 'server-company',
  targetType: 'DRIVER_SUMMARY',
  targetId: 'driver-1',
  status: 'PENDING_REVIEW',
  suggestion: {
    id: 'rai_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    companyId: 'server-company',
    targetType: 'DRIVER_SUMMARY',
    targetId: 'driver-1',
    decision: 'HUMAN_CONFIRMATION_REQUIRED',
    suggestedFields: [{
      field: 'driverName',
      value: 'Motorista Sintético',
      confidence: null,
      sensitivity: 'GENERAL',
      requiresServerRevalidation: false,
      provenance: [{
        kind: 'POSTGRES',
        entityType: 'Driver',
        entityId: 'driver-1',
        observedAt: '2026-08-24T00:00:00.000Z',
        confidence: null,
        reviewedAt: null,
      }],
    }],
    missingFields: [],
    warnings: [],
  },
  payloadHash: 'b'.repeat(64),
  review: null,
  reviewHash: null,
  createdBy: 'server-user',
  reviewedBy: null,
  reviewNotes: null,
  createdAt: '2026-08-24T00:00:00.000Z',
  reviewedAt: null,
  updatedAt: '2026-08-24T00:00:00.000Z',
};

export class ReportAiClientTestRunner {
  static async runAllTests(): Promise<void> {
    assert(parseReportAiSuggestionRecord(record).status === 'PENDING_REVIEW', 'valid suggestion was rejected');
    let rejected = false;
    try {
      parseReportAiSuggestionRecord({ ...record, companyId: 'forged-company' });
    } catch {
      rejected = true;
    }
    assert(rejected, 'mismatched tenant payload was accepted');

    const originalFetch = globalThis.fetch;
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input: String(input), init });
        if (String(input).endsWith('/driver-summary')) {
          return new Response(JSON.stringify({ item: record, created: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (String(input).includes('/review')) {
          return new Response(JSON.stringify({ item: { ...record, status: 'CONFIRMED' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ items: [record] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const generated = await ReportAiClient.createDriverSummary('driver-1');
      assert(generated.created && generated.item.targetId === 'driver-1', 'driver summary response was not parsed');
      const generateRequest = requests[0];
      assert(generateRequest.input === '/api/report-ai/suggestions/driver-summary', 'generation route changed');
      assert(generateRequest.init?.method === 'POST' && generateRequest.init.credentials === 'include', 'generation transport contract failed');
      const generateBody = JSON.parse(String(generateRequest.init.body));
      assert(Object.keys(generateBody).join(',') === 'driverId', 'generation sent fields beyond the driver identifier');
      assert(generateBody.driverId === 'driver-1', 'driver identifier missing');

      const listed = await ReportAiClient.list('PENDING_REVIEW');
      assert(listed.length === 1, 'suggestion list response was not parsed');
      assert(requests[1].input === '/api/report-ai/suggestions?status=PENDING_REVIEW', 'list filter was not encoded');

      const reviewed = await ReportAiClient.review(record.id, {
        decision: 'CONFIRM',
        notes: '  confirmação humana  ',
      });
      assert(reviewed.status === 'CONFIRMED', 'review response was not parsed');
      const reviewRequest = requests[2];
      const reviewBody = JSON.parse(String(reviewRequest.init?.body));
      assert(reviewBody.decision === 'CONFIRM', 'human decision missing');
      assert(reviewBody.notes === 'confirmação humana', 'review notes were not normalized');
      assert(Object.keys(reviewBody.corrections).length === 0, 'unexpected correction was sent');
      assert(
        reviewBody.companyId === undefined && reviewBody.reviewedBy === undefined && reviewBody.status === undefined,
        'client sent forged authority fields',
      );
      assert(reviewRequest.init?.credentials === 'include', 'review omitted session credentials');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

ReportAiClientTestRunner.runAllTests()
  .then(() => console.log('Report AI client tests PASS'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
