import assert from 'node:assert/strict';
import { SettlementService } from '../SettlementService';
import { DepositService } from '../DepositService';
import { ObligationStatus, OriginType } from '../../../types/enums';
import type { ITransactionContext } from '../ITransactionContext';

// Real settlement/auth/period/audit services, with in-memory repository ports.
// No database, DDL, network, or simulated claim of PostgreSQL concurrency coverage.
function fixture(kind: 'receipt' | 'payment', originType = OriginType.MANUAL) {
  let obligation: any = {
    id: `title-${kind}`, companyId: 'tenant-a', originType, originId: 'origin-a',
    contractId: kind === 'receipt' ? 'contract-a' : undefined,
    categoryId: 'category-a', description: 'P0 obligation', originalAmount: 100,
    fineAmount: 0, interestAmount: 0, additionalAmount: 0, discountAmount: 0, updatedAmount: 100,
    paidAmount: 0, balanceAmount: 100, status: ObligationStatus.PENDING,
    competenceDate: '2026-09-01', dueDate: '2026-09-01',
  };
  const account = { id: 'account-a', companyId: 'tenant-a', status: 'ACTIVE', currentBalance: 1000 };
  const method = { id: 'method-a', companyId: 'tenant-a', active: true };
  const transactions: any[] = [], audits: any[] = [], depositMovements: any[] = [];
  let deposit: any = null;
  const contract = {
    id: 'contract-a', companyId: 'tenant-a', driverId: 'driver-a', vehicleId: 'vehicle-a',
    securityDepositAmount: 100, isArchived: false,
  };
  const repo = {
    update: async (_id: string, data: any) => (obligation = { ...obligation, ...data }),
    findByContractId: async (_id: string) => [obligation],
  };
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
    findSettlementComposition: async (id: string) => {
      const entry = audits.find(a => a.entityName === 'FinancialSettlement' && a.entityId === id);
      return entry ? JSON.parse(entry.newState) : null;
    },
    getTransactionRepo: () => ({ create: async (value: any) => { transactions.push(value); return value; } }),
    getAccountRepo: () => ({ updateBalance: async (_id: string, delta: number) => { account.currentBalance += delta; } }),
    getAuditLogRepo: () => ({ create: async (value: any) => { audits.push(value); return value; } }),
    getContractRepo: () => ({
      findByIdForCompanyWithLock: async (_companyId: string, id: string) => id === contract.id ? contract : null,
      findByIdForCompany: async (_companyId: string, id: string) => id === contract.id ? contract : null,
    }),
    getSecurityDepositRepo: () => ({
      lockContract: async () => undefined,
      findByContractId: async () => deposit,
      create: async (value: any) => (deposit = value),
      update: async (_id: string, value: any) => (deposit = { ...deposit, ...value }),
    }),
    getSecurityDepositMovementRepo: () => ({
      findByFinancialTransactionId: async (transactionId: string) => depositMovements.find((item) => item.financialTransactionId === transactionId) || null,
      create: async (value: any) => { depositMovements.push(value); return value; },
    }),
  } as unknown as ITransactionContext;
  const settle = (paymentAmount: number, idempotencyKey: string, adjustments: Record<string, number | boolean> = {}) => {
    const params = { companyId: 'tenant-a', obligationId: obligation.id, financialAccountId: account.id,
      paymentMethodId: method.id, paymentAmount, idempotencyKey, paymentDate: '2026-09-24',
      userId: 'admin-a', userName: 'Admin', ...adjustments };
    return kind === 'receipt' ? SettlementService.registerReceipt(params, tx) : SettlementService.registerPayment(params, tx);
  };
  return { get obligation() { return obligation; }, get deposit() { return deposit; }, account, method, transactions, audits, depositMovements, settle, tx, contract };
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
  assert.equal(f.audits.length, 4, 'two committed commands each require title history and transaction composition; retry/rejection add none');
  assert.equal(f.audits.filter(a => a.entityName !== 'FinancialSettlement').length, 2);
  assert.deepEqual(f.audits.filter(a => a.entityName === 'FinancialSettlement').map(a => a.entityId), f.transactions.map(t => t.id));
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
  if (origin === OriginType.SECURITY_DEPOSIT) {
    assert.equal(f.deposit.receivedAmount, 100);
    assert.equal(f.depositMovements.length, 1);
    assert.equal(f.depositMovements[0].financialTransactionId, movement.id);
    assert.equal(f.depositMovements[0].receivableId, f.obligation.id);
    await f.settle(100, 'receipt');
    assert.equal(f.depositMovements.length, 1, 'retry cannot duplicate deposit ledger movement');
  }
  console.log(`PASS traceability: transaction -> receivable -> ${origin} / contract-a`);
}

