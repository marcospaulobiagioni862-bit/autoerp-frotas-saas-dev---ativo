import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
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
  amount: number;
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

function rows(result: any): any[] { return result?.rows || []; }

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

async function profileForUpdate(tx: any, companyId: string, id: string): Promise<any> {
  return rows(await tx.execute(sql`SELECT * FROM credit_card_profiles WHERE company_id=${companyId} AND id=${id} FOR UPDATE`))[0] || null;
}

async function statementForUpdate(tx: any, companyId: string, id: string): Promise<any> {
  return rows(await tx.execute(sql`SELECT s.*,p.financial_account_id FROM credit_card_statements s JOIN credit_card_profiles p ON p.id=s.credit_card_profile_id WHERE s.company_id=${companyId} AND s.id=${id} FOR UPDATE OF s`))[0] || null;
}

export class CreditCardStatementAuthority {
  static async listProfiles(actor: CreditCardStatementActor) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const tx = txContext.getRawTransaction();
      return rows(await tx.execute(sql`SELECT id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_at,updated_at FROM credit_card_profiles WHERE company_id=${actor.companyId} ORDER BY created_at,id`));
    });
  }

  static async createProfile(actor: CreditCardStatementActor, input: CreateCreditCardProfileInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const limit = money(input.creditLimit);
      if (limit < 0) throw new Error('Limite de crédito inválido');
      const closingDay = intDay(input.closingDay); const dueDay = intDay(input.dueDay);
      await lock(tx, `${actor.companyId}:credit-card-profile:${input.financialAccountId}`);
      const account = rows(await tx.execute(sql`SELECT id,type,status FROM financial_accounts WHERE company_id=${actor.companyId} AND id=${input.financialAccountId} FOR UPDATE`))[0];
      if (!account) throw new Error('Conta financeira não encontrada');
      if (account.type !== 'CREDIT_CARD') throw new Error('Conta financeira incompatível com cartão');
      if (account.status !== 'ACTIVE') throw new Error('Conta de cartão inativa');
      const existing = rows(await tx.execute(sql`SELECT id FROM credit_card_profiles WHERE company_id=${actor.companyId} AND financial_account_id=${input.financialAccountId}`))[0];
      if (existing) throw new Error('Perfil de cartão já existe');
      const id = randomUUID();
      const item = rows(await tx.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id) VALUES(${id},${actor.companyId},${input.financialAccountId},${String(limit)},${closingDay},${dueDay},true,1,${actor.userId},${actor.userId}) RETURNING *`))[0];
      await audit(txContext, actor, 'CreditCardProfile', id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async listStatements(actor: CreditCardStatementActor, profileId?: string) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const tx = txContext.getRawTransaction();
      return profileId
        ? rows(await tx.execute(sql`SELECT * FROM credit_card_statements WHERE company_id=${actor.companyId} AND credit_card_profile_id=${profileId} ORDER BY closing_date DESC,id`))
        : rows(await tx.execute(sql`SELECT * FROM credit_card_statements WHERE company_id=${actor.companyId} ORDER BY closing_date DESC,id`));
    });
  }

  static async createStatement(actor: CreditCardStatementActor, input: CreateCreditCardStatementInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      await lock(tx, `${actor.companyId}:credit-card-statement:${input.creditCardProfileId}:${input.cycleRef}`);
      const profile = await profileForUpdate(tx, actor.companyId, input.creditCardProfileId);
      if (!profile) throw new Error('Perfil de cartão não encontrado');
      if (!profile.active) throw new Error('Perfil de cartão inativo');
      const id = randomUUID();
      const item = rows(await tx.execute(sql`INSERT INTO credit_card_statements(id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,original_amount,adjustment_amount,interest_amount,fine_amount,discount_amount,paid_amount,balance_amount,version,created_by_id,updated_by_id) VALUES(${id},${actor.companyId},${input.creditCardProfileId},${input.cycleRef},${input.closingDate},${input.dueDate},'OPEN',0,0,0,0,0,0,0,1,${actor.userId},${actor.userId}) RETURNING *`))[0];
      await audit(txContext, actor, 'CreditCardStatement', id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async attachItem(actor: CreditCardStatementActor, statementId: string, input: AttachCreditCardStatementItemInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const statement = await statementForUpdate(tx, actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (statement.status !== 'OPEN') throw new Error('Fatura fechada não aceita novos itens');
      const transaction = rows(await tx.execute(sql`SELECT id,type,amount,financial_account_id FROM financial_transactions WHERE company_id=${actor.companyId} AND id=${input.financialTransactionId} FOR UPDATE`))[0];
      if (!transaction) throw new Error('Transação financeira não encontrada');
      if (transaction.type !== 'EXPENSE' || transaction.financial_account_id !== statement.financial_account_id) throw new Error('Transação incompatível com a fatura');
      const originalAmount = money(input.originalAmount); const adjustmentAmount = money(input.adjustmentAmount || 0); const finalAmount = money(originalAmount + adjustmentAmount);
      if (originalAmount < 0 || finalAmount < 0 || originalAmount > money(transaction.amount)) throw new Error('Valor do item incompatível com a transação');
      const id = randomUUID();
      const item = rows(await tx.execute(sql`INSERT INTO credit_card_statement_items(id,company_id,statement_id,financial_transaction_id,payable_id,origin_type,origin_id,original_amount,adjustment_amount,final_amount,created_by_id) VALUES(${id},${actor.companyId},${statementId},${input.financialTransactionId},${input.payableId || null},${input.originType || null},${input.originId || null},${String(originalAmount)},${String(adjustmentAmount)},${String(finalAmount)},${actor.userId}) RETURNING *`))[0];
      const totals = rows(await tx.execute(sql`SELECT COALESCE(SUM(original_amount),0) original_amount,COALESCE(SUM(adjustment_amount),0) adjustment_amount,COALESCE(SUM(final_amount),0) balance_amount FROM credit_card_statement_items WHERE company_id=${actor.companyId} AND statement_id=${statementId}`))[0];
      await tx.execute(sql`UPDATE credit_card_statements SET original_amount=${totals.original_amount},adjustment_amount=${totals.adjustment_amount},balance_amount=${totals.balance_amount},updated_by_id=${actor.userId},updated_at=NOW(),version=version+1 WHERE company_id=${actor.companyId} AND id=${statementId}`);
      await audit(txContext, actor, 'CreditCardStatementItem', id, AuditAction.CREATE, null, item);
      return item;
    });
  }

  static async closeStatement(actor: CreditCardStatementActor, statementId: string) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const statement = await statementForUpdate(tx, actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (statement.status === 'CLOSED' || statement.status === 'PARTIALLY_PAID' || statement.status === 'PAID') return statement;
      if (statement.status !== 'OPEN') throw new Error('Estado de fatura incompatível com fechamento');
      const beforeCount = Number(rows(await tx.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${actor.companyId}`))[0]?.count || 0);
      const updated = rows(await tx.execute(sql`UPDATE credit_card_statements SET status='CLOSED',closed_at=NOW(),closed_by_id=${actor.userId},updated_by_id=${actor.userId},updated_at=NOW(),version=version+1 WHERE company_id=${actor.companyId} AND id=${statementId} RETURNING *`))[0];
      const afterCount = Number(rows(await tx.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${actor.companyId}`))[0]?.count || 0);
      if (beforeCount !== afterCount) throw new Error('Fechamento de fatura não pode criar transação financeira');
      await audit(txContext, actor, 'CreditCardStatement', statementId, AuditAction.UPDATE, statement, updated);
      return updated;
    });
  }

  static async linkPayment(actor: CreditCardStatementActor, statementId: string, input: LinkCreditCardStatementPaymentInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const amount = money(input.amount); if (amount <= 0) throw new Error('Valor de pagamento inválido');
      await lock(tx, `${actor.companyId}:credit-card-payment:${input.idempotencyKey}`);
      const replay = rows(await tx.execute(sql`SELECT * FROM credit_card_statement_payments WHERE company_id=${actor.companyId} AND idempotency_key=${input.idempotencyKey}`))[0];
      if (replay) {
        if (replay.statement_id !== statementId || replay.financial_transaction_id !== input.financialTransactionId || money(replay.amount) !== amount) throw new Error('Chave idempotente divergente');
        return { item: replay, replayed: true };
      }
      const statement = await statementForUpdate(tx, actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (!['CLOSED','PARTIALLY_PAID'].includes(statement.status)) throw new Error('Fatura não está elegível para pagamento');
      const transaction = rows(await tx.execute(sql`SELECT id,type,amount,destination_account_id,is_reversed FROM financial_transactions WHERE company_id=${actor.companyId} AND id=${input.financialTransactionId} FOR UPDATE`))[0];
      if (!transaction) throw new Error('Transferência de pagamento não encontrada');
      if (transaction.type !== 'TRANSFER' || transaction.destination_account_id !== statement.financial_account_id || transaction.is_reversed) throw new Error('Transferência incompatível com a fatura');
      if (amount > money(transaction.amount) || amount > money(statement.balance_amount)) throw new Error('Pagamento excede valor autoritativo');
      const id = randomUUID();
      const item = rows(await tx.execute(sql`INSERT INTO credit_card_statement_payments(id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id) VALUES(${id},${actor.companyId},${statementId},${input.financialTransactionId},${String(amount)},${input.idempotencyKey},${actor.userId}) RETURNING *`))[0];
      const paidAmount = money(statement.paid_amount) + amount; const balanceAmount = money(statement.balance_amount) - amount; const status = balanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      const updated = rows(await tx.execute(sql`UPDATE credit_card_statements SET paid_amount=${String(paidAmount)},balance_amount=${String(balanceAmount)},status=${status},updated_by_id=${actor.userId},updated_at=NOW(),version=version+1 WHERE company_id=${actor.companyId} AND id=${statementId} RETURNING *`))[0];
      await audit(txContext, actor, 'CreditCardStatementPayment', id, AuditAction.CREATE, null, item);
      await audit(txContext, actor, 'CreditCardStatement', statementId, AuditAction.UPDATE, statement, updated);
      return { item, replayed: false, statement: updated };
    });
  }
}
