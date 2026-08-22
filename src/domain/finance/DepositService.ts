import {
  SecurityDepositRepository,
  SecurityDepositMovementRepository,
  FinancialTransactionRepository,
  FinancialAccountRepository,
  AccountReceivableRepository,
} from '../../persistence/repositories/localRepositories';
import { SecurityDeposit, SecurityDepositMovement, FinancialTransaction } from '../../types/entities';
import { SecurityDepositStatus, SecurityDepositMovementType, TransactionType, AuditAction, ObligationStatus } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';
import { ITransactionContext } from './ITransactionContext';

export class DepositService {
  private static depositRepo = new SecurityDepositRepository();
  private static depositMovementRepo = new SecurityDepositMovementRepository();
  private static transactionRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();
  private static recRepo = new AccountReceivableRepository();

  public static async receiveSecurityDeposit(
    companyId: string,
    contractId: string,
    driverId: string,
    vehicleId: string,
    amount: number,
    financialAccountId: string,
    paymentMethodId: string,
    userId: string,
    userName: string,
    txContext?: ITransactionContext,
    idempotencyKey?: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    if (txContext) {
      return this.receiveSecurityDepositTransactional(
        companyId,
        contractId,
        driverId,
        vehicleId,
        amount,
        financialAccountId,
        paymentMethodId,
        userId,
        userName,
        txContext,
        idempotencyKey
      );
    }

    let deposit = await this.depositRepo.findByContractIdForCompany(companyId, contractId);

    if (!deposit) {
      deposit = await this.depositRepo.createForCompany(companyId, {
        id: generateUUID(),
        companyId,
        contractId,
        driverId,
        vehicleId,
        originalAmount: amount,
        receivedAmount: 0,
        usedAmount: 0,
        returnedAmount: 0,
        status: SecurityDepositStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const previousState = { ...deposit };

    // Validate account belongs to company
    const account = await this.accountRepo.findByIdForCompany(financialAccountId, companyId);
    if (!account) {
      throw new Error('Conta financeira não encontrada ou pertence a outra empresa');
    }

    // Register financial receipt transaction
    const tx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId,
      type: TransactionType.INCOME,
      amount,
      paymentMethodId,
      transactionDate: new Date().toISOString().split('T')[0],
      competenceDate: new Date().toISOString().split('T')[0],
      description: `Recebimento de Caução (Contrato: ${contractId})`,
      isReversed: false,
      vehicleId,
      driverId,
      createdById: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedTx = await this.transactionRepo.createForCompany(companyId, tx);
    await this.accountRepo.updateBalanceForCompany(companyId, financialAccountId, amount);

    const newReceived = roundCurrency(deposit.receivedAmount + amount);
    const newStatus = newReceived >= deposit.originalAmount ? SecurityDepositStatus.RECEIVED : SecurityDepositStatus.PENDING;

    const updatedDeposit = await this.depositRepo.updateForCompany(deposit.id, companyId, {
      receivedAmount: newReceived,
      status: newStatus,
      receivedAt: new Date().toISOString(),
    });

    const movement = await this.depositMovementRepo.createForCompany(companyId, {
      id: generateUUID(),
      securityDepositId: deposit.id,
      companyId,
      type: SecurityDepositMovementType.RECEIPT,
      amount,
      date: new Date().toISOString(),
      financialTransactionId: savedTx.id,
      description: 'Recebimento inicial de caução',
      createdById: userId,
      createdAt: new Date().toISOString(),
    });

    await AuditLogger.logAction(
      companyId,
      'SecurityDeposit',
      deposit.id,
      AuditAction.RECEIVE,
      userId,
      userName,
      previousState,
      updatedDeposit
    );

    return { deposit: updatedDeposit, movement };
  }

  public static async getSecurityDepositByContract(
    companyId: string,
    contractId: string,
    userId: string,
    txContext?: ITransactionContext
  ): Promise<SecurityDeposit | null> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'VIEW_FINANCIAL',
      txContext
    );

    if (txContext) {
      return await txContext.getSecurityDepositRepo().findByContractId(contractId);
    }
    return await this.depositRepo.findByContractIdForCompany(companyId, contractId);
  }

  private static async receiveSecurityDepositTransactional(
    companyId: string,
    contractId: string,
    driverId: string,
    vehicleId: string,
    amount: number,
    financialAccountId: string,
    paymentMethodId: string,
    userId: string,
    userName: string,
    txContext: ITransactionContext,
    idempotencyKey?: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    await FinancialAuthorizationService.authorize(
      userId,
      companyId,
      'RECEIPT_REGISTER',
      txContext
    );

    const depositRepo = txContext.getSecurityDepositRepo();
    const movementRepo = txContext.getSecurityDepositMovementRepo();
    const transactionRepo = txContext.getTransactionRepo();
    const accountRepo = txContext.getAccountRepo();
    const paymentMethodRepo = txContext.getPaymentMethodRepo?.();
    const auditRepo = txContext.getAuditLogRepo();
    const contractRepo = txContext.getContractRepo();

    const commandKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!commandKey || commandKey.length > 200) {
      throw new Error('Chave de idempotência do recebimento de caução é obrigatória e deve ter até 200 caracteres');
    }
    if (!txContext.findFinancialTransactionByIdempotencyKey || !txContext.findFinancialAccountByIdWithLock || !movementRepo.findByFinancialTransactionId) {
      throw new Error('Autoridade transacional idempotente da caução indisponível');
    }

    await depositRepo.lockContract(companyId, contractId);

    const contract = await contractRepo.findByIdForCompanyWithLock(companyId, contractId);
    if (!contract || contract.isArchived) {
      throw new Error('Contrato não encontrado ou pertence a outra empresa');
    }
    const originalAmount = roundCurrency(contract.securityDepositAmount);
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      throw new Error('Contrato não possui caução a receber');
    }
    const canonicalDriverId = contract.driverId;
    const canonicalVehicleId = contract.vehicleId;