{
  const f = fixture('receipt', OriginType.SECURITY_DEPOSIT);
  f.obligation.paidAmount = 100;
  f.obligation.balanceAmount = 0;
  f.obligation.status = ObligationStatus.PAID;
  const derived = await DepositService.getSecurityDepositByContract('tenant-a', 'contract-a', 'admin-a', f.tx);
  assert.equal(derived?.receivedAmount, 100);
  assert.equal(derived?.status, 'RECEIVED');
  assert.match(String(derived?.id), /^derived-contract-a$/);
  console.log('PASS historical reconciliation: paid deposit receivable is read as received without duplicate cash');
}

for (const kind of ['receipt', 'payment'] as const) {
  const partial = fixture(kind);
  const first = await partial.settle(50, 'adjusted-partial', { interestAmount: 10, additionalAmount: 5 });
  assert.equal(partial.obligation.updatedAmount, 115);
  assert.equal(partial.obligation.paidAmount, 50);
  assert.equal(partial.obligation.balanceAmount, 65);
  const firstComposition = await (partial.tx as any).findSettlementComposition(first.transaction.id);
  assert.equal(firstComposition.principalLiquidated, 35);
  const second = await partial.settle(65, 'adjusted-final');
  assert.equal(partial.obligation.status, ObligationStatus.PAID);
  assert.equal(partial.obligation.balanceAmount, 0);
  const secondComposition = await (partial.tx as any).findSettlementComposition(second.transaction.id);
  assert.equal(secondComposition.principalLiquidated, null, 'carried adjustments stay auditable without blocking a follow-up settlement');
  console.log(`PASS ${kind}: adjusted partial can be completed without inventing carried principal allocation`);

  const f = fixture(kind);
  const result = await f.settle(133, 'adjusted', { fineAmount: 5, interestAmount: 24, additionalAmount: 7, discountAmount: 3 });
  assert.equal(f.obligation.originalAmount, 100);
  assert.equal(f.obligation.fineAmount, 5);
  assert.equal(f.obligation.interestAmount, 24);
  assert.equal(f.obligation.additionalAmount, 7);
  assert.equal(f.obligation.discountAmount, 3);
  assert.equal(f.obligation.updatedAmount, 133);
  assert.equal(f.obligation.paidAmount, 133);
  assert.equal(f.obligation.balanceAmount, 0);
  const composition = await (f.tx as any).findSettlementComposition(result.transaction.id);
  assert.equal(composition.principalLiquidated, 100);
  assert.deepEqual(composition.applied, { fineAmount: 5, interestAmount: 24, additionalAmount: 7, discountAmount: 3 });
  await f.settle(133, 'adjusted', { fineAmount: 5, interestAmount: 24, additionalAmount: 7, discountAmount: 3 });
  assert.equal(f.transactions.length, 1, 'retry cannot duplicate an adjusted settlement');
  await assert.rejects(f.settle(133, 'adjusted', { fineAmount: 5, interestAmount: 24, additionalAmount: 8, discountAmount: 3 }), /idempotência/);
  console.log(`PASS ${kind}: explicit fine, interest, additional amount and discount remain separated`);
}
