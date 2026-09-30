import { fixedSettlementQuote, fixedDailyInterest } from './dailyLateInterest';
import { determinePrincipalLiquidated, requestedAdjustments, settlementState, type SettlementComposition } from './settlementComposition';
import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
  FinancialTransactionRepository,
  FinancialAccountRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountReceivable, AccountPayable, FinancialTransaction, FinancialAccount } from '../../types/entities';
import { ObligationStatus, TransactionType, AuditAction, OriginType, SecurityDepositStatus, SecurityDepositMovementType } from '../../types/enums';
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
  dailyInterestAmount?: number;
  settleRemainingBalance?: boolean;
  fineAmount?: number;
  interestAmount?: number;
  additionalAmount?: number;
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

  private static async checkRetryAdjustments(existing: FinancialTransaction, params: SettlementParams, tx: ITransactionContext) {
    const requested = requestedAdjustments(params);
    const evidence = await tx.findSettlementComposition?.(existing.id);
    if (evidence) {
      if (requested.dailyInterestAmount !== (evidence.requested.dailyInterestAmount ?? null) || requested.settleRemainingBalance !== (evidence.requested.settleRemainingBalance ?? false)) throw new Error('Chave de idempotência reutilizada com composição diferente');
      const interest = requested.interestAmount ?? evidence.applied.interestAmount;
      if (requested.fineAmount !== evidence.requested.fineAmount || requested.additionalAmount !== (evidence.requested.additionalAmount ?? 0) || requested.discountAmount !== evidence.requested.discountAmount || interest !== evidence.applied.interestAmount) throw new Error('Chave de idempotência reutilizada com ajustes diferentes');
    } else if (requested.fineAmount || requested.interestAmount || requested.additionalAmount || requested.discountAmount || requested.dailyInterestAmount != null || requested.settleRemainingBalance) {
      throw new Error('Composição histórica da liquidação indisponível para validar retry com ajustes');
    }
  }

  private static async appliedAdjustments(params: SettlementParams, obligation: AccountReceivable | AccountPayable, kind: 'RECEIVABLE' | 'PAYABLE', tx?: ITransactionContext) {
    const requested = requestedAdjustments(params);
    const daily = requested.dailyInterestAmount;
    if (kind === 'PAYABLE' && daily != null) throw new Error('CP não admite diária automática');
    if (kind === 'RECEIVABLE' && requested.settleRemainingBalance) throw new Error('Modalidade integral exclusiva de CP');
    let interestAmount = daily == null ? requested.interestAmount ?? 0 : fixedSettlementQuote(obligation, params.paymentDate, daily).additionalInterest;
    if (kind === 'PAYABLE' && requested.settleRemainingBalance) {
      const base = roundCurrency(Number(obligation.balanceAmount) + requested.fineAmount + requested.additionalAmount - requested.discountAmount);
      if (params.paymentAmount < base) throw new Error('Liquidação integral inferior ao saldo');
      interestAmount = roundCurrency(params.paymentAmount - base);
    }
    if ((daily != null || requested.settleRemainingBalance) && requested.interestAmount != null && requested.interestAmount !== interestAmount) throw new Error('Juros divergem do cálculo autoritativo; atualize a liquidação');
    return { fineAmount: requested.fineAmount, interestAmount, additionalAmount: requested.additionalAmount, discountAmount: requested.discountAmount };
  }

  private static async auditComposition(params: SettlementParams, before: any, after: any, transaction: FinancialTransaction, applied: {fineAmount: number; interestAmount: number; additionalAmount: number; discountAmount: number}, principalLiquidated: number, tx?: ITransactionContext) {
    const composition: SettlementComposition = {
      version: 1, transactionId: transaction.id, obligationId: params.obligationId,
      dueDate: dateKey(before.dueDate), effectiveDate: params.paymentDate,
      daysOverdue: fixedDailyInterest(dateKey(before.dueDate), params.paymentDate, 0).daysOverdue,
      principalLiquidated,
      financialAccountId: params.financialAccountId, paymentMethodId: params.paymentMethodId, userId: params.userId,
      requested: requestedAdjustments(params), applied, movementAmount: params.paymentAmount,
      balanceReduction: roundCurrency(params.paymentAmount - applied.fineAmount - applied.interestAmount - applied.additionalAmount + applied.discountAmount),
      before: settlementState(before), after: settlementState(after),
    };
    await AuditLogger.logAction(params.companyId, 'FinancialSettlement', transaction.id, AuditAction.CREATE, params.userId, params.userName, undefined, composition, tx);
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

  private static async syncSecurityDepositReceipt(
    receivable: AccountReceivable,
    transaction: FinancialTransaction,
    paymentAmount: number,
    params: SettlementParams,
    txContext?: ITransactionContext
  ): Promise<void> {
    if (receivable.originType !== OriginType.SECURITY_DEPOSIT) return;
    if (!txContext || !receivable.contractId) {
      throw new Error('Autoridade transacional da caução indisponível');
    }

    const depositRepo = txContext.getSecurityDepositRepo();
    const movementRepo = txContext.getSecurityDepositMovementRepo();
    const existingMovement = await movementRepo.findByFinancialTransactionId(transaction.id);
    if (existingMovement) return;

    await depositRepo.lockContract(params.companyId, receivable.contractId);
    const contract = await txContext.getContractRepo().findByIdForCompanyWithLock(params.companyId, receivable.contractId);
    if (!contract || contract.isArchived) throw new Error('Contrato da caução não encontrado');

    const originalAmount = roundCurrency(Number(contract.securityDepositAmount));
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new Error('Contrato não possui caução válida');
    }

    const now = new Date().toISOString();
    let deposit = await depositRepo.findByContractId(receivable.contractId);
    if (!deposit) {
      deposit = await depositRepo.create({
        id: generateUUID(),
        companyId: params.companyId,
        contractId: contract.id,
        driverId: contract.driverId,
        vehicleId: contract.vehicleId,
        originalAmount,
        receivedAmount: 0,
        usedAmount: 0,
        returnedAmount: 0,
        status: SecurityDepositStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (deposit.companyId !== params.companyId || roundCurrency(Number(deposit.originalAmount)) !== originalAmount) {
      throw new Error('Caução vinculada diverge do contrato');
    }

    const previousState = { ...deposit };
    const receivedAmount = roundCurrency(Number(deposit.receivedAmount) + paymentAmount);
    if (receivedAmount > originalAmount) throw new Error('Recebimento da caução excede o valor previsto');

    const updatedDeposit = await depositRepo.update(deposit.id, {
      receivedAmount,
      status: receivedAmount >= originalAmount ? SecurityDepositStatus.RECEIVED : SecurityDepositStatus.PENDING,
      receivedAt: now,
      updatedAt: now,
    });
    await movementRepo.create({
      id: generateUUID(),
      securityDepositId: deposit.id,
      companyId: params.companyId,
      type: SecurityDepositMovementType.RECEIPT,
      amount: paymentAmount,
      date: now,
      financialTransactionId: transaction.id,
      receivableId: receivable.id,
      description: 'Recebimento de caução via Conta a Receber',
      createdById: params.userId,
      createdAt: now,
    });
    await AuditLogger.logAction(
      params.companyId,
      'SecurityDeposit',
      deposit.id,
      AuditAction.RECEIVE,
      params.userId,
      params.userName,
      previousState,
      updatedDeposit,
      txContext
    );
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
        await this.checkRetryAdjustments(existing, params, txContext);
        this.assertRetryMatches(
          existing,
          params,
          TransactionType.INCOME,
          'RECEIVABLE',
          competenceDate,
          description
        );
        await this.syncSecurityDepositReceipt(receivable, existing, params.paymentAmount, params, txContext);
        return { receivable, transaction: existing };
      }
    }

    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);
    await this.getLockedAccount(params, txContext);
    await this.validatePaymentMethod(params, txContext);

    if (receivable.status === ObligationStatus.PAID || receivable.status === ObligationStatus.CANCELLED) {
      throw new Error(`Título em status ${receivable.status} não aceita recebimento`);
    }

    const applied = await this.appliedAdjustments(params, receivable, 'RECEIVABLE', txContext);
    const { fineAmount: fine, interestAmount: interest, additionalAmount: additional, discountAmount: discount } = applied;

    const newFineAmount = Number(receivable.fineAmount) + fine;
    const newInterestAmount = Number(receivable.interestAmount) + interest;
    const newAdditionalAmount = Number(receivable.additionalAmount ?? 0) + additional;
    const newDiscountAmount = Number(receivable.discountAmount) + discount;

    const updatedAmount = roundCurrency(
      Number(receivable.originalAmount) + newFineAmount + newInterestAmount + newAdditionalAmount - newDiscountAmount
    );

    if (params.paymentAmount > roundCurrency(updatedAmount - Number(receivable.paidAmount))) {
      throw new Error('Valor do recebimento excede o saldo devedor (Overpayment bloqueado)');
    }

    const effectivePaid = roundCurrency(Number(receivable.paidAmount) + params.paymentAmount);
    const balanceAmount = roundCurrency(Math.max(0, updatedAmount - effectivePaid));

    let newStatus = ObligationStatus.PARTIALLY_PAID;
    if (balanceAmount === 0) {
      newStatus = ObligationStatus.PAID;
    }

    const principalLiquidated = determinePrincipalLiquidated({ ...settlementState(receivable), originalAmount: Number(receivable.originalAmount) }, applied, params.paymentAmount);
    const previousState = { ...receivable };
    const updateData = {
      fineAmount: newFineAmount,
      interestAmount: newInterestAmount,
      additionalAmount: newAdditionalAmount,
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
      await this.auditComposition(params, previousState, updatedReceivable, savedTransaction, applied, principalLiquidated, txContext);
      await this.syncSecurityDepositReceipt(receivable, savedTransaction, params.paymentAmount, params, txContext);

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
        await this.checkRetryAdjustments(existing, params, txContext);
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

    const applied = await this.appliedAdjustments(params, payable, 'PAYABLE', txContext);
    const { fineAmount: fine, interestAmount: interest, additionalAmount: additional } = applied;
    const discount = await resolveAuthoritativeTrafficTicketDiscount(payable, { ...params, interestAmount: interest, additionalAmount: additional }, txContext);

    const newFineAmount = Number(payable.fineAmount) + fine;
    const newInterestAmount = Number(payable.interestAmount) + interest;
    const newAdditionalAmount = Number(payable.additionalAmount ?? 0) + additional;
    const newDiscountAmount = Number(payable.discountAmount) + discount;

    const updatedAmount = roundCurrency(
      Number(payable.originalAmount) + newFineAmount + newInterestAmount + newAdditionalAmount - newDiscountAmount
    );

    if (params.paymentAmount > roundCurrency(updatedAmount - Number(payable.paidAmount))) {
      throw new Error('Valor do pagamento excede o saldo devedor (Overpayment bloqueado)');
    }

    const effectivePaid = roundCurrency(Number(payable.paidAmount) + params.paymentAmount);
    const balanceAmount = roundCurrency(Math.max(0, updatedAmount - effectivePaid));

    let newStatus = ObligationStatus.PARTIALLY_PAID;
    if (balanceAmount === 0) {
      newStatus = ObligationStatus.PAID;
    }

    const principalLiquidated = determinePrincipalLiquidated({ ...settlementState(payable), originalAmount: Number(payable.originalAmount) }, { ...applied, discountAmount: discount }, params.paymentAmount);
    const previousState = { ...payable };
    const updateData = {
      fineAmount: newFineAmount,
      interestAmount: newInterestAmount,
      additionalAmount: newAdditionalAmount,
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

      await this.auditComposition(params, previousState, updatedPayable, savedTransaction, { ...applied, discountAmount: discount }, principalLiquidated, txContext);
      return { payable: updatedPayable, transaction: savedTransaction };
    } catch (error) {
      if (!txContext) {
        await this.payableRepo.updateForCompany(payable.id, params.companyId, previousState);
      }
      throw error;
    }
  }
}
