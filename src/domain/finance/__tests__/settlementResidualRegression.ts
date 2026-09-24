import assert from 'node:assert/strict';
import { SettlementService } from '../SettlementService';
import { ObligationStatus, OriginType } from '../../../types/enums';
import type { ITransactionContext } from '../ITransactionContext';

// Real settlement/auth/period/audit services, with in-memory repository ports.
// No database, DDL, network, or simulated claim of PostgreSQL concurrency coverage.
function fixture(kind: 'receipt' | 'payment', originType = OriginType.MANUAL) {
  let obligation: any = {
    id: `title-${kind}`, companyId: 'tenant-a', originType, originId: 'origin-a',
    contractId: kind === 'receipt' ? 'contract-a' : undefined,
    categoryId: 'category-a', description: 'P0 obligation', originalAmount: 100,
    fineAmount: 0, interestAmount: 0, discountAmount: 0, updatedAmount: 100,
    paidAmount: 0, balanceAmount: 100, status: ObligationStatus.PENDING,
    competenceDate: '2026-09-01', dueDate: '2026-09-01',
  };
  const account = { id: 'account-a', companyId: 'tenant-a', status: 'ACTIVE', currentBalance: 1000 };
  const method = { id: 'method-a', companyId: 'tenant-a', active: true };
  const transactions: any[] = [], audits: any[] = [];
  const repo = { update: async (_id: string, data: any) => (obligation = { ...obligation, ...data }) };
  const tx = {
    getUserRepo: () => ({ findById: async () => ({ id: 'admin-a', companyId: 'tenant-a', active: true, role: 'ADMIN' }) }),
    getFinancialPeriodRepo: () => ({ findAll: async () => [] }),
    getPaymentMethodRepo: () => ({ findById: async () => method }),
    getReceivableRepo: () => repo,
    getPayableRepo: () => repo,
    findReceivableByIdWithLock: async () => obligation,
    findPayableByIdWithLock: async () => obligation,
    findPreviousPayableInstallmentsForUpdate: async () => [],
    findFinancialAccountByIdWithLock: async () => account,
    findFinancialTransactionByIdempotencyKey: async (key: string) => transactions.find(t => t.idempotencyKey === key),
    getTransactionRepo: () => ({ create: async (value: any) => { transactions.push(value); return value; } }),
    getAccountRepo: () => ({ updateBalance: async (_id: string, delta: number) => { account.currentBalance += delta; } }),
    getAuditLogRepo: () => ({ create: async (value: any) => { audits.push(value); return value; } }),
  } as unknown as ITransactionContext;
  const settle = (paymentAmount: number, idempotencyKey: string) => {
    const params = { companyId: 'tenant-a', obligationId: obligation.id, financialAccountId: account.id,
      paymentMethodId: method.id, paymentAmount, idempotencyKey, paymentDate: '2026-09-24',
      userId: 'admin-a', userName: 'Admin' };
    return kind === 'receipt' ? SettlementService.registerReceipt(params, tx) : SettlementService.registerPayment(params, tx);
  };
  return { get obligation() { return obligation; }, account, method, transactions, audits, settle };
}

for (const kind of ['receipt', 'payment'] as const) {
  const f = fixture(kind);
  await f.settle(99.99, 'partial');
  assert.equal(f.obligation.status, ObligationStatus.PARTIALLY_PAID);
  assert.equal(f.obligation.balanceAmount, .01);
  assert.equal(f.obligation.paidAmount, 99.99);
  assert.equal(f.obligation.updatedAmount, 100);
  await f.settle(99.99, 'partial');
  assert.equal(f.transactions.length, 1, 'retry cannot duplicate the partial settlement');
  await assert.rejects(f.settle(.02, 'overpayment'), /excede/);
  assert.equal(f.obligation.balanceAmount, .01);
  await f.settle(.01, 'final');
  assert.equal(f.obligation.status, ObligationStatus.PAID);
  assert.equal(f.obligation.balanceAmount, 0);
  assert.equal(f.obligation.paidAmount, 100);
  assert.equal(f.obligation.updatedAmount, 100);
  await f.settle(.01, 'final');
  assert.equal(f.transactions.length, 2);
  assert.equal(f.audits.length, 2, 'only committed commands are audited');
  assert.equal(f.account.currentBalance, kind === 'receipt' ? 1100 : 900);
  await assert.rejects(f.settle(.01, 'extra'), /não aceita/);

  for (const target of ['account', 'method', 'obligation'] as const) {
    const foreign = fixture(kind);
    foreign[target].companyId = 'tenant-b';
    await assert.rejects(foreign.settle(10, 'foreign'), /Acesso negado/);
    assert.equal(foreign.transactions.length, 0);
    assert.equal(foreign.account.currentBalance, 1000);
    assert.equal(foreign.obligation.balanceAmount, 100);
  }
  for (const target of ['account', 'method'] as const) {
    const inactive = fixture(kind);
    if (target === 'account') inactive.account.status = 'INACTIVE';
    else inactive.method.active = false;
    await assert.rejects(inactive.settle(10, 'inactive'), /inativa/);
    assert.equal(inactive.transactions.length, 0);
  }
  const overdue = fixture(kind);
  overdue.obligation.status = ObligationStatus.OVERDUE;
  await overdue.settle(100, 'overdue');
  assert.equal(overdue.obligation.status, ObligationStatus.PAID);
  console.log(`PASS ${kind}: 99.99 + 0.01, balances, retry, overpayment, audit, scope, active options, overdue`);
}

for (const origin of [OriginType.CONTRACT_RENT, OriginType.SECURITY_DEPOSIT]) {
  const f = fixture('receipt', origin);
  await f.settle(100, 'receipt');
  const movement = f.transactions[0];
  assert.equal(movement.receivableId, f.obligation.id);
  assert.equal(movement.companyId, f.obligation.companyId);
  assert.equal(f.obligation.contractId, 'contract-a');
  assert.equal(f.obligation.originType, origin);
  assert.equal(f.obligation.originId, 'origin-a');
  console.log(`PASS traceability: transaction -> receivable -> ${origin} / contract-a`);
}