    let deposit = await depositRepo.findByContractId(contractId);
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    if (!deposit) {
      deposit = await depositRepo.create({
        id: generateUUID(),
        companyId,
        contractId,
        driverId: canonicalDriverId,
        vehicleId: canonicalVehicleId,
        originalAmount,
        receivedAmount: 0,
        usedAmount: 0,
        returnedAmount: 0,
        status: SecurityDepositStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      });
    } else if (roundCurrency(deposit.originalAmount) !== originalAmount) {
      throw new Error('Principal da caução diverge do contrato');
    }

    const description = `Recebimento de Caução (Contrato: ${contractId})`;
    const existingTx = await txContext.findFinancialTransactionByIdempotencyKey(commandKey);
    if (existingTx) {
      const sameCommand = existingTx.companyId === companyId && existingTx.type === TransactionType.INCOME && !existingTx.receivableId && !existingTx.payableId && existingTx.financialAccountId === financialAccountId && existingTx.paymentMethodId === paymentMethodId && roundCurrency(Number(existingTx.amount)) === roundCurrency(amount) && existingTx.description === description && existingTx.vehicleId === canonicalVehicleId && existingTx.driverId === canonicalDriverId;
      if (!sameCommand) throw new Error('Chave de idempotência reutilizada com recebimento de caução diferente');
      const originalMovement = await movementRepo.findByFinancialTransactionId(existingTx.id);
      if (!originalMovement || originalMovement.companyId !== companyId || originalMovement.securityDepositId !== deposit.id || originalMovement.type !== SecurityDepositMovementType.RECEIPT || originalMovement.financialTransactionId !== existingTx.id || roundCurrency(Number(originalMovement.amount)) !== roundCurrency(amount)) throw new Error('Evidência idempotente do recebimento de caução está inconsistente');
      return { deposit, movement: originalMovement };
    }

    const newReceived = roundCurrency(deposit.receivedAmount + amount);
    if (newReceived > originalAmount) {
      const remaining = roundCurrency(Math.max(0, originalAmount - deposit.receivedAmount));
      throw new Error(`Valor de recebimento excede o saldo da caução (R$ ${remaining.toFixed(2)})`);
    }

