import { AccountPayable } from '../../types/entities';
import { ObligationStatus } from '../../types/enums';

export function firstUnpaidPreviousInstallment(
  payable: AccountPayable,
  installments: AccountPayable[],
): AccountPayable | undefined {
  if (!payable.installmentGroupId || !payable.installmentNumber || payable.installmentNumber <= 1) return undefined;
  return installments
    .filter((item) =>
      item.companyId === payable.companyId &&
      item.installmentGroupId === payable.installmentGroupId &&
      Boolean(item.installmentNumber) &&
      item.installmentNumber! < payable.installmentNumber! &&
      Number(item.balanceAmount) > 0 &&
      !(item.status === ObligationStatus.CANCELLED && Boolean(item.cancelledAt || item.renegotiationId))
    )
    .sort((left, right) => left.installmentNumber! - right.installmentNumber!)[0];
}

export function payableInstallmentOrderMessage(previous: AccountPayable): string {
  return `Quite primeiro a parcela ${previous.installmentNumber}/${previous.totalInstallments}`;
}
