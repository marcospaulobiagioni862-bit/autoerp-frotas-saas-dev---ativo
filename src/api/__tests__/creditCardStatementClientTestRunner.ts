import assert from 'node:assert/strict';
import { CreditCardStatementClient } from '../creditCardStatementClient';

const profile = {
  id: 'profile-1',
  financial_account_id: 'card-account-1',
  credit_limit: '5000.00',
  closing_day: 20,
  due_day: 28,
  active: true,
};

const statement = {
  id: 'statement-1',
  credit_card_profile_id: 'profile-1',
  cycle_ref: '2026-08',
  closing_date: '2026-08-20',
  due_date: '2026-08-28',
  status: 'PARTIALLY_PAID',
  original_amount: '1000.00',
  adjustment_amount: '-50.00',
  interest_amount: '20.00',
  fine_amount: '10.00',
  discount_amount: '5.00',
  paid_amount: '400.00',
  balance_amount: '575.00',
  is_overdue: true,
  overdue_days: 3,
};

const detail = {
  statement,
  items: [{ id: 'item-1', financial_transaction_id: 'tx-1', payable_id: null, origin_type: 'MAINTENANCE', origin_id: 'maint-1', original_amount: '1000.00', adjustment_amount: '-50.00', final_amount: '950.00' }],
  payments: [{ id: 'payment-1', financial_transaction_id: 'tx-pay-1', amount: '400.00', created_at: '2026-08-28T10:00:00.000Z' }],
  adjustments: [{ id: 'adjustment-1', interest_amount: '20.00', fine_amount: '10.00', discount_amount: '5.00', reason: 'Atraso', created_at: '2026-08-28T11:00:00.000Z' }],
  credits: [{ id: 'credit-1', statement_item_id: 'item-1', financial_transaction_id: 'tx-1', amount: '50.00', reason: 'Crédito lojista', created_at: '2026-08-28T12:00:00.000Z' }],
};

export async function runCreditCardStatementClientTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let calls: Array<{ url: string; init?: RequestInit }> = [];
  let responder: () => Promise<Response>;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return await responder();
  };

  try {
    responder = async () => new Response(JSON.stringify({ items: [profile] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const profiles = await CreditCardStatementClient.listProfiles();
    assert.equal(calls[0].url, '/api/finance/credit-cards/profiles');
    assert.equal(calls[0].init?.credentials, 'include');
    assert.equal(profiles[0].creditLimit, 5000);
    assert.equal(profiles[0].financialAccountId, 'card-account-1');
    assert.doesNotMatch(calls[0].url, /companyId|userId|userName/);

    responder = async () => new Response(JSON.stringify({ items: [statement] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const statements = await CreditCardStatementClient.listStatements('profile/1');
    assert.equal(calls[0].url, '/api/finance/credit-cards/statements?profileId=profile%2F1');
    assert.equal(calls[0].init?.credentials, 'include');
    assert.equal(statements[0].balanceAmount, 575);
    assert.equal(statements[0].isOverdue, true);
    assert.equal(statements[0].overdueDays, 3);
    assert.equal(statements[0].interestAmount, 20);
    assert.equal(statements[0].fineAmount, 10);
    assert.equal(statements[0].discountAmount, 5);

    responder = async () => new Response(JSON.stringify(detail), { status: 200, headers: { 'Content-Type': 'application/json' } });
    calls = [];
    const loadedDetail = await CreditCardStatementClient.getStatementDetail('statement/1');
    assert.equal(calls[0].url, '/api/finance/credit-cards/statements/statement%2F1/detail');
    assert.equal(calls[0].init?.credentials, 'include');
    assert.doesNotMatch(calls[0].url, /companyId|userId|userName/);
    assert.equal(loadedDetail.statement.balanceAmount, 575);
    assert.equal(loadedDetail.items[0].originType, 'MAINTENANCE');
    assert.equal(loadedDetail.items[0].finalAmount, 950);
    assert.equal(loadedDetail.payments[0].amount, 400);
    assert.equal(loadedDetail.adjustments[0].interestAmount, 20);
    assert.equal(loadedDetail.credits[0].amount, 50);

    responder = async () => new Response(JSON.stringify({ ...detail, payments: 'invalid' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let malformedDetailRejected = false;
    try { await CreditCardStatementClient.getStatementDetail('statement-1'); } catch { malformedDetailRejected = true; }
    assert.equal(malformedDetailRejected, true);

    responder = async () => new Response(JSON.stringify({ items: [{ ...statement, is_overdue: 'true' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let malformedBooleanRejected = false;
    try { await CreditCardStatementClient.listStatements(); } catch { malformedBooleanRejected = true; }
    assert.equal(malformedBooleanRejected, true);

    responder = async () => new Response(JSON.stringify({ items: [{ ...statement, status: 'UNKNOWN' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let malformedStatusRejected = false;
    try { await CreditCardStatementClient.listStatements(); } catch { malformedStatusRejected = true; }
    assert.equal(malformedStatusRejected, true);

    responder = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    let forbiddenRejected = false;
    try { await CreditCardStatementClient.listProfiles(); } catch (error) { forbiddenRejected = error instanceof Error && error.message === 'Forbidden'; }
    assert.equal(forbiddenRejected, true);

    console.log('CreditCardStatementClient 7/7 PASS');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
