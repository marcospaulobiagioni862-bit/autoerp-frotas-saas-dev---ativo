import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AccountPayable } from '../../../types/entities';
import { ObligationStatus, OriginType } from '../../../types/enums';
import { firstUnpaidPreviousInstallment, payableInstallmentOrderMessage } from '../payableInstallmentOrder';

function payable(number: number, patch: Partial<AccountPayable> = {}): AccountPayable {
  return {
    id: `pay-${number}`, companyId: 'company-a', originType: OriginType.MANUAL,
    originId: 'purchase-a', categoryId: 'category', description: `Parcel ${number}`,
    originalAmount: 100, discountAmount: 0, fineAmount: 0, interestAmount: 0,
    updatedAmount: 100, paidAmount: 0, balanceAmount: 100,
    dueDate: '2026-09-22', competenceDate: '2026-09-22', status: ObligationStatus.PENDING,
    installmentGroupId: 'group-a', installmentNumber: number, totalInstallments: 2,
    idempotencyKey: `key-${number}`, createdAt: '2026-09-22', updatedAt: '2026-09-22',
    ...patch,
  };
}

const first = payable(1);
const second = payable(2);
assert.equal(firstUnpaidPreviousInstallment(first, [first, second]), undefined, 'first installment is payable');
assert.equal(firstUnpaidPreviousInstallment(second, [first, second])?.id, first.id, 'open first blocks second');
assert.equal(payableInstallmentOrderMessage(first), 'Quite primeiro a parcela 1/2');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { paidAmount: 50, balanceAmount: 50, status: ObligationStatus.PARTIALLY_PAID })])?.id, first.id, 'partial payment blocks');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { paidAmount: 99.99, balanceAmount: 0.01, status: ObligationStatus.PARTIALLY_PAID })])?.id, first.id, 'one cent balance blocks');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { paidAmount: 100, balanceAmount: 0, status: ObligationStatus.PAID })]), undefined, 'settled first releases second');
assert.equal(firstUnpaidPreviousInstallment(payable(1, { installmentGroupId: undefined, installmentNumber: undefined }), [first]), undefined, 'standalone title is unaffected');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { installmentGroupId: 'group-b' })]), undefined, 'different groups do not interfere');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { companyId: 'company-b' })]), undefined, 'different companies do not interfere');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { status: ObligationStatus.CANCELLED, cancelledAt: '2026-09-22' })]), undefined, 'documented cancellation removes obligation despite historical balance');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { status: ObligationStatus.CANCELLED })])?.id, first.id, 'inconsistent cancellation with balance remains blocked');
assert.equal(firstUnpaidPreviousInstallment(second, [payable(1, { paidAmount: 0, balanceAmount: 100, status: ObligationStatus.PENDING })])?.id, first.id, 'reversal restoring balance blocks again');

const ui = readFileSync(new URL('../../../components/finance/PayablesView.tsx', import.meta.url), 'utf8');
assert.match(ui, /isPending && !blockingInstallment/);
assert.match(ui, /isPending && blockingInstallment/);
assert.match(ui, /payableInstallmentOrderMessage\(blockingInstallment\)/);

console.log('Payable installment order rules and UI: PASS');
