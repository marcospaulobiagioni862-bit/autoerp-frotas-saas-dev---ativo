import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PostgresCreditCardStatementCreditRepository } from '../db/repositories/postgresCreditCardStatementCreditRepository';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { AuditAction } from '../types/enums';
import type { CreditCardStatementActor } from './creditCardStatementAuthority';

export interface ApplyPostCloseCreditInput {
  financialTransactionId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Valor financeiro inválido');
  return Math.round(amount * 100) / 100;
}

function requiredText(value: unknown, max: number, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new Error(`${label} inválido`);
  return normalized;
}

async function lock(tx: any, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${key})))`);
}

async function audit(txContext: any, actor: CreditCardStatementActor, entityName: string, entityId: string, previousState: unknown, newState: unknown): Promise<void> {
  await txContext.getAuditLogRepo().create({
    id: randomUUID(), companyId: actor.companyId, entityName, entityId, action: AuditAction.UPDATE,
    userId: actor.userId, userName: actor.name,
    previousState: previousState == null ? undefined : JSON.stringify(previousState),
    newState: newState == null ? undefined : JSON.stringify(newState),
    timestamp: new Date().toISOString(),
  });
}

export class CreditCardStatementCreditAuthority {
  static async apply(actor: CreditCardStatementActor, statementId: string, input: ApplyPostCloseCreditInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardStatementCreditRepository(tx);
      const idempotencyKey = requiredText(input.idempotencyKey, 200, 'Chave idempotente');
      const financialTransactionId = requiredText(input.financialTransactionId, 200, 'Transação financeira');
      const reason = requiredText(input.reason, 1000, 'Motivo do crédito');
      const amount = money(input.amount);
      if (amount <= 0) throw new Error('Valor de crédito inválido');

      await lock(tx, `${actor.companyId}:credit-card-post-close-credit:${idempotencyKey}`);
      const replay = await repo.findCreditByIdempotency(actor.companyId, idempotencyKey);
      if (replay) {
        const matches = replay.statement_id === statementId
          && replay.financial_transaction_id === financialTransactionId
          && money(replay.amount) === amount
          && replay.reason === reason
          && replay.created_by_id === actor.userId;
        if (!matches) throw new Error('Chave idempotente divergente');
        const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
        return { item: replay, replayed: true, statement };
      }

      await lock(tx, `${actor.companyId}:credit-card-post-close-credit:transaction:${financialTransactionId}`);
      const statement = await repo.findStatementForUpdate(actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');
      if (!['CLOSED', 'PARTIALLY_PAID'].includes(statement.status)) throw new Error('Fatura não está elegível para crédito pós-fechamento');

      const item = await repo.findItemForTransactionForUpdate(actor.companyId, statementId, financialTransactionId);
      if (!item) throw new Error('Compra não pertence à fatura informada');
      const transaction = await repo.findTransactionForUpdate(actor.companyId, financialTransactionId);
      if (!transaction) throw new Error('Transação financeira não encontrada');
      if (transaction.type !== 'EXPENSE' || transaction.is_reversed) throw new Error('Transação não está elegível para crédito pós-fechamento');

      const alreadyCredited = money(await repo.creditedAmount(actor.companyId, financialTransactionId));
      const reversible = money(item.final_amount) - alreadyCredited;
      if (amount > reversible) throw new Error('Crédito excede o valor econômico reversível da compra');
      const currentBalance = money(statement.balance_amount);
      if (amount > currentBalance) throw new Error('Crédito excede o saldo autoritativo da fatura');

      const beforeCount = await repo.countTransactions(actor.companyId);
      const id = randomUUID();
      const credit = await repo.createCredit({
        id, companyId: actor.companyId, statementId, statementItemId: item.id,
        financialTransactionId, amount, reason, idempotencyKey, userId: actor.userId,
      });
      const updated = await repo.applyCreditToStatement({ companyId: actor.companyId, statementId, amount, userId: actor.userId });
      const afterCount = await repo.countTransactions(actor.companyId);
      if (beforeCount !== afterCount) throw new Error('Crédito pós-fechamento não pode criar transação financeira');

      await audit(txContext, actor, 'CreditCardStatementCredit', id, null, credit);
      await audit(txContext, actor, 'CreditCardStatement', statementId, statement, { ...updated, creditReason: reason, creditAmount: amount });
      return { item: credit, replayed: false, statement: updated };
    });
  }
}
