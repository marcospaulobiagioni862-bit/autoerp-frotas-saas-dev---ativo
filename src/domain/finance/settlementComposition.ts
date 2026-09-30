import { roundCurrency } from '../../shared/utils/currency';
import { ObligationStatus } from '../../types/enums';

export type SettlementAdjustments = { fineAmount: number; interestAmount: number; additionalAmount: number; discountAmount: number };
export type SettlementState = SettlementAdjustments & { paidAmount: number; updatedAmount: number; balanceAmount: number; status: ObligationStatus };
export interface SettlementComposition {
  version: 1;
  transactionId: string;
  obligationId: string;
  dueDate?: string;
  effectiveDate?: string;
  daysOverdue?: number;
  principalLiquidated?: number | null;
  financialAccountId?: string;
  paymentMethodId?: string;
  userId?: string;
  requested: { dailyInterestAmount?: number | null; settleRemainingBalance?: boolean; fineAmount: number; interestAmount: number | null; additionalAmount?: number; discountAmount: number };
  applied: Omit<SettlementAdjustments, 'additionalAmount'> & { additionalAmount?: number };
  movementAmount: number;
  /** Net reduction of the pre-settlement balance, including the explicit discount. */
  balanceReduction: number;
  before: Omit<SettlementState, 'additionalAmount'> & { additionalAmount?: number };
  after: Omit<SettlementState, 'additionalAmount'> & { additionalAmount?: number };
}

export function adjustment(value: unknown): number {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 9999999999.99) throw new Error('Ajuste financeiro inválido');
  return roundCurrency(n);
}

export function requestedAdjustments(params: {fineAmount?: number; interestAmount?: number; additionalAmount?: number; discountAmount?: number; dailyInterestAmount?: number; settleRemainingBalance?: boolean}) {
  if (params.settleRemainingBalance !== undefined && typeof params.settleRemainingBalance !== 'boolean') throw new Error('Modalidade de liquidação inválida');
  return {
    dailyInterestAmount: params.dailyInterestAmount == null ? null : adjustment(params.dailyInterestAmount),
    settleRemainingBalance: params.settleRemainingBalance === true,
    fineAmount: adjustment(params.fineAmount),
    interestAmount: params.interestAmount == null ? null : adjustment(params.interestAmount),
    additionalAmount: adjustment(params.additionalAmount),
    discountAmount: adjustment(params.discountAmount),
  };
}

export function settlementState(value: any): SettlementState {
  return {
    fineAmount: Number(value.fineAmount),
    interestAmount: Number(value.interestAmount),
    additionalAmount: Number(value.additionalAmount ?? 0),
    discountAmount: Number(value.discountAmount),
    paidAmount: Number(value.paidAmount),
    updatedAmount: Number(value.updatedAmount),
    balanceAmount: Number(value.balanceAmount),
    status: value.status,
  };
}

/** No allocation of carried charges is inferred from aggregate paidAmount. */
export function determinePrincipalLiquidated(before: SettlementState & {originalAmount: number}, applied: SettlementAdjustments, movementAmount: number): number {
  const netAdjustments = roundCurrency(applied.fineAmount + applied.interestAmount + applied.additionalAmount - applied.discountAmount);
  const principal = roundCurrency(movementAmount - netAdjustments);
  const hasPreviousAdjustments = [before.fineAmount, before.interestAmount, before.additionalAmount, before.discountAmount].some(value => Number(value) !== 0);
  if (!hasPreviousAdjustments && principal >= 0 && principal <= Number(before.balanceAmount)) return principal;
  if (hasPreviousAdjustments && Number(before.paidAmount) === 0 && roundCurrency(movementAmount) === roundCurrency(Number(before.balanceAmount) + netAdjustments)) return Number(before.originalAmount);
  throw new Error('Principal liquidado indeterminável: composição ambígua entre principal e encargos; baixa rejeitada');
}

export function reverseSettlementState(current: SettlementState, composition: SettlementComposition, amount: number, previouslyReversed: number) {
  const appliedAdditional = Number(composition.applied.additionalAmount ?? 0);
  const hasAdjustments = [composition.applied.fineAmount, composition.applied.interestAmount, appliedAdditional, composition.applied.discountAmount].some(n => Number(n) !== 0);
  const full = roundCurrency(amount + previouslyReversed) === roundCurrency(composition.movementAmount);
  if (hasAdjustments && (!full || previouslyReversed !== 0)) throw new Error('Baixa com ajustes exige estorno integral');
  const result = { ...current };
  result.fineAmount = roundCurrency(current.fineAmount - (full ? composition.applied.fineAmount : 0));
  result.interestAmount = roundCurrency(current.interestAmount - (full ? composition.applied.interestAmount : 0));
  result.additionalAmount = roundCurrency(current.additionalAmount - (full ? appliedAdditional : 0));
  result.discountAmount = roundCurrency(current.discountAmount - (full ? composition.applied.discountAmount : 0));
  if ([result.fineAmount, result.interestAmount, result.additionalAmount, result.discountAmount].some(value => value < 0)) {
    throw new Error('Composição da baixa não corresponde mais aos ajustes do título');
  }
  result.paidAmount = roundCurrency(current.paidAmount - amount);
  result.updatedAmount = roundCurrency(current.updatedAmount - (full ? composition.applied.fineAmount + composition.applied.interestAmount + appliedAdditional - composition.applied.discountAmount : 0));
  result.balanceAmount = roundCurrency(result.updatedAmount - result.paidAmount);
  if (result.paidAmount < 0 || result.balanceAmount < 0) throw new Error('Estorno incompatível com o estado atual do título');
  const beforeAdditional = Number(composition.before.additionalAmount ?? 0);
  const matchesBefore =
    result.fineAmount === composition.before.fineAmount &&
    result.interestAmount === composition.before.interestAmount &&
    result.additionalAmount === beforeAdditional &&
    result.discountAmount === composition.before.discountAmount &&
    result.paidAmount === composition.before.paidAmount &&
    result.updatedAmount === composition.before.updatedAmount &&
    result.balanceAmount === composition.before.balanceAmount;
  result.status = matchesBefore ? composition.before.status : result.balanceAmount === 0 ? ObligationStatus.PAID : result.paidAmount > 0 ? ObligationStatus.PARTIALLY_PAID : ObligationStatus.PENDING;
  return result;
}
