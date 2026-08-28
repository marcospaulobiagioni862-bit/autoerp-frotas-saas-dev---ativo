import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PostgresCreditCardPurchaseCycleRepository } from '../db/repositories/postgresCreditCardPurchaseCycleRepository';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { AuditAction } from '../types/enums';
import type { CreditCardStatementActor } from './creditCardStatementAuthority';

export interface LinkCreditCardPurchaseInput {
  payableId?: string;
  originType?: string;
  originId?: string;
}

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Valor financeiro inválido');
  return Math.round(amount * 100) / 100;
}

async function advisoryLock(tx: any, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${key})))`);
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

export class CreditCardPurchaseCycleAuthority {
  static async linkPurchase(actor: CreditCardStatementActor, financialTransactionId: string, input: LinkCreditCardPurchaseInput) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_MASTER_DATA_MANAGE', txContext);
      const tx = txContext.getRawTransaction();
      const repo = new PostgresCreditCardPurchaseCycleRepository(tx);

      await advisoryLock(tx, `${actor.companyId}:credit-card-purchase-cycle:${financialTransactionId}`);
      const purchase = await repo.findPurchaseForUpdate(actor.companyId, financialTransactionId);
      if (!purchase) throw new Error('Transação financeira não encontrada');
      if (purchase.type !== 'EXPENSE') throw new Error('Transação incompatível com compra de cartão');
      if (purchase.is_reversed) throw new Error('Transação revertida não pode ser vinculada à fatura');
      const amount = money(purchase.amount);
      if (amount <= 0) throw new Error('Valor da compra incompatível');

      const profile = await repo.findProfileByAccountForUpdate(actor.companyId, purchase.financial_account_id);
      if (!profile) throw new Error('Perfil de cartão não encontrado para a conta da compra');
      if (!profile.active) throw new Error('Perfil de cartão inativo');

      const purchaseDate = String(purchase.transaction_date).slice(0, 10);
      const statement = await repo.findOpenStatementForPurchaseForUpdate(actor.companyId, profile.id, purchaseDate);
      if (!statement) throw new Error('Nenhuma fatura aberta compatível com a data da compra');

      const existing = await repo.findItemByTransaction(actor.companyId, financialTransactionId);
      if (existing) {
        if (existing.statement_id !== statement.id || money(existing.original_amount) !== amount || money(existing.final_amount) !== amount) {
          throw new Error('Compra já vinculada com payload ou ciclo divergente');
        }
        return { item: existing, statementId: existing.statement_id, cycleRef: statement.cycle_ref, replayed: true };
      }

      const beforeLedger = await repo.countTransactions(actor.companyId);
      const id = randomUUID();
      const item = await repo.createItem({
        id,
        companyId: actor.companyId,
        statementId: statement.id,
        financialTransactionId,
        payableId: input.payableId,
        originType: input.originType,
        originId: input.originId,
        amount,
        userId: actor.userId,
      });
      const totals = await repo.statementItemTotals(actor.companyId, statement.id);
      const updatedStatement = await repo.updateStatementItemTotals(actor.companyId, statement.id, totals, actor.userId);
      const afterLedger = await repo.countTransactions(actor.companyId);
      if (beforeLedger !== afterLedger) throw new Error('Vínculo de compra à fatura não pode criar transação financeira');

      await audit(txContext, actor, 'CreditCardStatementItem', id, AuditAction.CREATE, null, item);
      await audit(txContext, actor, 'CreditCardStatement', statement.id, AuditAction.UPDATE, statement, updatedStatement);
      return { item, statementId: statement.id, cycleRef: statement.cycle_ref, replayed: false };
    });
  }
}
