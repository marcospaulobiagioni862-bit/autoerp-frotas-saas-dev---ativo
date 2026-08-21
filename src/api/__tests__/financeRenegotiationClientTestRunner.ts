import { FinanceRenegotiationApiError, FinanceRenegotiationClient } from '../financeRenegotiationClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; init?: RequestInit }> = [];
let responder: (url: string, init?: RequestInit) => Promise<Response>;

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  calls.push({ url, init });
  return await responder(url, init);
};

const item = {
  id: 'reneg-1-1',
  companyId: 'company-a',
  originType: 'RENEGOTIATION',
  originId: 'reneg-1',
  categoryId: 'cat-income',
  description: 'Acordo (1/2)',
  originalAmount: '50.01',
  discountAmount: '0',
  fineAmount: '0',
  interestAmount: '0',
  updatedAmount: '50.01',
  paidAmount: '0',
  balanceAmount: '50.01',
  dueDate: '2026-09-15T00:00:00.000Z',
  competenceDate: '2026-09-15T00:00:00.000Z',
  status: 'PENDING',
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

const baseInput = {
  obligationIds: ['x'],
  newTotalAmount: 1,
  installmentsCount: 1,
  firstDueDate: '2026-09-15',
  installmentFrequency: 'MONTHLY' as const,
  categoryId: 'c',
  description: 'x',
};

async function run() {
  let passed = 0;
  try {
    responder = async () => new Response(JSON.stringify({ items: [item] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const result = await FinanceRenegotiationClient.renegotiateReceivables({
      obligationIds: ['ar-1', 'ar-2'],
      newTotalAmount: 100.01,
      installmentsCount: 2,
      firstDueDate: '2026-09-15',
      installmentFrequency: 'BIWEEKLY',
      categoryId: 'cat-income',
      description: 'Acordo',
    });
    assert(calls[0].url === '/api/finance/receivables/renegotiate', 'URL');
    assert(calls[0].init?.credentials === 'include', 'credentials');
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(body.installmentFrequency === 'BIWEEKLY', 'frequency must be transported explicitly');
    assert(!('companyId' in body) && !('userId' in body) && !('userName' in body), 'browser identity must not be sent');
    assert(result[0].originalAmount === 50.01 && result[0].dueDate === '2026-09-15', 'normalization');
    passed++;

    calls = [];
    let invalid = false;
    try {
      await FinanceRenegotiationClient.renegotiateReceivables({
        ...baseInput,
        installmentFrequency: 'INVALID' as never,
      });
    } catch (error) {
      invalid = error instanceof Error && error.message.includes('frequency');
    }
    assert(invalid && calls.length === 0, 'invalid frequency must fail before network');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let failed = false;
    try { await FinanceRenegotiationClient.renegotiateReceivables(baseInput); } catch (error) { failed = error instanceof FinanceRenegotiationApiError && error.status === 401; }
    assert(failed, '401 fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    failed = false;
    try { await FinanceRenegotiationClient.renegotiateReceivables(baseInput); } catch (error) { failed = error instanceof FinanceRenegotiationApiError && error.status === 403; }
    assert(failed, '403 fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: 'bad' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    invalid = false;
    try { await FinanceRenegotiationClient.renegotiateReceivables(baseInput); } catch { invalid = true; }
    assert(invalid, 'invalid payload fail closed');
    passed++;

    responder = async () => { throw new Error('network down'); };
    failed = false;
    try { await FinanceRenegotiationClient.renegotiateReceivables(baseInput); } catch (error) { failed = error instanceof Error && error.message === 'network down'; }
    assert(failed, 'network fail closed');
    passed++;

    console.log(`FinanceRenegotiationClient ${passed}/6 PASS`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
