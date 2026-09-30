import type { ITransactionContext } from './ITransactionContext';
import type { AccountPayable, TrafficTicket } from '../../types/entities';
import { OriginType } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';

export interface TrafficTicketDiscountSettlementInput {
  companyId: string;
  paymentAmount: number;
  paymentDate: string;
  fineAmount?: number;
  interestAmount?: number;
  additionalAmount?: number;
  discountAmount?: number;
}

interface TrafficTicketRepositoryPort {
  findByIdForCompany(companyId: string, id: string): Promise<TrafficTicket | null>;
}

type TrafficTicketAwareTransactionContext = ITransactionContext & {
  getTrafficTicketRepo?: () => TrafficTicketRepositoryPort;
};

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
}

function dateKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function canonicalTicketId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/:v\d+$/, '');
}

/**
 * Derives the only discount that an authoritative TRAFFIC_TICKET_COMPANY
 * settlement may apply. Generic/non-ticket settlements keep their existing
 * behavior. For traffic tickets, caller-supplied discounts fail closed.
 *
 * The ticket discount is persisted only on the payment that exactly closes
 * the payable at the authoritative discounted target. Partial payments below
 * that target do not consume the discount early, and payments that already
 * exceed the discounted target do not manufacture refunds/negative balances.
 */
export async function resolveAuthoritativeTrafficTicketDiscount(
  payable: AccountPayable,
  params: TrafficTicketDiscountSettlementInput,
  txContext?: ITransactionContext
): Promise<number> {
  const requestedDiscount = money(params.discountAmount || 0);

  if (!txContext || payable.originType !== OriginType.TRAFFIC_TICKET_COMPANY) {
    return requestedDiscount;
  }

  if (requestedDiscount !== 0) {
    throw new Error('Desconto de multa é derivado exclusivamente dos dados autoritativos da multa');
  }

  const trafficTicketRepo = (txContext as TrafficTicketAwareTransactionContext).getTrafficTicketRepo?.();
  if (!trafficTicketRepo) {
    throw new Error('Autoridade transacional de multa indisponível para liquidação');
  }

  const ticketId = canonicalTicketId(payable.originId);
  if (!ticketId) {
    throw new Error('Conta a Pagar de multa sem origem autoritativa');
  }

  const ticket = await trafficTicketRepo.findByIdForCompany(params.companyId, ticketId);
  if (!ticket || ticket.payableId !== payable.id) {
    throw new Error('Multa autoritativa vinculada à Conta a Pagar não encontrada');
  }

  const paymentDate = dateKey(params.paymentDate);
  if (!paymentDate) {
    throw new Error('Data de pagamento inválida para desconto de multa');
  }

  const discountDeadline = dateKey(ticket.discountDueDate);
  const discountedAmount = money(ticket.discountedAmount);
  const ticketOriginalAmount = money(ticket.originalAmount);
  const payableOriginalAmount = money(payable.originalAmount);

  if (!discountDeadline || discountedAmount <= 0 || discountedAmount >= payableOriginalAmount) {
    return 0;
  }

  if (ticketOriginalAmount !== payableOriginalAmount) {
    throw new Error('Valor original da multa diverge da Conta a Pagar autoritativa');
  }

  if (paymentDate > discountDeadline) {
    return 0;
  }

  // Do not stack a newly derived ticket discount over an already-adjusted
  // historical payable. A non-zero persisted discount is treated as an
  // existing authoritative adjustment and is left untouched.
  if (money(payable.discountAmount) > 0) {
    return 0;
  }

  const ticketDiscount = roundCurrency(payableOriginalAmount - discountedAmount);
  const targetAmount = roundCurrency(
    payableOriginalAmount
      + money(payable.fineAmount)
      + money(params.fineAmount)
      + money(payable.interestAmount)
      + money(params.interestAmount)
      + money(payable.additionalAmount)
      + money(params.additionalAmount)
      - ticketDiscount
  );
  const remainingAtDiscountTarget = roundCurrency(targetAmount - money(payable.paidAmount));

  if (remainingAtDiscountTarget <= 0) {
    return 0;
  }

  return money(params.paymentAmount) === remainingAtDiscountTarget ? ticketDiscount : 0;
}
