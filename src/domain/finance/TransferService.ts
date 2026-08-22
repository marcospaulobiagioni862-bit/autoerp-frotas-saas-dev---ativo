import { ITransactionContext } from './ITransactionContext';
import {
  FinancialTransactionRepository,
  FinancialAccountRepository,
} from '../../persistence/repositories/localRepositories';
import { FinancialTransaction, FinancialAccount } from '../../types/entities';
import { TransactionType, AuditAction } from '../../types/enums';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface TransferParams {
  companyId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  transferDate: string;
  paymentMethodId: string;
  description: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
}

export class TransferService {
  private static accountRepo = new FinancialAccountRepository();
  private static txRepo = new FinancialTransactionRepository();

  private static assertSameCommand(
    existing: FinancialTransaction,
    params: TransferParams,
    description: string
  ): void {
    const same =
      existing.type === TransactionType.TRANSFER &&
      existing.financialAccountId === params.sourceAccountId &&
      existing.destinationAccountId === params.destinationAccountId &&
      Number(existing.amount) === Number(params.amount) &&
      existing.paymentMethodId === params.paymentMethodId &&
      String(existing.transactionDate).slice(0, 10) === params.transferDate.slice(0, 10) &&
      existing.description === description;

    if (!same) {
      throw new Error('Chave de idempotência reutilizada com comando de transferência diferente');
    }
  }

  public static async transferFunds(
    params: TransferParams,
    txContext?: ITransactionContext
  ): Promise<FinancialTransaction> {
    await FinancialAuthorizationService.authorize(
      params.userId,
      params.companyId,
      'FINANCIAL_TRANSFER',
      txContext
    );

    const commandKey = typeof params.idempotencyKey === 'string' ? params.idempotencyKey.trim() : '';
    const description = (params.description || 'Transferência entre contas financeiras').trim();

    if (!params.sourceAccountId || !params.destinationAccountId || !params.paymentMethodId || !params.transferDate) {
      throw new Error('Conta de origem, conta de destino, forma de pagamento e data são obrigatórias');
    }
    if (!commandKey || commandKey.length > 200) {
      throw new Error('Chave de idempotência da transferência é obrigatória e deve ter no máximo 200 caracteres');
    }
    if (description.length > 1000) {
      throw new Error('Descrição da transferência deve ter no máximo 1000 caracteres');
    }
    if (params.sourceAccountId === params.destinationAccountId) {
      throw new Error('Conta de origem e destino devem ser diferentes');
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Valor da transferência deve ser maior que zero');
    }

    let sourceAcc: FinancialAccount | null;
    let destAcc: FinancialAccount | null;

    if (txContext) {
      if (!txContext.findFinancialAccountByIdWithLock || !txContext.findFinancialTransactionByIdempotencyKey) {
        throw new Error('Autoridade transacional de transferência indisponível');
      }

      // Always lock both accounts in the same lexical order. This serializes the
      // same logical transfer and also prevents opposite-direction deadlocks.
      const orderedIds = [params.sourceAccountId, params.destinationAccountId].sort();
      const locked = new Map<string, FinancialAccount>();
      for (const accountId of orderedIds) {
        const account = await txContext.findFinancialAccountByIdWithLock(accountId);
        if (account) locked.set(accountId, account);
      }
      sourceAcc = locked.get(params.sourceAccountId) || null;
      destAcc = locked.get(params.destinationAccountId) || null;

      // For the same canonical command, account locking is the serialization
      // boundary. Once the first request commits, a retry sees the durable key
      // and converges without touching balances or audit again.
      const existing = await txContext.findFinancialTransactionByIdempotencyKey(commandKey);
      if (existing) {
        this.assertSameCommand(existing, params, description);
        return existing;
      }
    } else {
      sourceAcc = await this.accountRepo.findByIdForCompany(params.sourceAccountId, params.companyId);
      destAcc = await this.accountRepo.findByIdForCompany(params.destinationAccountId, params.companyId);
    }

    if (!sourceAcc || !destAcc) {
      throw new Error('Conta financeira de origem ou destino não encontrada');
    }
    if (
      !sourceAcc.companyId ||
      sourceAcc.companyId !== params.companyId ||
      !destAcc.companyId ||
      destAcc.companyId !== params.companyId ||
      sourceAcc.companyId !== destAcc.companyId
    ) {
      throw new Error('Acesso negado: Transferência entre contas de empresas diferentes ou não autorizadas');
    }
    if (sourceAcc.status !== 'ACTIVE') {
      throw new Error('Conta financeira de origem inativa');
    }
    if (destAcc.status !== 'ACTIVE') {
      throw new Error('Conta financeira de destino inativa');
    }

    await FinancialPeriodService.assertDateOpen(params.companyId, params.transferDate, txContext);

    if (txContext) {
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

    if (txContext) {
      await txContext.getAccountRepo().updateBalance(params.sourceAccountId, -params.amount);
      await txContext.getAccountRepo().updateBalance(params.destinationAccountId, params.amount);
    } else {
      await this.accountRepo.updateBalanceForCompany(params.companyId, params.sourceAccountId, -params.amount);
      await this.accountRepo.updateBalanceForCompany(params.companyId, params.destinationAccountId, params.amount);
    }

    try {
      const transaction: FinancialTransaction = {
        id: generateUUID(),
        companyId: params.companyId,
        financialAccountId: params.sourceAccountId,
        destinationAccountId: params.destinationAccountId,
        type: TransactionType.TRANSFER,
        amount: params.amount,
        paymentMethodId: params.paymentMethodId,
        transactionDate: params.transferDate,
        competenceDate: params.transferDate,
        description,
        idempotencyKey: commandKey,
        isReversed: false,
        createdById: params.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const savedTx = txContext
        ? await txContext.getTransactionRepo().create(transaction)
        : await this.txRepo.createForCompany(params.companyId, transaction);

      await AuditLogger.logAction(
        params.companyId,
        'FinancialTransaction',
        savedTx.id,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        savedTx,
        txContext
      );

      return savedTx;
    } catch (error) {
      // PostgreSQL/UOW rolls back balance mutations atomically. Manual
      // compensation is only needed by the legacy non-transactional path.
      if (!txContext) {
        await this.accountRepo.updateBalanceForCompany(params.companyId, params.sourceAccountId, params.amount);
        await this.accountRepo.updateBalanceForCompany(params.companyId, params.destinationAccountId, -params.amount);
      }
      throw error;
    }
  }
}