    const previousState = { ...deposit };

    const account = await txContext.findFinancialAccountByIdWithLock(financialAccountId);
    if (!account || account.companyId !== companyId || account.status !== 'ACTIVE') {
      throw new Error('Conta financeira não encontrada ou pertence a outra empresa');
    }

    if (!paymentMethodRepo) {
      throw new Error('Forma de pagamento não encontrada ou pertence a outra empresa');
    }
    const paymentMethod = await paymentMethodRepo.findById(paymentMethodId);
    if (!paymentMethod || paymentMethod.companyId !== companyId || !paymentMethod.active) {
      throw new Error('Forma de pagamento não encontrada ou pertence a outra empresa');
    }

    const tx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId,
      type: TransactionType.INCOME,
      amount,
      paymentMethodId,
      transactionDate: today,
      competenceDate: today,
      description,
      isReversed: false,
      vehicleId: canonicalVehicleId,
      driverId: canonicalDriverId,
      createdById: userId,
      idempotencyKey: commandKey,
      createdAt: now,
      updatedAt: now,
    };

    const savedTx = await transactionRepo.create(tx);
    await accountRepo.updateBalance(financialAccountId, amount);

    const newStatus = newReceived >= originalAmount
      ? SecurityDepositStatus.RECEIVED
      : SecurityDepositStatus.PENDING;

    const updatedDeposit = await depositRepo.update(deposit.id, {
      receivedAmount: newReceived,
      status: newStatus,
      receivedAt: now,
      updatedAt: now,
    });

    const movement = await movementRepo.create({
      id: generateUUID(),
      securityDepositId: deposit.id,
      companyId,
      type: SecurityDepositMovementType.RECEIPT,
      amount,
      date: now,
      financialTransactionId: savedTx.id,
      description: 'Recebimento inicial de caução',
      createdById: userId,
      createdAt: now,
    });

    await auditRepo.create({
      id: generateUUID(),
      companyId,
      entityName: 'SecurityDeposit',
      entityId: deposit.id,
      action: AuditAction.RECEIVE,
      userId,
      userName,
      timestamp: now,
      previousState: JSON.stringify(previousState),
      newState: JSON.stringify(updatedDeposit),
    });

    return { deposit: updatedDeposit, movement };
  }

  public static async returnSecurityDeposit(
    companyId: string,
    depositId: string,
    returnAmount: number,
    financialAccountId: string,
    paymentMethodId: string,
    notes: string,
    userId: string,
    userName: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    const deposit = await this.depositRepo.findByIdForCompany(depositId, companyId);
    if (!deposit) throw new Error('Caução não encontrada');

    // Validate account belongs to company
    const account = await this.accountRepo.findByIdForCompany(financialAccountId, companyId);
    if (!account) {
      throw new Error('Conta financeira não encontrada ou pertence a outra empresa');
    }

    const availableToReturn = deposit.receivedAmount - deposit.usedAmount - deposit.returnedAmount;
    if (returnAmount > availableToReturn) {
      throw new Error(`Valor de devolução excede o saldo disponível de caução (R$ ${availableToReturn.toFixed(2)})`);
    }

    const previousState = { ...deposit };

    // Register financial payout transaction
    const tx: FinancialTransaction = {
      id: generateUUID(),
      companyId,
      financialAccountId,
      type: TransactionType.EXPENSE,
      amount: returnAmount,
      paymentMethodId,
      transactionDate: new Date().toISOString().split('T')[0],
      competenceDate: new Date().toISOString().split('T')[0],
      description: `Devolução de Caução (Motorista: ${deposit.driverId})`,
      isReversed: false,
      vehicleId: deposit.vehicleId,
      driverId: deposit.driverId,
      createdById: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedTx = await this.transactionRepo.createForCompany(companyId, tx);
    await this.accountRepo.updateBalanceForCompany(companyId, financialAccountId, -returnAmount);

    const newReturned = roundCurrency(deposit.returnedAmount + returnAmount);
    const newStatus = (newReturned + deposit.usedAmount) >= deposit.receivedAmount 
      ? SecurityDepositStatus.RETURNED 
      : SecurityDepositStatus.PARTIALLY_USED;

    const updatedDeposit = await this.depositRepo.updateForCompany(deposit.id, companyId, {
      returnedAmount: newReturned,
      status: newStatus,
      returnedAt: new Date().toISOString(),
      notes,
    });

    const movement = await this.depositMovementRepo.createForCompany(companyId, {
      id: generateUUID(),
      securityDepositId: deposit.id,
      companyId,
      type: SecurityDepositMovementType.RETURN,
      amount: returnAmount,
      date: new Date().toISOString(),
      financialTransactionId: savedTx.id,
      description: `Devolução ao motorista: ${notes}`,
      createdById: userId,
      createdAt: new Date().toISOString(),
    });

    await AuditLogger.logAction(
      companyId,
      'SecurityDeposit',
      deposit.id,
      AuditAction.UPDATE,
      userId,
      userName,
      previousState,
      updatedDeposit
    );

    return { deposit: updatedDeposit, movement };
  }

  public static async compensateSecurityDeposit(
    companyId: string,
    depositId: string,
    compensationAmount: number,
    receivableId: string,
    notes: string,
    userId: string,
    userName: string
  ): Promise<{ deposit: SecurityDeposit; movement: SecurityDepositMovement }> {
    const deposit = await this.depositRepo.findByIdForCompany(depositId, companyId);
    if (!deposit) throw new Error('Caução não encontrada');

    const availableToUse = deposit.receivedAmount - deposit.usedAmount - deposit.returnedAmount;
    if (compensationAmount > availableToUse) {
      throw new Error(`Valor de compensação excede o saldo disponível de caução (R$ ${availableToUse.toFixed(2)})`);
    }

    const previousState = { ...deposit };

    const newUsed = roundCurrency(deposit.usedAmount + compensationAmount);
    const isFullyUsed = (newUsed + deposit.returnedAmount) >= deposit.receivedAmount;
    const newStatus = isFullyUsed ? SecurityDepositStatus.USED : SecurityDepositStatus.PARTIALLY_USED;

    const updatedDeposit = await this.depositRepo.updateForCompany(deposit.id, companyId, {
      usedAmount: newUsed,
      status: newStatus,
      notes: notes ? `${deposit.notes || ''} | ${notes}` : deposit.notes,
    });

    const movement = await this.depositMovementRepo.createForCompany(companyId, {
      id: generateUUID(),
      securityDepositId: deposit.id,
      companyId,
      type: SecurityDepositMovementType.COMPENSATION,
      amount: compensationAmount,
      date: new Date().toISOString(),
      receivableId,
      description: `Compensação de débito: ${notes}`,
      createdById: userId,
      createdAt: new Date().toISOString(),
    });

    // Settle associated receivable via compensation without creating duplicate bank cash movement
    if (receivableId) {
      const receivable = await this.recRepo.findByIdForCompany(receivableId, companyId);
      if (!receivable) {
        throw new Error('Conta a receber não encontrada ou pertence a outra empresa');
      }
      
      const effectivePaid = roundCurrency(receivable.paidAmount + compensationAmount);
      const balanceAmount = roundCurrency(Math.max(0, receivable.updatedAmount - effectivePaid));
      const recStatus = balanceAmount <= 0.01 ? ObligationStatus.PAID : ObligationStatus.PARTIALLY_PAID;
      await this.recRepo.updateForCompany(receivable.id, companyId, {
        paidAmount: effectivePaid,
        balanceAmount,
        status: recStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    await AuditLogger.logAction(
      companyId,
      'SecurityDeposit',
      deposit.id,
      AuditAction.UPDATE,
      userId,
      userName,
      previousState,
      updatedDeposit
    );

    return { deposit: updatedDeposit, movement };
  }
}