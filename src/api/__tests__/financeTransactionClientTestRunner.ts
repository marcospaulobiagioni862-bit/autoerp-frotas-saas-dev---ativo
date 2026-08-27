import {
  FinanceTransactionApiError,
  FinanceTransactionClient,
  createTransferIdempotencyKey,
  createReversalIdempotencyKey,
} from '../financeTransactionClient';

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

const txPayload = {
  id: 'tx-1',
  companyId: 'company-a',
  financialAccountId: 'acc-a',
  destinationAccountId: 'acc-b',
  receivableId: 'rec-1',
  type: 'TRANSFER',
  amount: '55.25',
  paymentMethodId: 'pm-a',
  transactionDate: '2026-08-18T00:00:00.000Z',
  competenceDate: '2026-08-18T00:00:00.000Z',
  description: 'Transferência',
  isReversed: false,
  createdById: 'user-a',
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

async function run() {
  let passed = 0;
  try {
    responder = async () => new Response(JSON.stringify({ items: [txPayload] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const list = await FinanceTransactionClient.listTransactions();
    assert(calls[0].url === '/api/finance/transactions', 'list URL');
    assert(calls[0].init?.credentials === 'include', 'list credentials');
    assert(list[0].amount === 55.25 && list[0].transactionDate === '2026-08-18', 'list normalization');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [txPayload] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const history = await FinanceTransactionClient.listByObligation('RECEIVABLE', 'rec/1');
    assert(calls[0].url === '/api/finance/transactions/by-obligation?receivableId=rec%2F1', 'receivable history URL');
    assert(calls[0].init?.credentials === 'include', 'receivable history credentials');
    assert(!/companyId=|userId=|userName=/.test(calls[0].url), 'history request must not send browser authority');
    assert(history[0].receivableId === 'rec-1', 'history normalization');
    passed++;

    calls = [];
    await FinanceTransactionClient.listByObligation('PAYABLE', 'pay-1');
    assert(calls[0].url === '/api/finance/transactions/by-obligation?payableId=pay-1', 'payable history URL');
    passed++;

    let invalidObligation = false;
    try { await FinanceTransactionClient.listByObligation('RECEIVABLE', '   '); } catch { invalidObligation = true; }
    assert(invalidObligation && calls.length === 1, 'blank obligation id must fail before fetch');
    passed++;

    responder = async (url) => {
      assert(url === '/api/finance/settlement-options', 'options endpoint reuse');
      return new Response(JSON.stringify({ accounts: [], paymentMethods: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    calls = [];
    await FinanceTransactionClient.getOptions();
    assert(calls[0].init?.credentials === 'include', 'options credentials');
    passed++;

    responder = async () => new Response(JSON.stringify({ item: txPayload }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceTransactionClient.transfer({
      sourceAccountId: 'acc-a',
      destinationAccountId: 'acc-b',
      amount: 55.25,
      transferDate: '2026-08-18',
      paymentMethodId: 'pm-a',
      description: 'Internal transfer',
      idempotencyKey: 'transfer-client-test-key',
    });
    assert(calls[0].url === '/api/finance/transfers', 'transfer URL');
    const transferBody = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(transferBody.sourceAccountId === 'acc-a' && transferBody.destinationAccountId === 'acc-b', 'transfer body');
    assert(transferBody.idempotencyKey === 'transfer-client-test-key', 'transfer idempotency key');
    assert(!('companyId' in transferBody) && !('userId' in transferBody) && !('userName' in transferBody), 'transfer identity must not come from browser');
    assert(calls[0].init?.credentials === 'include', 'transfer credentials');
    const transferKeyA = createTransferIdempotencyKey();
    const transferKeyB = createTransferIdempotencyKey();
    assert(transferKeyA.startsWith('transfer-'), 'generated transfer key prefix');
    assert(transferKeyA !== transferKeyB, 'generated transfer keys must differ');
    passed++;

    const reversalKey = 'reversal-client-test-key';
    responder = async () => new Response(JSON.stringify({ item: { ...txPayload, type: 'REVERSAL', destinationAccountId: 'acc-b' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await FinanceTransactionClient.reverse('tx/1', {
      reversalAmount: 25,
      reason: 'Correção',
      idempotencyKey: reversalKey,
    });
    assert(calls[0].url === '/api/finance/transactions/tx%2F1/reverse', 'reversal URL');
    const reversalBody = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert(
      reversalBody.reversalAmount === 25 &&
      reversalBody.reason === 'Correção' &&
      reversalBody.idempotencyKey === reversalKey,
      'reversal body'
    );
    assert(!('companyId' in reversalBody) && !('userId' in reversalBody) && !('userName' in reversalBody), 'reversal identity must not come from browser');
    assert(calls[0].init?.credentials === 'include', 'reversal credentials');
    passed++;

    const generatedKeyA = createReversalIdempotencyKey();
    const generatedKeyB = createReversalIdempotencyKey();
    assert(generatedKeyA.startsWith('reversal-'), 'generated reversal key prefix');
    assert(generatedKeyA !== generatedKeyB, 'generated reversal keys must differ');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let failedClosed = false;
    try { await FinanceTransactionClient.listTransactions(); } catch (error) { failedClosed = error instanceof FinanceTransactionApiError && error.status === 401; }
    assert(failedClosed, '401 must fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    failedClosed = false;
    try {
      await FinanceTransactionClient.transfer({
        sourceAccountId: 'a',
        destinationAccountId: 'b',
        amount: 1,
        transferDate: '2026-08-18',
        paymentMethodId: 'm',
        description: 'x',
        idempotencyKey: 'transfer-forbidden-test-key',
      });
    } catch (error) { failedClosed = error instanceof FinanceTransactionApiError && error.status === 403; }
    assert(failedClosed, '403 must fail closed');
    passed++;

    responder = async () => new Response(JSON.stringify({ items: [{ id: 'bad' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let invalid = false;
    try { await FinanceTransactionClient.listTransactions(); } catch { invalid = true; }
    assert(invalid, 'invalid response must fail closed');
    passed++;

    responder = async () => { throw new Error('network down'); };
    let networkClosed = false;
    try { await FinanceTransactionClient.listTransactions(); } catch (error) { networkClosed = error instanceof Error && error.message === 'network down'; }
    assert(networkClosed, 'network error must propagate without local fallback');
    passed++;

    console.log(`FinanceTransactionClient ${passed}/12 PASS`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
