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
  userId: string;
  userName: string;
}

export class SettlementService {
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();
  private static transactionRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();

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

    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);

    let receivable: AccountReceivable | null;
    if (txContext) {
      receivable = await txContext.getReceivableRepo().findById(params.obligationId);
    } else {
      receivable = await this.receivableRepo.findByIdForCompany(params.obligationId, params.companyId);
    }

    if (!receivable) throw new Error('Conta a Receber não encontrada');
    if (!receivable.companyId || receivable.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta a Receber pertence a outra empresa ou tenant inválido');
    }

    let account: FinancialAccount | null;
    if (txContext) {
      account = await txContext.getAccountRepo().findById(params.financialAccountId);
    } else {
      account = await this.accountRepo.findByIdForCompany(params.financialAccountId, params.companyId);
    }

    if (!account) throw new Error('Conta financeira não encontrada');
    if (!account.companyId || account.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta financeira pertence a outra empresa ou tenant inválido');
    }

    if (txContext) {
      const paymentMethod = await txContext.getPaymentMethodRepo().findById(params.paymentMethodId);
      if (!paymentMethod) throw new Error('Forma de pagamento não encontrada');
      if (!paymentMethod.companyId || paymentMethod.companyId !== params.companyId) {
        throw new Error('Acesso negado: Forma de pagamento pertence a outra empresa ou tenant inválido');
      }
      if (paymentMethod.active === false) {
        throw new Error('Forma de pagamento inativa');
      }
    }

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

    let updatedReceivable: AccountReceivable;
    const updateData = {
      fineAmount: newFineAmount,
      interestAmount: newInterestAmount,
      discountAmount: newDiscountAmount,
      updatedAmount,
      paidAmount: effectivePaid,
      balanceAmount,
      status: newStatus,
    };

    if (txContext) {
      updatedReceivable = await txContext.getReceivableRepo().update(receivable.id, updateData);
    } else {
      updatedReceivable = await this.receivableRepo.updateForCompany(receivable.id, params.companyId, updateData);
    }

    try {
      const transaction: FinancialTransaction = {
        id: generateUUID(),
        companyId: params.companyId,
        financialAccountId: params.financialAccountId,
        receivableId: receivable.id,
        type: TransactionType.INCOME,
        amount: params.paymentAmount,
        paymentMethodId: params.paymentMethodId,
        transactionDate: params.paymentDate,
        competenceDate: params.competenceDate || receivable.competenceDate,
        description: params.description || `Recebimento: ${receivable.description}`,
        isReversed: false,
        vehicleId: receivable.vehicleId,
        driverId: receivable.driverId,
        createdById: params.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
      if (txContext) {
        await txContext.getReceivableRepo().update(receivable.id, previousState);
      } else {
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

    await FinancialPeriodService.assertDateOpen(params.companyId, params.paymentDate, txContext);

    let payable: AccountPayable | null;
    if (txContext) {
      payable = await txContext.getPayableRepo().findById(params.obligationId);
    } else {
      payable = await this.payableRepo.findByIdForCompany(params.obligationId, params.companyId);
    }

    if (!payable) throw new Error('Conta a Pagar não encontrada');
    if (!payable.companyId || payable.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta a Pagar pertence a outra empresa ou tenant inválido');
    }

    let account: FinancialAccount | null;
    if (txContext) {
      account = await txContext.getAccountRepo().findById(params.financialAccountId);
    } else {
      account = await this.accountRepo.findByIdForCompany(params.financialAccountId, params.companyId);
    }

    if (!account) throw new Error('Conta financeira não encontrada');
    if (!account.companyId || account.companyId !== params.companyId) {
      throw new Error('Acesso negado: Conta financeira pertence a outra empresa ou tenant inválido');
    }

    if (txContext) {
      const paymentMethod = await txContext.getPaymentMethodRepo().findById(params.paymentMethodId);
      if (!paymentMethod) throw new Error('Forma de pagamento não encontrada');
      if (!paymentMethod.companyId || paymentMethod.companyId !== params.companyId) {
        throw new Error('Acesso negado: Forma de pagamento pertence a outra empresa ou tenant inválido');
      }
      if (paymentMethod.active === false) {
        throw new Error('Forma de pagamento inativa');
      }
    }

    if (payable.status === ObligationStatus.PAID || payable.status === ObligationStatus.CANCELLED) {
      throw new Error(`Título em status ${payable.status} não aceita pagamento`);
    }

    const fine = params.fineAmount || 0;
    const interest = params.interestAmount || 0;
    const discount = params.discountAmount || 0;

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

    let updatedPayable: AccountPayable;
    const updateData = {
      fineAmount: newFineAmount,
      interestAmount: newInterestAmount,
      discountAmount: newDiscountAmount,
      updatedAmount,
      paidAmount: effectivePaid,
      balanceAmount,
      status: newStatus,
    };

    if (txContext) {
      updatedPayable = await txContext.getPayableRepo().update(payable.id, updateData);
    } else {
      updatedPayable = await this.payableRepo.updateForCompany(payable.id, params.companyId, updateData);
    }

    try {
      const transaction: FinancialTransaction = {
        id: generateUUID(),
        companyId: params.companyId,
        financialAccountId: params.financialAccountId,
        payableId: payable.id,
        type: TransactionType.EXPENSE,
        amount: params.paymentAmount,
        paymentMethodId: params.paymentMethodId,
        transactionDate: params.paymentDate,
        competenceDate: params.competenceDate || payable.competenceDate,
        description: params.description || `Pagamento: ${payable.description}`,
        isReversed: false,
        vehicleId: payable.vehicleId,
        supplierId: payable.supplierId,
        driverId: payable.driverId,
        createdById: params.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
      if (txContext) {
        await txContext.getPayableRepo().update(payable.id, previousState);
      } else {
        await this.payableRepo.updateForCompany(payable.id, params.companyId, previousState);
      }
      throw error;
    }
  }
}
