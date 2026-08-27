import assert from 'node:assert/strict';
import { BankReconciliationClient, BankReconciliationApiError } from '../bankReconciliationClient';

const entry = {
  id: 'entry-1', companyId: 'company-a', financialAccountId: 'acc-1', date: '2026-08-27',
  description: 'PIX motorista', amount: '450.00', direction: 'CREDIT', importSource: 'MANUAL_UI',
  status: 'UNMATCHED', createdAt: '2026-08-27T12:00:00Z', updatedAt: '2026-08-27T12:00:00Z',
};
const transaction = {
  id: 'tx-1', companyId: 'company-a', financialAccountId: 'acc-1', type: 'INCOME', amount: '450.00',
  transactionDate: '2026-08-27T00:00:00Z', description: 'Recebimento contrato', isReversed: false,
};

export async function runBankReconciliationClientTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let calls: Array<{ url: string; init?: RequestInit }> = [];
  let responder: (url: string, init?: RequestInit) => Promise<Response>;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return await responder(url, init);
  };

  try {
    responder = async () => new Response(JSON.stringify({ items: [entry] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const list = await BankReconciliationClient.listEntries('acc/1', 'UNMATCHED');
    assert.equal(calls[0].url, '/api/finance/bank-reconciliation/entries?financialAccountId=acc%2F1&status=UNMATCHED');
    assert.equal(calls[0].init?.credentials, 'include');
    assert.equal(list[0].amount, 450);
    assert.doesNotMatch(calls[0].url, /companyId|userId|userName/);

    responder = async () => new Response(JSON.stringify({ items: [{ statementEntry: entry, candidates: [{ transaction, confidence: 'EXACT' }], bestMatch: transaction }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const suggestions = await BankReconciliationClient.suggestions('acc-1');
    assert.equal(suggestions[0].bestMatch?.id, 'tx-1');
    assert.equal(suggestions[0].candidates[0].confidence, 'EXACT');

    responder = async () => new Response(JSON.stringify({ imported: [entry], skippedDuplicates: 0 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await BankReconciliationClient.importEntries('acc-1', [{ date: '2026-08-27', description: 'PIX motorista', amount: 450, direction: 'CREDIT' }]);
    const importBody = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert.equal(calls[0].url, '/api/finance/bank-reconciliation/import');
    assert.equal(importBody.financialAccountId, 'acc-1');
    assert.ok(Array.isArray(importBody.entries));
    assert.ok(!('companyId' in importBody) && !('userId' in importBody) && !('userName' in importBody));

    responder = async () => new Response(JSON.stringify({ item: { ...entry, status: 'MATCHED', matchedTransactionId: 'tx-1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await BankReconciliationClient.match('entry/1', 'tx-1');
    assert.equal(calls[0].url, '/api/finance/bank-reconciliation/entries/entry%2F1/match');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { transactionId: 'tx-1' });

    responder = async () => new Response(JSON.stringify({ item: { ...entry, status: 'UNMATCHED' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await BankReconciliationClient.unmatch('entry-1', 'review');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { reason: 'review' });

    responder = async () => new Response(JSON.stringify({ item: { ...entry, status: 'IGNORED' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    await BankReconciliationClient.ignore('entry-1');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {});

    responder = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    let failedClosed = false;
    try { await BankReconciliationClient.listEntries(); } catch (error) { failedClosed = error instanceof BankReconciliationApiError && error.status === 403; }
    assert.equal(failedClosed, true);

    responder = async () => new Response(JSON.stringify({ items: [{ id: 'bad' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let invalid = false;
    try { await BankReconciliationClient.listEntries(); } catch { invalid = true; }
    assert.equal(invalid, true);

    console.log('BankReconciliationClient 8/8 PASS');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
