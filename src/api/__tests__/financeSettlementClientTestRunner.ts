import { FinanceSettlementApiError, FinanceSettlementClient } from '../financeSettlementClient';

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

const optionsPayload = {
  accounts: [{ id: 'acc-1', name: 'Banco', type: 'BANK', currentBalance: '123.45', status: 'ACTIVE' }],
  paymentMethods: [{ id: 'pm-1', name: 'PIX', active: true }],
};

async function run() {
  let passed = 0;
  try {
    responder = async () => new Response(JSON.stringify(optionsPayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const options = await FinanceSettlementClient.getOptions();
    assert(calls[0].url === '/api/finance/settlement-options', 'options URL');
    assert(calls[0].init?.credentials === 'include', 'options credentials');
    assert(options.accounts[0].currentBalance === 123.45 && options.paymentMethods[0].name === 'PIX', 'options normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: {}, transaction: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceSettlementClient.registerReceipt('ar/1', { financialAccountId: 'acc-1', paymentMethodId: 'pm-1', paymentAmount: 50, paymentDate: '2026-08-18', description: 'receipt' });
    assert(calls[0].url === '/api/finance/receivables/ar%2F1/receipt', 'receipt URL');
    const rb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(!('companyId' in rb) && !('userId' in rb) && !('userName' in rb), 'receipt identity must not come from browser');
    assert(calls[0].init?.credentials === 'include', 'receipt credentials');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: {}, transaction: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceSettlementClient.registerPayment('ap-1', { financialAccountId: 'acc-1', paymentMethodId: 'pm-1', paymentAmount: 40, paymentDate: '2026-08-18' });
    assert(calls[0].url === '/api/finance/payables/ap-1/payment', 'payment URL');
    const pb = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(!('companyId' in pb) && !('userId' in pb) && !('userName' in pb), 'payment identity must not come from browser');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let failedClosed = false;
    try { await FinanceSettlementClient.getOptions(); } catch (error) { failedClosed = error instanceof FinanceSettlementApiError && error.status === 401; }
    assert(failedClosed, '401 must fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    failedClosed = false;
    try { await FinanceSettlementClient.registerPayment('ap-1', { financialAccountId: 'a', paymentMethodId: 'm', paymentAmount: 1, paymentDate: '2026-08-18' }); } catch (error) { failedClosed = error instanceof FinanceSettlementApiError && error.status === 403; }
    assert(failedClosed, '403 must fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ accounts: [], paymentMethods: 'bad' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let invalid = false;
    try { await FinanceSettlementClient.getOptions(); } catch { invalid = true; }
    assert(invalid, 'invalid options must fail closed');
    passed++;

    responder = async () => { throw new Error('network down'); };
    let networkClosed = false;
    try { await FinanceSettlementClient.getOptions(); } catch (error) { networkClosed = error instanceof Error && error.message === 'network down'; }
    assert(networkClosed, 'network error must propagate without local fallback');
    passed++;

    console.log(`FinanceSettlementClient ${passed}/7 PASS`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
