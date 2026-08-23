import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { FinancialPeriodService } from '../domain/finance/FinancialPeriodService';
import { generateUUID } from '../shared/utils/uuid';
import { roundCurrency } from '../shared/utils/currency';
import {
  AuditAction,
  ObligationStatus,
  SecurityDepositMovementType,
  SecurityDepositStatus,
  TransactionType,
} from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import type { FinancialTransaction, SecurityDeposit, SecurityDepositMovement } from '../types/entities';

export interface ReturnSecurityDepositCommand {
  depositId: string;
  amount: number;
  financialAccountId: string;
  paymentMethodId: string;
  transactionDate?: string;
  notes?: string;
  idempotencyKey: string;
}

export interface CompensateSecurityDepositCommand {
  depositId: string;
  receivableId: string;
  amount: number;
  notes?: string;
  idempotencyKey: string;
}

type LifecycleResult = { deposit: SecurityDeposit; movement: SecurityDepositMovement };

function money(value: unknown, label: string): number {
  const amount = roundCurrency(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} deve ser positivo`);
  return amount;
}

function key(value: unknown): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 200) throw new Error('Chave de idempotência é obrigatória e deve ter até 200 caracteres');
  return result;
}

function isoDate(value?: string): string {
  const candidate = value?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error('Data da devolução inválida');
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
    throw new Error('Data da devolução inválida');
  }
  return candidate;
}

function available(deposit: SecurityDeposit): number {
  return roundCurrency(Number(deposit.receivedAmount) - Number(deposit.usedAmount) - Number(deposit.returnedAmount));
}

function appendNotes(current: string | undefined, next: string | undefined): string | undefined {
  const clean = typeof next === 'string' ? next.trim() : '';
  if (!clean) return current;
  return current ? `${current} | ${clean}` : clean;
}

export class SecurityDepositLifecycleAuthority {
  static async returnDeposit(actor: AuthenticatedPrincipal, command: ReturnSecurityDepositCommand): Promise<LifecycleResult> {
    const companyId = actor.companyId;
    const amount = money(command.amount, 'Valor de devolução');
    const idempotencyKey = key(command.idempotencyKey);
    const transactionDate = isoDate(command.transactionDate);

    return await UnitOfWork.run(companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, companyId, 'PAYMENT_REGISTER', txContext);
      await FinancialPeriodService.assertDateOpen(companyId, transactionDate, txContext);
      const raw = txContext.getRawTransaction?.();
      if (!raw) throw new Error('Autoridade PostgreSQL da caução indisponível');

      const existingCommand = await raw.execute(sql`
        SELECT * FROM security_deposit_commands
        WHERE company_id = ${companyId} AND idempotency_key = ${idempotencyKey}
        FOR UPDATE
      `);
      const prior = existingCommand.rows?.[0];
      if (prior) {
        if (
          prior.command_type !== 'RETURN' || prior.security_deposit_id !== command.depositId ||
          roundCurrency(Number(prior.amount)) !== amount || !prior.financial_transaction_id
        ) throw new Error('Chave de idempotência reutilizada com devolução de caução diferente');
        const tx = await txContext.getTransactionRepo().findById(prior.financial_transaction_id);
        const movement = await txContext.getSecurityDepositMovementRepo().findByFinancialTransactionId(prior.financial_transaction_id);
        const deposit = await txContext.getSecurityDepositRepo().findById(command.depositId);
        if (!tx || !movement || !deposit || tx.financialAccountId !== command.financialAccountId || tx.paymentMethodId !== command.paymentMethodId || tx.transactionDate !== transactionDate || roundCurrency(Number(tx.amount)) !== amount) {
          throw new Error('Evidência idempotente da devolução de caução está inconsistente');
        }
        return { deposit, movement };
      }

      await raw.execute(sql`
        SELECT id FROM security_deposits
        WHERE company_id = ${companyId} AND id = ${command.depositId}
        FOR UPDATE
      `);
      const depositRepo = txContext.getSecurityDepositRepo();
      const movementRepo = txContext.getSecurityDepositMovementRepo();
      const txRepo = txContext.getTransactionRepo();
      const accountRepo = txContext.getAccountRepo();
      const auditRepo = txContext.getAuditLogRepo();
      const paymentMethodRepo = txContext.getPaymentMethodRepo?.();
      const deposit = await depositRepo.findById(command.depositId);
      if (!deposit || deposit.companyId !== companyId) throw new Error('Caução não encontrada ou pertence a outra empresa');
      if (!(amount <= available(deposit))) throw new Error(`Valor de devolução excede o saldo disponível de caução (R$ ${available(deposit).toFixed(2)})`);

      const account = await txContext.findFinancialAccountByIdWithLock?.(command.financialAccountId);
      if (!account || account.companyId !== companyId || account.status !== 'ACTIVE') throw new Error('Conta financeira não encontrada, inativa ou pertence a outra empresa');
      const paymentMethod = paymentMethodRepo ? await paymentMethodRepo.findById(command.paymentMethodId) : null;
      if (!paymentMethod || paymentMethod.companyId !== companyId || !paymentMethod.active) throw new Error('Forma de pagamento não encontrada, inativa ou pertence a outra empresa');

      const now = new Date().toISOString();
      const previousState = { ...deposit };
      const financialTx: FinancialTransaction = {
        id: generateUUID(), companyId, financialAccountId: command.financialAccountId,
        type: TransactionType.EXPENSE, amount, paymentMethodId: command.paymentMethodId,
        transactionDate, competenceDate: transactionDate,
        description: `Devolução de Caução (Contrato: ${deposit.contractId})`, isReversed: false,
        vehicleId: deposit.vehicleId, driverId: deposit.driverId, createdById: actor.userId,
        idempotencyKey, createdAt: now, updatedAt: now,
      };
      const savedTx = await txRepo.create(financialTx);
      await accountRepo.updateBalance(command.financialAccountId, -amount);

      const returnedAmount = roundCurrency(Number(deposit.returnedAmount) + amount);
      const exhausted = roundCurrency(returnedAmount + Number(deposit.usedAmount)) >= roundCurrency(Number(deposit.receivedAmount));
      const updatedDeposit = await depositRepo.update(deposit.id, {
        returnedAmount,
        returnedAt: now,
        status: exhausted ? SecurityDepositStatus.RETURNED : SecurityDepositStatus.PARTIALLY_USED,
        notes: appendNotes(deposit.notes, command.notes),
        updatedAt: now,
      });
      const movement = await movementRepo.create({
        id: generateUUID(), securityDepositId: deposit.id, companyId,
        type: SecurityDepositMovementType.RETURN, amount, date: now,
        financialTransactionId: savedTx.id,
        description: command.notes?.trim() ? `Devolução ao motorista: ${command.notes.trim()}` : 'Devolução de caução ao motorista',
        createdById: actor.userId, createdAt: now,
      });
      await raw.execute(sql`
        INSERT INTO security_deposit_commands
          (id, company_id, idempotency_key, command_type, security_deposit_id, financial_transaction_id, movement_id, amount, created_by_id, created_at)
        VALUES
          (${generateUUID()}, ${companyId}, ${idempotencyKey}, 'RETURN', ${deposit.id}, ${savedTx.id}, ${movement.id}, ${amount}, ${actor.userId}, ${now})
      `);
      await auditRepo.create({
        id: generateUUID(), companyId, entityName: 'SecurityDeposit', entityId: deposit.id,
        action: AuditAction.UPDATE, userId: actor.userId, userName: actor.userName,
        timestamp: now, previousState: JSON.stringify(previousState), newState: JSON.stringify(updatedDeposit),
      });
      return { deposit: updatedDeposit, movement };
    }, { financialPeriodLock: 'SHARED' });
  }

  static async compensateDeposit(actor: AuthenticatedPrincipal, command: CompensateSecurityDepositCommand): Promise<LifecycleResult> {
    const companyId = actor.companyId;
    const amount = money(command.amount, 'Valor de compensação');
    const idempotencyKey = key(command.idempotencyKey);

    return await UnitOfWork.run(companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, companyId, 'RECEIPT_REGISTER', txContext);
      const raw = txContext.getRawTransaction?.();
      if (!raw) throw new Error('Autoridade PostgreSQL da caução indisponível');

      const existingCommand = await raw.execute(sql`
        SELECT * FROM security_deposit_commands
        WHERE company_id = ${companyId} AND idempotency_key = ${idempotencyKey}
        FOR UPDATE
      `);
      const prior = existingCommand.rows?.[0];
      if (prior) {
        if (prior.command_type !== 'COMPENSATION' || prior.security_deposit_id !== command.depositId || prior.receivable_id !== command.receivableId || roundCurrency(Number(prior.amount)) !== amount) {
          throw new Error('Chave de idempotência reutilizada com compensação de caução diferente');
        }
        const deposit = await txContext.getSecurityDepositRepo().findById(command.depositId);
        const movementRows = await raw.execute(sql`
          SELECT * FROM security_deposit_movements WHERE company_id = ${companyId} AND id = ${prior.movement_id} LIMIT 1
        `);
        const row = movementRows.rows?.[0];
        if (!deposit || !row) throw new Error('Evidência idempotente da compensação de caução está inconsistente');
        const movement = {
          id: row.id, securityDepositId: row.deposit_id, companyId: row.company_id,
          type: row.type, amount: Number(row.amount), date: row.date,
          financialTransactionId: row.financial_transaction_id || undefined,
          receivableId: row.receivable_id || undefined, description: row.description,
          createdById: row.created_by_id, createdAt: row.created_at,
        } as SecurityDepositMovement;
        return { deposit, movement };
      }

      await raw.execute(sql`SELECT id FROM security_deposits WHERE company_id = ${companyId} AND id = ${command.depositId} FOR UPDATE`);
      const depositRepo = txContext.getSecurityDepositRepo();
      const movementRepo = txContext.getSecurityDepositMovementRepo();
      const receivableRepo = txContext.getReceivableRepo();
      const auditRepo = txContext.getAuditLogRepo();
      const deposit = await depositRepo.findById(command.depositId);
      if (!deposit || deposit.companyId !== companyId) throw new Error('Caução não encontrada ou pertence a outra empresa');
      if (!(amount <= available(deposit))) throw new Error(`Valor de compensação excede o saldo disponível de caução (R$ ${available(deposit).toFixed(2)})`);

      const receivable = await txContext.findReceivableByIdWithLock?.(command.receivableId);
      if (!receivable || receivable.companyId !== companyId) throw new Error('Conta a receber não encontrada ou pertence a outra empresa');
      if (receivable.driverId && receivable.driverId !== deposit.driverId) throw new Error('Conta a receber não pertence ao motorista da caução');
      if (receivable.contractId && receivable.contractId !== deposit.contractId) throw new Error('Conta a receber não pertence ao contrato da caução');
      const receivableBalance = roundCurrency(Number(receivable.balanceAmount));
      if (receivableBalance <= 0) throw new Error('Conta a receber não possui saldo para compensação');
      if (amount > receivableBalance) throw new Error(`Valor de compensação excede o saldo da conta a receber (R$ ${receivableBalance.toFixed(2)})`);

      const now = new Date().toISOString();
      const previousState = { ...deposit };
      const usedAmount = roundCurrency(Number(deposit.usedAmount) + amount);
      const exhausted = roundCurrency(usedAmount + Number(deposit.returnedAmount)) >= roundCurrency(Number(deposit.receivedAmount));
      const updatedDeposit = await depositRepo.update(deposit.id, {
        usedAmount,
        status: exhausted ? SecurityDepositStatus.USED : SecurityDepositStatus.PARTIALLY_USED,
        notes: appendNotes(deposit.notes, command.notes),
        updatedAt: now,
      });
      const newPaid = roundCurrency(Number(receivable.paidAmount) + amount);
      const newBalance = roundCurrency(Math.max(0, receivableBalance - amount));
      await receivableRepo.update(receivable.id, {
        paidAmount: newPaid,
        balanceAmount: newBalance,
        status: newBalance <= 0.01 ? ObligationStatus.PAID : ObligationStatus.PARTIALLY_PAID,
        updatedAt: now,
      });
      const movement = await movementRepo.create({
        id: generateUUID(), securityDepositId: deposit.id, companyId,
        type: SecurityDepositMovementType.COMPENSATION, amount, date: now,
        receivableId: receivable.id,
        description: command.notes?.trim() ? `Compensação de débito: ${command.notes.trim()}` : 'Compensação de conta a receber com caução',
        createdById: actor.userId, createdAt: now,
      });
      await raw.execute(sql`
        INSERT INTO security_deposit_commands
          (id, company_id, idempotency_key, command_type, security_deposit_id, receivable_id, movement_id, amount, created_by_id, created_at)
        VALUES
          (${generateUUID()}, ${companyId}, ${idempotencyKey}, 'COMPENSATION', ${deposit.id}, ${receivable.id}, ${movement.id}, ${amount}, ${actor.userId}, ${now})
      `);
      await auditRepo.create({
        id: generateUUID(), companyId, entityName: 'SecurityDeposit', entityId: deposit.id,
        action: AuditAction.UPDATE, userId: actor.userId, userName: actor.userName,
        timestamp: now, previousState: JSON.stringify(previousState), newState: JSON.stringify(updatedDeposit),
      });
      return { deposit: updatedDeposit, movement };
    });
  }
}
