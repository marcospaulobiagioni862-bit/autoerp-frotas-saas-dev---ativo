import { ITransactionContext } from './ITransactionContext';
import {
  FinancialTransactionRepository,
  FinancialAccountRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import {
  AccountPayable,
  AccountReceivable,
  FinancialAccount,
  FinancialTransaction,
} from '../../types/entities';
import { TransactionType, ObligationStatus, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export class ReversalService {
  private static transactionRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();

  private static requireIdempotencyKey(
    idempotencyKey: string | undefined,
    txContext?: ITransactionContext
  ): string | undefined {
    const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!txContext) return key || undefined;
    if (!key || key.length > 200) {
      throw new Error('Chave de idempotência do estorno é obrigatória e deve ter até 200 caracteres');
    }
    return key;
  }

  private static normalizeReason(reason: string): string {
    const normalized = typeof reason === 'string' ? reason.trim() : '';
    if (!normalized || normalized.length > 1000) {
      throw new Error('Motivo do estorno é obrigatório e deve ter até 1000 caracteres');
    }
    return normalized;
  }

  private static assertAuthoritativeCapabilities(txContext: ITransactionContext): void {
    if (
      !txContext.findFinancialTransactionByIdWithLock ||
      !txContext.findFinancialTransactionByIdempotencyKey ||
      !txContext.findFinancialAccountByIdWithLock
    ) {
      throw new Error('Autoridade transacional de estorno indisponível');
    }
  }

  private static assertRetryMatches(
    existing: FinancialTransaction,
    originalTx: FinancialTransaction,
    companyId: string,
    reversalAmount: number,
    reason: string,
    userId: string
  ): void {
    const expectedDescription = `ESTORNO (${reason}): ${originalTx.description}`;
    const matches =
      existing.companyId === companyId &&
      existing.type === TransactionType.REVERSAL &&
      existing.reversalTransactionId === originalTx.id &&
      existing.financialAccountId === originalTx.financialAccountId &&
      (existing.destinationAccountId || '') === (originalTx.destinationAccountId || '') &&
      (existing.receivableId || '') === (originalTx.receivableId || '') &&
      (existing.payableId || '') === (originalTx.payableId || '') &&
      existing.paymentMethodId === originalTx.paymentMethodId &&
      roundCurrency(Number(existing.amount)) === roundCurrency(reversalAmount) &&
      existing.description === expectedDescription &&
      existing.createdById === userId;

    if (!matches) {
      throw new Error('Chave de idempotência reutilizada com comando de estorno diferente');
    }
  }

  private static async lockAndValidateAccount(
    companyId: string,
    accountId: string,
    txContext?: ITransactionContext
  ): Promise<FinancialAccount> {
    let account: FinancialAccount | null;
    if (txContext) {
      if (!txContext.findFinancialAccountByIdWithLock) {
        throw new Error('Autoridade transacional de conta financeira indisponível');
      }
      account = await txContext.findFinancialAccountByIdWithLock(accountId);
    } else {
      account = await this.accountRepo.findByIdForCompany(accountId, companyId);
    }

    if (!account) throw new Error('Conta financeira não encontrada');
    if (!account.companyId || account.companyId !== companyId) {
      throw new Error('Acesso negado: Conta financeira pertence a outra empresa ou tenant inválido');
    }
    if (txContext && account.status !== 'ACTIVE') {
      throw new Error('Conta financeira inativa');
    }
    return account;
  }

  private static async lockLinkedObligation(
    companyId: string,
    originalTx: FinancialTransaction,
    txContext?: ITransactionContext
  ): Promise<{ receivable: AccountReceivable | null; payable: AccountPayable | null }> {
    if (originalTx.receivableId) {
      let receivable: AccountReceivable | null;
      if (txContext) {
        if (!txContext.findReceivableByIdWithLock) {
          throw new Error('Autoridade transacional de Conta a Receber indisponível');
        }
        receivable = await txContext.findReceivableByIdWithLock(originalTx.receivableId);
      } else {
        receivable = await this.receivableRepo.findByIdForCompany(originalTx.receivableId, companyId);
      }
      if (receivable && (!receivable.companyId || receivable.companyId !== companyId)) {
        throw new Error('Acesso negado: Conta a Receber pertence a outra empresa ou tenant inválido');
      }
      return { receivable, payable: null };
    }

    if (originalTx.payableId) {
      let payable: AccountPayable | null;
      if (txContext) {
        if (!txContext.findPayableByIdWithLock) {
          throw new Error('Autoridade transacional de Conta a Pagar indisponível');
        }
        payable = await txContext.findPayableByIdWithLock(originalTx.payableId);
      } else {
        payable = await this.payableRepo.findByIdForCompany(originalTx.payableId, companyId);
      }
      if (payable && (!payable.companyId || payable.companyId !== companyId)) {
        throw new Error('Acesso negado: Conta a Pagar pertence a outra empresa ou tenant inválido');
      }
      return { receivable: null, payable };
    }

    return { receivable: null, payable: null };
  }

  private static obligationStateAfterReversal(updatedAmount: number, currentPaid: number, reversalAmount: number) {
    const newPaid = roundCurrency(Math.max(0, currentPaid - reversalAmount));
    const newBalance = roundCurrency(Math.max(0, updatedAmount - newPaid));
    const newStatus = newBalance >= roundCurrency(updatedAmount)
      ? ObligationStatus.PENDING
      : ObligationStatus.PARTIALLY_PAID;
    return { newPaid, newBalance, newStatus };
  }

  public static async reverseTransaction(
    companyId: string,
    transactionId: string,
    reversalAmount: number,
    reason: string,
    userId: string,
    userName: string,
    txContext?: ITransactionContext,
    idempotencyKey?: string
  ): Promise<FinancialTransaction> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'FINANCIAL_REVERSAL',
      txContext
    );

    if (!Number.isFinite(reversalAmount) || reversalAmount <= 0) {
      throw new Error('Valor de estorno inválido');
    }
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('Transação não encontrada');
    }

    const normalizedReason = this.normalizeReason(reason);
    const commandKey = this.requireIdempotencyKey(idempotencyKey, txContext);
    if (txContext) this.assertAuthoritativeCapabilities(txContext);

    let originalTx: FinancialTransaction | null;
    if (txContext) {
      originalTx = await txContext.findFinancialTransactionByIdWithLock!(transactionId);
    } else {
      originalTx = await this.transactionRepo.findByIdForCompany(transactionId, companyId);
    }
    if (!originalTx) throw new Error('Transação não encontrada');
    if (originalTx.companyId && originalTx.companyId !== companyId) {
      throw new Error('Acesso negado: Transação pertence a outra empresa');
    }
    if (originalTx.type === TransactionType.REVERSAL) {
      throw new Error('Transação do tipo REVERSAL não pode ser estornada');
    }

    if (txContext && commandKey) {
      const existing = await txContext.findFinancialTransactionByIdempotencyKey!(commandKey);
      if (existing) {
        this.assertRetryMatches(
          existing,
          originalTx,
          companyId,
          reversalAmount,
          normalizedReason,
          userId
        );
        return existing;
      }
    }

    if (originalTx.isReversed) throw new Error('Transação já foi estornada');

    const reversalDate = new Date().toISOString().split('T')[0];
    await FinancialPeriodService.assertDateOpen(companyId, originalTx.transactionDate, txContext);
    await FinancialPeriodService.assertDateOpen(companyId, reversalDate, txContext);

    let allTxs: FinancialTransaction[];
    if (txContext) {
      allTxs = await txContext.getTransactionRepo().findAll({ companyId });
    } else {
      allTxs = await this.transactionRepo.findAllForCompany(companyId);
    }
    const previousReversals = allTxs.filter(
      (t) => t.type === TransactionType.REVERSAL && t.reversalTransactionId === originalTx!.id
    );
    const reversedAmount = roundCurrency(
      previousReversals.reduce((sum, reversal) => sum + Number(reversal.amount), 0)
    );
    const originalAmount = roundCurrency(Number(originalTx.amount));
    const normalizedReversalAmount = roundCurrency(reversalAmount);
    const reversibleRemaining = roundCurrency(originalAmount - reversedAmount);

    if (normalizedReversalAmount > reversibleRemaining) {
      throw new Error(`Valor de estorno inválido (Disponível para estorno: R$ ${reversibleRemaining})`);
    }

    const totalReversedAfter = roundCurrency(reversedAmount + normalizedReversalAmount);
    const isFullReversal = Math.abs(totalReversedAfter - originalAmount) < 0.01;

    // Lock the linked obligation before accounts. Settlement uses obligation -> account,
    // so keeping the same order avoids an account/obligation deadlock.
    const linked = await this.lockLinkedObligation(companyId, originalTx, txContext);
    let linkedCardPayment: any | null = null;
    if (originalTx.type === TransactionType.TRANSFER && txContext?.findCreditCardStatementPaymentForUpdate) {
      linkedCardPayment = await txContext.findCreditCardStatementPaymentForUpdate(originalTx.id);
      if (linkedCardPayment && !txContext.applyCreditCardStatementPaymentReversal) {
        throw new Error('Autoridade transacional de estorno de pagamento de fatura indisponível');
      }
      if (linkedCardPayment && normalizedReversalAmount > roundCurrency(Number(linkedCardPayment.amount))) {
        throw new Error('Estorno excede o pagamento autoritativo vinculado à fatura');
      }
    }

    if (originalTx.type === TransactionType.TRANSFER) {
      if (!originalTx.destinationAccountId) {
        throw new Error('Transferência original sem conta de destino');
      }
      const accountIds = [originalTx.financialAccountId, originalTx.destinationAccountId].sort();
      for (const accountId of accountIds) {
        await this.lockAndValidateAccount(companyId, accountId, txContext);
      }
    } else {
      await this.lockAndValidateAccount(companyId, originalTx.financialAccountId, txContext);
    }

    if (txContext) {
      await txContext.getTransactionRepo().update(originalTx.id, {
        isReversed: isFullReversal,
      });
    } else {
      await this.transactionRepo.updateForCompany(originalTx.id, companyId, {
        isReversed: isFullReversal,
      });
    }

    const now = new Date().toISOString();
    const reversalTx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId: originalTx.financialAccountId,
      destinationAccountId: originalTx.destinationAccountId,
      receivableId: originalTx.receivableId,
      payableId: originalTx.payableId,
      type: TransactionType.REVERSAL,
      amount: normalizedReversalAmount,
      paymentMethodId: originalTx.paymentMethodId,
      transactionDate: reversalDate,
      competenceDate: originalTx.competenceDate,
      description: `ESTORNO (${normalizedReason}): ${originalTx.description}`,
      isReversed: false,
      reversalTransactionId: originalTx.id,
      vehicleId: originalTx.vehicleId,
      driverId: originalTx.driverId,
      supplierId: originalTx.supplierId,
      createdById: userId,
      idempotencyKey: commandKey,
      createdAt: now,
      updatedAt: now,
    };

    let savedReversal: FinancialTransaction;
    if (txContext) {
      savedReversal = await txContext.getTransactionRepo().create(reversalTx);
    } else {
      savedReversal = await this.transactionRepo.createForCompany(companyId, reversalTx);
    }

    if (originalTx.type === TransactionType.TRANSFER) {
      if (txContext) {
        await txContext.getAccountRepo().updateBalance(originalTx.financialAccountId, normalizedReversalAmount);
        await txContext.getAccountRepo().updateBalance(originalTx.destinationAccountId!, -normalizedReversalAmount);
      } else {
        await this.accountRepo.updateBalanceForCompany(companyId, originalTx.financialAccountId, normalizedReversalAmount);
        await this.accountRepo.updateBalanceForCompany(companyId, originalTx.destinationAccountId!, -normalizedReversalAmount);
      }
    } else {
      const balanceDelta = originalTx.type === TransactionType.INCOME
        ? -normalizedReversalAmount
        : normalizedReversalAmount;
      if (txContext) {
        await txContext.getAccountRepo().updateBalance(originalTx.financialAccountId, balanceDelta);
      } else {
        await this.accountRepo.updateBalanceForCompany(companyId, originalTx.financialAccountId, balanceDelta);
      }
    }

    if (linked.receivable) {
      const receivable = linked.receivable;
      const state = this.obligationStateAfterReversal(
        Number(receivable.updatedAmount),
        Number(receivable.paidAmount),
        normalizedReversalAmount
      );
      if (txContext) {
        await txContext.getReceivableRepo().update(receivable.id, {
          paidAmount: state.newPaid,
          balanceAmount: state.newBalance,
          status: state.newStatus,
        });
      } else {
        await this.receivableRepo.updateForCompany(receivable.id, companyId, {
          paidAmount: state.newPaid,
          balanceAmount: state.newBalance,
          status: state.newStatus,
        });
      }
    } else if (linked.payable) {
      const payable = linked.payable;
      const state = this.obligationStateAfterReversal(
        Number(payable.updatedAmount),
        Number(payable.paidAmount),
        normalizedReversalAmount
      );
      if (txContext) {
        await txContext.getPayableRepo().update(payable.id, {
          paidAmount: state.newPaid,
          balanceAmount: state.newBalance,
          status: state.newStatus,
        });
      } else {
        await this.payableRepo.updateForCompany(payable.id, companyId, {
          paidAmount: state.newPaid,
          balanceAmount: state.newBalance,
          status: state.newStatus,
        });
      }
    }

    if (linkedCardPayment && txContext?.applyCreditCardStatementPaymentReversal) {
      const previousStatement = {
        id: linkedCardPayment.statement_id,
        paidAmount: Number(linkedCardPayment.paid_amount),
        balanceAmount: Number(linkedCardPayment.balance_amount),
        status: linkedCardPayment.status,
      };
      const updatedStatement = await txContext.applyCreditCardStatementPaymentReversal(
        linkedCardPayment.statement_id,
        normalizedReversalAmount,
        userId
      );
      await AuditLogger.logAction(
        companyId,
        'CreditCardStatement',
        linkedCardPayment.statement_id,
        isFullReversal ? AuditAction.REVERSE : AuditAction.PARTIAL_REVERSE,
        userId,
        userName,
        previousStatement,
        updatedStatement,
        txContext
      );
    }

    await AuditLogger.logAction(
      companyId,
      'FinancialTransaction',
      originalTx.id,
      isFullReversal ? AuditAction.REVERSE : AuditAction.PARTIAL_REVERSE,
      userId,
      userName,
      originalTx,
      savedReversal,
      txContext
    );

    return savedReversal;
  }
}
