import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PostgresCreditCardStatementRepository } from '../db/repositories/postgresCreditCardStatementRepository';
import { AuditAction } from '../types/enums';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';

export interface CreditCardStatementActor {
  companyId: string;
  userId: string;
  name: string;
}

export interface CreateCreditCardProfileInput {
  financialAccountId: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
}

export interface CreateCreditCardStatementInput {
  creditCardProfileId: string;
  cycleRef: string;
  closingDate: string;
  dueDate: string;
}

export interface AttachCreditCardStatementItemInput {
  financialTransactionId: string;
  payableId?: string;
  originType?: string;
  originId?: string;
  originalAmount: number;
  adjustmentAmount?: number;
}

export interface LinkCreditCardStatementPaymentInput {
  financialTransactionId: string;
  idempotencyKey: string;
}

export interface ApplyCreditCardStatementAdjustmentInput {
  interestAmount: number;
  fineAmount: number;
  discountAmount: number;
  reason: string;
  idempotencyKey: string;
}

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Valor financeiro inválido');
  return Math.round(amount * 100) / 100;
}

function intDay(value: unknown): number {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Dia de cartão inválido');
  return day;
}

function requiredText(value: unknown, max: number, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new Error(`${label} inválido`);
  return normalized;
}

async function audit(txContext: any, actor: CreditCardStatementActor, entityName: string, entityId: string, action: AuditAction, previousState: unknown, newState: unknown): Promise<void> {
  await txContext.getAuditLogRepo().create({
    id: randomUUID(), companyId: actor.companyId, entityName, entityId, action,
    userId: actor.userId, userName: actor.name,
    previousState: previousState == null ? undefined : JSON.stringify(previousState),
    newState: newState == null ? undefined : JSON.stringify(newState),
    timestamp: new Date().toISOString(),
  });
}

