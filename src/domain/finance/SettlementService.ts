import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialTransactionRepository,
  FinancialAccountRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountReceivable, AccountPayable, FinancialTransaction, FinancialAccount } from '../../types/entities';
import { ObligationStatus, TransactionType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
import { resolveAuthoritativeTrafficTicketDiscount } from './TrafficTicketSettlementDiscount';
import { firstUnpaidPreviousInstallment, payableInstallmentOrderMessage } from './payableInstallmentOrder';

export interface SettlementParams {
  companyId: string;
  obligationId: string; // receivable or payable ID
  financialAccountId: string;
  paymentMethodId: string;
  paymentAmount: number;
  paymentDate: string;
  competenceDate?: string;
  fineAmount?: number;
  interestAmount?: number;
  discountAmount?: number;
  description?: string;
  /** Logical command key. Required on the authoritative PostgreSQL/UOW path. */
  idempotencyKey?: string;
  userId: string;
  userName: string;
}

function dateKey(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

export class SettlementService {
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();
  private static transactionRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();

  private static requireIdempotencyKey(params: SettlementParams, txContext?: ITransactionContext): string | undefined {
    const key = typeof params.idempotencyKey === 'string' ? params.idempotencyKey.trim() : '';
    if (!txContext) return key || undefined;
    if (!key || key.length > 200) {
      throw new Error('Chave de idempotência da liquidação é obrigatória e deve ter até 200 caracteres');
    }
    return key;
  }

  private static assertAuthoritativeCapabilities(txContext: ITransactionContext, kind: 'RECEIVABLE' | 'PAYABLE'): void {
    if (
      !txContext.findFinancialAccountByIdWithLock ||
      !txContext.findFinancialTransactionByIdempotencyKey ||
      (kind === 'RECEIVABLE' && !txContext.findReceivableByIdWithLock) ||
      (kind === 'PAYABLE' && (!txContext.findPayableByIdWithLock || !txContext.findPreviousPayableInstallmentsForUpdate))
    ) {
      throw new Error('Autoridade transacional de liquidação indisponível');
    }
  }

  private static assertRetryMatches(
    existing: FinancialTransaction,
    params: SettlementParams,
    expectedType: TransactionType,
    obligationKind: 'RECEIVABLE' | 'PAYABLE',
    competenceDate: string,
    description: string
  ): void {
    const obligationMatches = obligationKind === 'RECEIVABLE'
      ? existing.receivableId === params.obligationId && !existing.payableId
      : existing.payableId === params.obligationId && !existing.receivableId;

    const matches =
      existing.companyId === params.companyId &&
      existing.type === expectedType &&
      obligationMatches &&
      existing.financialAccountId === params.financialAccountId &&
      existing.paymentMethodId === params.paymentMethodId &&
      roundCurrency(Number(existing.amount)) === roundCurrency(params.paymentAmount) &&
      dateKey(existing.transactionDate) === dateKey(params.paymentDate) &&
      dateKey(existing.competenceDate) === dateKey(competenceDate) &&
      existing.description === description;

    if (!matches) {
      throw new Error('Chave de idempotência reutilizada com comando de liquidação diferente');
    }
  }

  private static async validatePaymentMethod(params: SettlementParams, txContext?: ITransactionContext): Promise<void> {
    if (!txContext) return;
    const paymentMethodRepo = txContext.getPaymentMethodRepo?.();
    if (!paymentMethodRepo) {
      throw new Error('Forma de pagamento indisponível no contexto transacional');
    }
    const paymentMethod = await paymentMethodRepo.findById(params.paymentMethodId);
    if (!paymentMethod) throw new Error('Forma de pagamento não encontrada');
    if (!paymentMethod.companyId || paymentMethod.companyId !== params.companyId) {
      throw new Error('Acesso negado: Forma de pagamento pertence a outra empresa ou tenant inválido');
    }
    if (paymentMethod.active === false) {
      throw new Error('Forma de pagamento inativa');
    }
  }

  private static async getLockedAccount(params: SettlementParams, txContext?: ITransactionContext): Promise<FinancialAccount> {
    let account: FinancialAccount | null;
    if (txContext) {
      if (!txContext.findFinancialAccountByIdWithLock) {
        throw new Error('Autoridade transacional de conta financeira indisponível');
      }
      account = await txContext.findFinancialAccountByIdWithLock(params.financialAccountId);
    } else {
      account = await this.accountRepo.findByIdForCompany(params.financialAccountId, params.companyId);
    }

    if (!account) throw new Error('Conta financeira não encontrada');
    if (!account.companyId || account.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta financeira pertence a outra empresa ou tenant inválido');
    }
    if (account.status !== 'ACTIVE') {
      throw new Error('Conta financeira inativa');
    }
    return account;
  }

  public static async registerReceipt(params: SettlementParams, txContext?: ITransactionContext): Promise<{
    receivable: AccountReceivable;
    transaction: FinancialTransaction;
  }> {
    await FinancialAuthorizationService.authorize(
      params.userId,
      params.companyId,
      'RECEIPT_REGISTER',
      txContext
    );

    if (!Number.isFinite(params.paymentAmount) || params.paymentAmount <= 0) {
      throw new Error('Valor da liquidação deve ser maior que zero');
    }
    if (!params.financialAccountId || !params.paymentMethodId || !params.paymentDate) {
      throw new Error('Conta financeira, forma de pagamento e data são obrigatórias');
    }

    const idempotencyKey = this.requireIdempotencyKey(params, txContext);
    if (txContext) this.assertAuthoritativeCapabilities(txContext, 'RECEIVABLE');

    let receivable: AccountReceivable | null;
    if (txContext) {
      receivable = await txContext.findReceivableByIdWithLock!(params.obligationId);
    } else {
      receivable = await this.receivableRepo.findByIdForCompany(params.obligationId, params.companyId);
    }

    if (!receivable) throw new Error('Conta a Receber não encontrada');
    if (!receivable.companyId || receivable.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta a Receber pertence a outra empresa ou tenant inválido');
    }

    const competenceDate = params.competenceDate || receivable.competenceDate;
    const description = params.description || `Recebimento: ${receivable.description}`;

    if (txContext && idempotencyKey) {
      const existing = await txContext.findFinancialTransactionByIdempotencyKey!(idempotencyKey);
      if (existing) {
        this.assertRetryMatches(
          existing,
          params,
          TransactionType.INCOME,
          'RECEIVABLE',
          competenceDate,
          description
        );
        return { receivable, transaction: existing };
      }
    }

    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);
    await this.getLockedAccount(params, txContext);
    await this.validatePaymentMethod(params, txContext);

    if (receivable.status === ObligationStatus.PAID || receivable.status === ObligationStatus.CANCELLED) {
      throw new Error(`Título em status ${receivable.status} não aceita recebimento`);
    }

    const fine = params.fineAmount || 0;
    const interest = params.interestAmount || 0;
    const discount = params.discountAmount || 0;

    const newFineAmount = Number(receivable.fineAmount) + fine;
    const newInterestAmount = Number(receivable.interestAmount) + interest;
    const newDiscountAmount = Number(receivable.discountAmount) + discount;

    const updatedAmount = roundCurrency(
      Number(receivable.originalAmount) + newFineAmount + newInterestAmount - newDiscountAmount
    );

    if (params.paymentAmount > roundCurrency(updatedAmount - Number(receivable.paidAmount))) {
      throw new Error('Valor do recebimento excede o saldo devedor (Overpayment bloqueado)');
    }

    const effectivePaid = roundCurrency(Number(receivable.paidAmount) + params.paymentAmount);
    const balanceAmount = roundCurrency(Math.max(0, updatedAmount - effectivePaid));

    let newStatus = ObligationStatus.PARTIALLY_PAID;
    if (balanceAmount <= 0.01) {
      newStatus = ObligationStatus.PAID;
    }

    const previousState = { ...receivable };
    const updateData = {
      fineAmount: newFineAmount,
      interestAmount: newInterestAmount,
      discountAmount: newDiscountAmount,
      updatedAmount,
      paidAmount: effectivePaid,
      balanceAmount,
      status: newStatus,
    };

    const updatedReceivable = txContext
      ? await txContext.getReceivableRepo().update(receivable.id, updateData)
      : await this.receivableRepo.updateForCompany(receivable.id, params.companyId, updateData);

    try {
      const now = new Date().toISOString();
      const transaction: FinancialTransaction = {
        id: generateUUID(),
        companyId: params.companyId,
        financialAccountId: params.financialAccountId,
        receivableId: receivable.id,
        type: TransactionType.INCOME,
        amount: params.paymentAmount,
        paymentMethodId: params.paymentMethodId,
        transactionDate: params.paymentDate,
        competenceDate,
        description,
        isReversed: false,
        vehicleId: receivable.vehicleId,
        driverId: receivable.driverId,
        createdById: params.userId,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };

      let savedTransaction: FinancialTransaction;
      if (txContext) {
        savedTransaction = await txContext.getTransactionRepo().create(transaction);
        await txContext.getAccountRepo().updateBalance(params.financialAccountId, params.paymentAmount);
      } else {
        savedTransaction = await this.transactionRepo.createForCompany(params.companyId, transaction);
        await this.accountRepo.updateBalanceForCompany(params.companyId, params.financialAccountId, params.paymentAmount);
      }

      await AuditLogger.logAction(
        params.companyId,
        'AccountReceivable',
        receivable.id,
        newStatus === ObligationStatus.PAID ? AuditAction.RECEIVE : AuditAction.PARTIAL_PAYMENT,
        params.userId,
        params.userName,
        previousState,
        updatedReceivable,
        txContext
      );

      return { receivable: updatedReceivable, transaction: savedTransaction };
    } catch (error) {
      // PostgreSQL/UOW owns rollback atomically. Compensating writes are retained
      // only for the legacy non-transactional path.
      if (!txContext) {
        await this.receivableRepo.updateForCompany(receivable.id, params.companyId, previousState);
      }
      throw error;
    }
  }

  public static async registerPayment(params: SettlementParams, txContext?: ITransactionContext): Promise<{
    payable: AccountPayable;
    transaction: FinancialTransaction;
  }> {
    await FinancialAuthorizationService.authorize(
      params.userId,
      params.companyId,
      'PAYMENT_REGISTER',
      txContext
    );

    if (!Number.isFinite(params.paymentAmount) || params.paymentAmount <= 0) {
      throw new Error('Valor da liquidação deve ser maior que zero');
    }
    if (!params.financialAccountId || !params.paymentMethodId || !params.paymentDate) {
      throw new Error('Conta financeira, forma de pagamento e data são obrigatórias');
    }

    const idempotencyKey = this.requireIdempotencyKey(params, txContext);
    if (txContext) this.assertAuthoritativeCapabilities(txContext, 'PAYABLE');

    let payable: AccountPayable | null;
    if (txContext) {
      payable = await txContext.findPayableByIdWithLock!(params.obligationId);
    } else {
      payable = await this.payableRepo.findByIdForCompany(params.obligationId, params.companyId);
    }

    if (!payable) throw new Error('Conta a Pagar não encontrada');
    if (!payable.companyId || payable.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta a Pagar pertence a outra empresa ou tenant inválido');
    }

    const competenceDate = params.competenceDate || payable.competenceDate;
    const description = params.description || `Pagamento: ${payable.description}`;

    if (txContext && idempotencyKey) {
      const existing = await txContext.findFinancialTransactionByIdempotencyKey!(idempotencyKey);
      if (existing) {
        this.assertRetryMatches(
          existing,
          params,
          TransactionType.EXPENSE,
          'PAYABLE',
          competenceDate,
          description
        );
        return { payable, transaction: existing };
      }
    }

    if (payable.status === ObligationStatus.PAID || payable.status === ObligationStatus.CANCELLED) {
      throw new Error(`Título em status ${payable.status} não aceita pagamento`);
    }

    if (payable.installmentGroupId && payable.installmentNumber && payable.installmentNumber > 1) {
      const previous = txContext
        ? await txContext.findPreviousPayableInstallmentsForUpdate!(payable.installmentGroupId, payable.installmentNumber)
        : await this.payableRepo.findAllForCompany(params.companyId);
      const blocking = firstUnpaidPreviousInstallment(payable, previous);
      if (blocking) throw new Error(payableInstallmentOrderMessage(blocking));
    }

    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);
    await this.getLockedAccount(params, txContext);
    await this.validatePaymentMethod(params, txContext);

    const fine = params.fineAmount || 0;
    const interest = params.interestAmount || 0;
    const discount = await resolveAuthoritativeTrafficTicketDiscount(payable, params, txContext);

    const newFineAmount = Number(payable.fineAmount) + fine;
    const newInterestAmount = Number(payable.interestAmount) + interest;
    const newDiscountAmount = Number(payable.discountAmount) + discount;

    const updatedAmount = roundCurrency(
      Number(payable.originalAmount) + newFineAmount + newInterestAmount - newDiscountAmount
    );

    if (params.paymentAmount > roundCurrency(updatedAmount - Number(payable.paidAmount))) {
      throw new Error('Valor do pagamento excede o saldo devedor (Overpayment bloqueado)');
    }

    const effectivePaid = roundCurrency(Number(payable.paidAmount) + params.paymentAmount);
    const balanceAmount = roundCurrency(Math.max(0, updatedAmount - effectivePaid));

    let newStatus = ObligationStatus.PARTIALLY_PAID;
    if (balanceAmount <= 0.01) {
      newStatus = ObligationStatus.PAID;
    }

    const previousState = { ...payable };
    const updateData = {
      fineAmount: newFineAmount,
      interestAmount: newInterestAmount,
      discountAmount: newDiscountAmount,
      updatedAmount,
      paidAmount: effectivePaid,
      balanceAmount,
      status: newStatus,
    };

    const updatedPayable = txContext
      ? await txContext.getPayableRepo().update(payable.id, updateData)
      : await this.payableRepo.updateForCompany(payable.id, params.companyId, updateData);

    try {
      const now = new Date().toISOString();
      const transaction: FinancialTransaction = {
        id: generateUUID(),
        companyId: params.companyId,
        financialAccountId: params.financialAccountId,
        payableId: payable.id,
        type: TransactionType.EXPENSE,
        amount: params.paymentAmount,
        paymentMethodId: params.paymentMethodId,
        transactionDate: params.paymentDate,
        competenceDate,
        description,
        isReversed: false,
        vehicleId: payable.vehicleId,
        supplierId: payable.supplierId,
        driverId: payable.driverId,
        createdById: params.userId,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };

      let savedTransaction: FinancialTransaction;
      if (txContext) {
        savedTransaction = await txContext.getTransactionRepo().create(transaction);
        await txContext.getAccountRepo().updateBalance(params.financialAccountId, -params.paymentAmount);
      } else {
        savedTransaction = await this.transactionRepo.createForCompany(params.companyId, transaction);
        await this.accountRepo.updateBalanceForCompany(params.companyId, params.financialAccountId, -params.paymentAmount);
      }

      await AuditLogger.logAction(
        params.companyId,
        'AccountPayable',
        payable.id,
        newStatus === ObligationStatus.PAID ? AuditAction.PAY : AuditAction.PARTIAL_PAYMENT,
        params.userId,
        params.userName,
        previousState,
        updatedPayable,
        txContext
      );

      return { payable: updatedPayable, transaction: savedTransaction };
    } catch (error) {
      if (!txContext) {
        await this.payableRepo.updateForCompany(payable.id, params.companyId, previousState);
      }
      throw error;
    }
  }
}
