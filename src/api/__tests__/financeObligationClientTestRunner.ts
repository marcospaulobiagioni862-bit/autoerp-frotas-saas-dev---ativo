import { FinanceObligationApiError, FinanceObligationClient } from '../financeObligationClient';

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

const row = {
  id: 'ob-1', companyId: 'tenant-a', originType: 'MANUAL', originId: 'origin-1',
  categoryId: 'cat-1', description: 'Teste', originalAmount: '100.50', discountAmount: '0',
  fineAmount: '0', interestAmount: '0', updatedAmount: '100.50', paidAmount: '0',
  balanceAmount: '100.50', dueDate: '2026-08-20T00:00:00.000Z', competenceDate: '2026-08-18T00:00:00.000Z',
  status: 'PENDING', idempotencyKey: 'idem-1'
};

async function run() {
  let passed = 0;
  try {
    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const receivables = await FinanceObligationClient.listReceivables();
    assert(calls[0].url === '/api/finance/receivables', 'receivable list URL');
    assert(calls[0].init?.credentials === 'include', 'receivable list credentials');
    assert(receivables[0].originalAmount === 100.5 && receivables[0].dueDate === '2026-08-20', 'receivable normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.createReceivable({ originType: 'MANUAL', originId: 'o', categoryId: 'c', description: 'd', totalAmount: 10, dueDate: '2026-08-20' });
    const rb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(calls[0].init?.credentials === 'include', 'receivable create credentials');
    assert(!('companyId' in rb) && !('userId' in rb) && !('userName' in rb), 'receivable identity must not come from browser');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.cancelReceivable('ar/1', 'reason');
    assert(calls[0].url === '/api/finance/receivables/ar%2F1/cancel', 'receivable cancel URL');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const payables = await FinanceObligationClient.listPayables();
    assert(calls[0].url === '/api/finance/payables', 'payable list URL');
    assert(payables[0].balanceAmount === 100.5, 'payable normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [row] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.createPayable({ originType: 'MANUAL', originId: 'o', categoryId: 'c', description: 'd', totalAmount: 10, dueDate: '2026-08-20' });
    const pb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(!('companyId' in pb) && !('userId' in pb) && !('userName' in pb), 'payable identity must not come from browser');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceObligationClient.cancelPayable('ap-1', 'reason');
    assert(calls[0].init?.credentials === 'include', 'payable cancel credentials');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let closed = false;
    try { await FinanceObligationClient.listReceivables(); } catch (error) { closed = error instanceof FinanceObligationApiError && error.status === 401; }
    assert(closed, '401 must fail closed without local fallback');
    passed++;

    console.log(`FinanceObligationClient ${passed}/7 PASS`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
