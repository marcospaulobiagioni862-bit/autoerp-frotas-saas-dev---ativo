import assert from 'node:assert/strict';
import { reverseSettlementState, type SettlementComposition, type SettlementState } from '../settlementComposition';
import { ObligationStatus } from '../../../types/enums';

const before: SettlementState = { fineAmount: 0, interestAmount: 350, additionalAmount: 0, discountAmount: 0, updatedAmount: 1350, paidAmount: 902, balanceAmount: 448, status: ObligationStatus.PARTIALLY_PAID };
const applied = { fineAmount: 10, interestAmount: 5, additionalAmount: 2, discountAmount: 3 };
const after: SettlementState = { ...before, ...applied, interestAmount: 355, updatedAmount: 1364, paidAmount: 1002, balanceAmount: 362 };
const composition: SettlementComposition = { version: 1, transactionId: 'audit-payment', obligationId: 'audit-title', financialAccountId: 'audit-account', requested: applied, applied, movementAmount: 100, balanceReduction: 86, before, after };
assert.deepEqual(reverseSettlementState(after, composition, 100, 0), before);
assert.throws(() => reverseSettlementState(after, composition, 50, 0), /estorno integral/);
const following = { ...after, paidAmount: 1364, balanceAmount: 0, status: ObligationStatus.PAID };
const followingComposition = { ...composition, applied: { fineAmount: 0, interestAmount: 0, additionalAmount: 0, discountAmount: 0 }, movementAmount: 362, balanceReduction: 362, before: after, after: following };
assert.deepEqual(reverseSettlementState(following, followingComposition, 362, 0), after);
assert.deepEqual(reverseSettlementState(reverseSettlementState(following, followingComposition, 362, 0), composition, 100, 0), before);
console.log('PASS adjusted reversal: exact title/adjustments/residual, successive reversal and partial rejection');
