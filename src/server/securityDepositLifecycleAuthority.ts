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
import type { FinancialTransaction, SecurityDeposit, SecurityDepositMovement } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';

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
type Result = { deposit: SecurityDeposit; movement: SecurityDepositMovement };

const commandKey = (value: unknown): string => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key || key.length > 200) throw new Error('Chave de idempotência é obrigatória e deve ter até 200 caracteres');
  return key;
};
const positiveMoney = (value: unknown, label: string): number => {
  const amount = roundCurrency(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} deve ser positivo`);
  return amount;
};
const available = (d: SecurityDeposit): number => roundCurrency(Number(d.receivedAmount) - Number(d.usedAmount) - Number(d.returnedAmount));
const notes = (current?: string, next?: string): string | undefined => {
  const clean = typeof next === 'string' ? next.trim() : '';
  return clean ? (current ? `${current} | ${clean}` : clean) : current;
};
const financialDate = (value?: string): string => {
  const date = value?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Data da devolução inválida');
  return date;
};

export class SecurityDepositLifecycleAuthority {
  static async returnDeposit(actor: AuthenticatedPrincipal, command: ReturnSecurityDepositCommand): Promise<Result> {
    const companyId = actor.companyId;
    const amount = positiveMoney(command.amount, 'Valor de devolução');
    const idempotencyKey = commandKey(command.idempotencyKey);
    const transactionDate = financialDate(command.transactionDate);

    return UnitOfWork.run(companyId, async (ctx: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, companyId, 'PAYMENT_REGISTER', ctx);
      await FinancialPeriodService.assertDateOpen(companyId, transactionDate, ctx);
      const raw = ctx.getRawTransaction?.();
      if (!raw) throw new Error('Autoridade PostgreSQL da caução indisponível');

      const priorRows = await raw.execute(sql`SELECT * FROM security_deposit_commands WHERE company_id=${companyId} AND idempotency_key=${idempotencyKey} FOR UPDATE`);
      const prior = priorRows.rows?.[0];
      if (prior) {
        if (prior.command_type !== 'RETURN' || prior.security_deposit_id !== command.depositId || Number(prior.amount) !== amount || !prior.financial_transaction_id) throw new Error('Chave de idempotência reutilizada com devolução de caução diferente');
        const tx = await ctx.getTransactionRepo().findById(prior.financial_transaction_id);
        const movement = await ctx.getSecurityDepositMovementRepo().findByFinancialTransactionId(prior.financial_transaction_id);
        const deposit = await ctx.getSecurityDepositRepo().findById(command.depositId);
        if (!tx || !movement || !deposit || tx.financialAccountId !== command.financialAccountId || tx.paymentMethodId !== command.paymentMethodId || tx.transactionDate !== transactionDate || roundCurrency(Number(tx.amount)) !== amount) throw new Error('Evidência idempotente da devolução de caução está inconsistente');
        return { deposit, movement };
      }

      await raw.execute(sql`SELECT id FROM security_deposits WHERE company_id=${companyId} AND id=${command.depositId} FOR UPDATE`);
      const depositRepo = ctx.getSecurityDepositRepo();
      const movementRepo = ctx.getSecurityDepositMovementRepo();
      const deposit = await depositRepo.findById(command.depositId);
      if (!deposit || deposit.companyId !== companyId) throw new Error('Caução não encontrada ou pertence a outra empresa');
      const currentAvailable = available(deposit);
      if (amount > currentAvailable) throw new Error(`Valor de devolução excede o saldo disponível de caução (R$ ${currentAvailable.toFixed(2)})`);

      const account = await ctx.findFinancialAccountByIdWithLock?.(command.financialAccountId);
      if (!account || account.companyId !== companyId || account.status !== 'ACTIVE') throw new Error('Conta financeira não encontrada, inativa ou pertence a outra empresa');
      const paymentMethod = await ctx.getPaymentMethodRepo?.().findById(command.paymentMethodId);
      if (!paymentMethod || paymentMethod.companyId !== companyId || !paymentMethod.active) throw new Error('Forma de pagamento não encontrada, inativa ou pertence a outra empresa');

      const now = new Date().toISOString();
      const before = { ...deposit };
      const tx: FinancialTransaction = {
        id: generateUUID(), companyId, financialAccountId: command.financialAccountId,
        type: TransactionType.EXPENSE, amount, paymentMethodId: command.paymentMethodId,
        transactionDate, competenceDate: transactionDate,
        description: `Devolução de Caução (Contrato: ${deposit.contractId})`, isReversed: false,
        vehicleId: deposit.vehicleId, driverId: deposit.driverId, createdById: actor.userId,
        idempotencyKey, createdAt: now, updatedAt: now,
      };
      const savedTx = await ctx.getTransactionRepo().create(tx);
      await ctx.getAccountRepo().updateBalance(command.financialAccountId, -amount);
      const returnedAmount = roundCurrency(Number(deposit.returnedAmount) + amount);
      const exhausted = roundCurrency(returnedAmount + Number(deposit.usedAmount)) >= roundCurrency(Number(deposit.receivedAmount));
      const updated = await depositRepo.update(deposit.id, {
        returnedAmount, returnedAt: now,
        status: exhausted ? SecurityDepositStatus.RETURNED : SecurityDepositStatus.PARTIALLY_USED,
        notes: notes(deposit.notes, command.notes), updatedAt: now,
      });
      const movement = await movementRepo.create({
        id: generateUUID(), securityDepositId: deposit.id, companyId,
        type: SecurityDepositMovementType.RETURN, amount, date: now,
        financialTransactionId: savedTx.id,
        description: command.notes?.trim() ? `Devolução ao motorista: ${command.notes.trim()}` : 'Devolução de caução ao motorista',
        createdById: actor.userId, createdAt: now,
      });
      await raw.execute(sql`INSERT INTO security_deposit_commands (id,company_id,idempotency_key,command_type,security_deposit_id,financial_transaction_id,movement_id,amount,created_by_id,created_at) VALUES (${generateUUID()},${companyId},${idempotencyKey},'RETURN',${deposit.id},${savedTx.id},${movement.id},${amount},${actor.userId},${now})`);
      await ctx.getAuditLogRepo().create({
        id: generateUUID(), companyId, entityName: 'SecurityDeposit', entityId: deposit.id,
        action: AuditAction.UPDATE, userId: actor.userId, userName: actor.name, timestamp: now,
        previousState: JSON.stringify(before), newState: JSON.stringify(updated),
      });
      return { deposit: updated, movement };
    }, { financialPeriodLock: 'SHARED' });
  }

  static async compensateDeposit(actor: AuthenticatedPrincipal, command: CompensateSecurityDepositCommand): Promise<Result> {
    const companyId = actor.companyId;
    const amount = positiveMoney(command.amount, 'Valor de compensação');
    const idempotencyKey = commandKey(command.idempotencyKey);

    return UnitOfWork.run(companyId, async (ctx: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, companyId, 'RECEIPT_REGISTER', ctx);
      const raw = ctx.getRawTransaction?.();
      if (!raw) throw new Error('Autoridade PostgreSQL da caução indisponível');

      const priorRows = await raw.execute(sql`SELECT * FROM security_deposit_commands WHERE company_id=${companyId} AND idempotency_key=${idempotencyKey} FOR UPDATE`);
      const prior = priorRows.rows?.[0];
      if (prior) {
        if (prior.command_type !== 'COMPENSATION' || prior.security_deposit_id !== command.depositId || prior.receivable_id !== command.receivableId || Number(prior.amount) !== amount) throw new Error('Chave de idempotência reutilizada com compensação de caução diferente');
        const deposit = await ctx.getSecurityDepositRepo().findById(command.depositId);
        const movementRows = await raw.execute(sql`SELECT * FROM security_deposit_movements WHERE company_id=${companyId} AND id=${prior.movement_id} LIMIT 1`);
        const row = movementRows.rows?.[0];
        if (!deposit || !row) throw new Error('Evidência idempotente da compensação de caução está inconsistente');
        return { deposit, movement: {
          id: row.id, securityDepositId: row.deposit_id, companyId: row.company_id, type: row.type,
          amount: Number(row.amount), date: row.date, financialTransactionId: row.financial_transaction_id || undefined,
          receivableId: row.receivable_id || undefined, description: row.description,
          createdById: row.created_by_id, createdAt: row.created_at,
        } as SecurityDepositMovement };
      }

      await raw.execute(sql`SELECT id FROM security_deposits WHERE company_id=${companyId} AND id=${command.depositId} FOR UPDATE`);
      const depositRepo = ctx.getSecurityDepositRepo();
      const movementRepo = ctx.getSecurityDepositMovementRepo();
      const deposit = await depositRepo.findById(command.depositId);
      if (!deposit || deposit.companyId !== companyId) throw new Error('Caução não encontrada ou pertence a outra empresa');
      const currentAvailable = available(deposit);
      if (amount > currentAvailable) throw new Error(`Valor de compensação excede o saldo disponível de caução (R$ ${currentAvailable.toFixed(2)})`);

      const receivable = await ctx.findReceivableByIdWithLock?.(command.receivableId);
      if (!receivable || receivable.companyId !== companyId) throw new Error('Conta a receber não encontrada ou pertence a outra empresa');
      if (receivable.driverId && receivable.driverId !== deposit.driverId) throw new Error('Conta a receber não pertence ao motorista da caução');
      if (receivable.contractId && receivable.contractId !== deposit.contractId) throw new Error('Conta a receber não pertence ao contrato da caução');
      const balance = roundCurrency(Number(receivable.balanceAmount));
      if (balance <= 0) throw new Error('Conta a receber não possui saldo para compensação');
      if (amount > balance) throw new Error(`Valor de compensação excede o saldo da conta a receber (R$ ${balance.toFixed(2)})`);

      const now = new Date().toISOString();
      const before = { ...deposit };
      const usedAmount = roundCurrency(Number(deposit.usedAmount) + amount);
      const exhausted = roundCurrency(usedAmount + Number(deposit.returnedAmount)) >= roundCurrency(Number(deposit.receivedAmount));
      const updated = await depositRepo.update(deposit.id, {
        usedAmount, status: exhausted ? SecurityDepositStatus.USED : SecurityDepositStatus.PARTIALLY_USED,
        notes: notes(deposit.notes, command.notes), updatedAt: now,
      });
      const newPaid = roundCurrency(Number(receivable.paidAmount) + amount);
      const newBalance = roundCurrency(Math.max(0, balance - amount));
      await ctx.getReceivableRepo().update(receivable.id, {
        paidAmount: newPaid, balanceAmount: newBalance,
        status: newBalance <= 0.01 ? ObligationStatus.PAID : ObligationStatus.PARTIALLY_PAID,
        updatedAt: now,
      });
      const movement = await movementRepo.create({
        id: generateUUID(), securityDepositId: deposit.id, companyId,
        type: SecurityDepositMovementType.COMPENSATION, amount, date: now, receivableId: receivable.id,
        description: command.notes?.trim() ? `Compensação de débito: ${command.notes.trim()}` : 'Compensação de conta a receber com caução',
        createdById: actor.userId, createdAt: now,
      });
      await raw.execute(sql`INSERT INTO security_deposit_commands (id,company_id,idempotency_key,command_type,security_deposit_id,receivable_id,movement_id,amount,created_by_id,created_at) VALUES (${generateUUID()},${companyId},${idempotencyKey},'COMPENSATION',${deposit.id},${receivable.id},${movement.id},${amount},${actor.userId},${now})`);
      await ctx.getAuditLogRepo().create({
        id: generateUUID(), companyId, entityName: 'SecurityDeposit', entityId: deposit.id,
        action: AuditAction.UPDATE, userId: actor.userId, userName: actor.name, timestamp: now,
        previousState: JSON.stringify(before), newState: JSON.stringify(updated),
      });
      return { deposit: updated, movement };
    });
  }
}