async function lock(tx: any, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${key})))`);
}

export class CreditCardStatementAuthority {
  static async listProfiles(actor: CreditCardStatementActor) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const repo = new PostgresCreditCardStatementRepository(txContext.getRawTransaction());
      return repo.listProfiles(actor.companyId);
    });
  }

  static async createProfile(actor: CreditCardStatementActor, input: CreateCreditCardProfileInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardStatementRepository(tx);
      const limit = money(input.creditLimit);
      if (limit < 0) throw new Error('Limite de crédito inválido');
      const closingDay = intDay(input.closingDay); const dueDay = intDay(input.dueDay);
      await lock(tx, `${actor.companyId}:credit-card-profile:${input.financialAccountId}`);
      const account = await repo.findFinancialAccountForUpdate(actor.companyId, input.financialAccountId);
      if (!account) throw new Error('Conta financeira não encontrada');
      if (account.type !== 'CREDIT_CARD') throw new Error('Conta financeira incompatível com cartão');
      if (account.status !== 'ACTIVE') throw new Error('Conta de cartão inativa');
      const existing = await repo.findProfileByAccount(actor.companyId, input.financialAccountId);
      if (existing) throw new Error('Perfil de cartão já existe');
      const id = randomUUID();
      const item = await repo.createProfile({ id, companyId: actor.companyId, financialAccountId: input.financialAccountId, creditLimit: limit, closingDay, dueDay, userId: actor.userId });
      await audit(txContext, actor, 'CreditCardProfile', id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async listStatements(actor: CreditCardStatementActor, profileId?: string) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const repo = new PostgresCreditCardStatementRepository(txContext.getRawTransaction());
      return repo.listStatements(actor.companyId, profileId);
    });
  }

  static async createStatement(actor: CreditCardStatementActor, input: CreateCreditCardStatementInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardStatementRepository(tx);
      await lock(tx, `${actor.companyId}:credit-card-statement:${input.creditCardProfileId}:${input.cycleRef}`);
      const profile = await repo.findProfileForUpdate(actor.companyId, input.creditCardProfileId);
      if (!profile) throw new Error('Perfil de cartão não encontrado');
      if (!profile.active) throw new Error('Perfil de cartão inativo');
      const id = randomUUID();
      const item = await repo.createStatement({ id, companyId: actor.companyId, creditCardProfileId: input.creditCardProfileId, cycleRef: input.cycleRef, closingDate: input.closingDate, dueDate: input.dueDate, userId: actor.userId });
      await audit(txContext, actor, 'CreditCardStatement', id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async attachItem(actor: CreditCardStatementActor, statementId: string, input: AttachCreditCardStatementItemInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardStatementRepository(tx);
      const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (statement.status !== 'OPEN') throw new Error('Fatura fechada não aceita novos itens');
      const transaction = await repo.findTransactionForItemForUpdate(actor.companyId, input.financialTransactionId);
      if (!transaction) throw new Error('Transação financeira não encontrada');
      if (transaction.type !== 'EXPENSE' || transaction.financial_account_id !== statement.financial_account_id) throw new Error('Transação incompatível com a fatura');
      const originalAmount = money(input.originalAmount); const adjustmentAmount = money(input.adjustmentAmount || 0); const finalAmount = money(originalAmount + adjustmentAmount);
      if (originalAmount < 0 || finalAmount < 0 || originalAmount > money(transaction.amount)) throw new Error('Valor do item incompatível com a transação');
      const id = randomUUID();
      const item = await repo.createItem({ id, companyId: actor.companyId, statementId, financialTransactionId: input.financialTransactionId, payableId: input.payableId, originType: input.originType, originId: input.originId, originalAmount, adjustmentAmount, finalAmount, userId: actor.userId });
      const totals = await repo.statementItemTotals(actor.companyId, statementId);
      await repo.updateStatementItemTotals(actor.companyId, statementId, totals, actor.userId);
      await audit(txContext, actor, 'CreditCardStatementItem', id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async closeStatement(actor: CreditCardStatementActor, statementId: string) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const repo = new PostgresCreditCardStatementRepository(txContext.getRawTransaction());
      const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (statement.status === 'CLOSED' || statement.status === 'PARTIALLY_PAID' || statement.status === 'PAID') return statement;
      if (statement.status !== 'OPEN') throw new Error('Estado de fatura incompatível com fechamento');
      const beforeCount = await repo.countTransactions(actor.companyId);
      const updated = await repo.closeStatement(actor.companyId, statementId, actor.userId);
      const afterCount = await repo.countTransactions(actor.companyId);
      if (beforeCount !== afterCount) throw new Error('Fechamento de fatura não pode criar transação financeira');
      await audit(txContext, actor, 'CreditCardStatement', statementId, AuditAction.UPDATE, statement, updated);
      return updated;
    });
  }

  static async linkPayment(actor: CreditCardStatementActor, statementId: string, input: LinkCreditCardStatementPaymentInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardStatementRepository(tx);
      await lock(tx, `${actor.companyId}:credit-card-payment:${input.idempotencyKey}`);
      const replay = await repo.findPaymentByIdempotency(actor.companyId, input.idempotencyKey);
      if (replay) {
        if (replay.statement_id !== statementId || replay.financial_transaction_id !== input.financialTransactionId) throw new Error('Chave idempotente divergente');
        return { item: replay, replayed: true };
      }
      const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (!['CLOSED','PARTIALLY_PAID'].includes(statement.status)) throw new Error('Fatura não está elegível para pagamento');
      const transaction = await repo.findTransferForUpdate(actor.companyId, input.financialTransactionId);
      if (!transaction) throw new Error('Transferência de pagamento não encontrada');
      if (transaction.type !== 'TRANSFER' || transaction.destination_account_id !== statement.financial_account_id || transaction.is_reversed) throw new Error('Transferência incompatível com a fatura');
      const amount = money(transaction.amount);
      const balance = money(statement.balance_amount);
      if (amount <= 0 || amount > balance) throw new Error('Pagamento deve ser positivo e não pode exceder o saldo autoritativo da fatura');
      const id = randomUUID();
      const item = await repo.createPayment({ id, companyId: actor.companyId, statementId, financialTransactionId: input.financialTransactionId, amount, idempotencyKey: input.idempotencyKey, userId: actor.userId });
      const paidAmount = money(statement.paid_amount) + amount; const balanceAmount = money(statement.balance_amount) - amount; const status = balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      const updated = await repo.applyPaymentToStatement({ companyId: actor.companyId, statementId, paidAmount, balanceAmount, status, userId: actor.userId });
      await audit(txContext, actor, 'CreditCardStatementPayment', id, AuditAction.CREATE, null, item);
      await audit(txContext, actor, 'CreditCardStatement', statementId, AuditAction.UPDATE, statement, updated);
      return { item, replayed: false, statement: updated };
    });
  }

  static async applyAdjustment(actor: CreditCardStatementActor, statementId: string, input: ApplyCreditCardStatementAdjustmentInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardStatementRepository(tx);
      const idempotencyKey = requiredText(input.idempotencyKey, 200, 'Chave idempotente');
      const reason = requiredText(input.reason, 1000, 'Motivo do ajuste');
      const interestAmount = money(input.interestAmount);
      const fineAmount = money(input.fineAmount);
      const discountAmount = money(input.discountAmount);
      if (interestAmount < 0 || fineAmount < 0 || discountAmount < 0) throw new Error('Valores de ajuste inválidos');
      if (interestAmount === 0 && fineAmount === 0 && discountAmount === 0) throw new Error('Ajuste financeiro vazio');

      await lock(tx, `${actor.companyId}:credit-card-adjustment:${idempotencyKey}`);
      const replay = await repo.findAdjustmentByIdempotency(actor.companyId, idempotencyKey);
      if (replay) {
        const matches = replay.statement_id === statementId
          && money(replay.interest_amount) === interestAmount
          && money(replay.fine_amount) === fineAmount
          && money(replay.discount_amount) === discountAmount
          && replay.reason === reason
          && replay.created_by_id === actor.userId;
        if (!matches) throw new Error('Chave idempotente divergente');
        const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
        return { item: replay, replayed: true, statement };
      }

      const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (!['CLOSED','PARTIALLY_PAID'].includes(statement.status)) throw new Error('Fatura não está elegível para ajuste');
      const currentBalance = money(statement.balance_amount);
      const newBalance = money(currentBalance + interestAmount + fineAmount - discountAmount);
      if (newBalance <= 0) throw new Error('Desconto excede o saldo elegível da fatura');

      const beforeCount = await repo.countTransactions(actor.companyId);
      const id = randomUUID();
      const item = await repo.createAdjustment({ id, companyId: actor.companyId, statementId, interestAmount, fineAmount, discountAmount, reason, idempotencyKey, userId: actor.userId });
      const updated = await repo.applyStatementAdjustment({ companyId: actor.companyId, statementId, interestAmount, fineAmount, discountAmount, balanceAmount: newBalance, userId: actor.userId });
      const afterCount = await repo.countTransactions(actor.companyId);
      if (beforeCount !== afterCount) throw new Error('Ajuste de fatura não pode criar transação financeira');
      await audit(txContext, actor, 'CreditCardStatementAdjustment', id, AuditAction.CREATE, null, item);
      await audit(txContext, actor, 'CreditCardStatement', statementId, AuditAction.UPDATE, statement, { ...updated, adjustmentReason: reason });
      return { item, replayed: false, statement: updated };
    });
  }
}
