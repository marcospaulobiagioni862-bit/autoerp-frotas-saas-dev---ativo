import { UnitOfWork } from '../db/uow';
import { PostgresCreditCardStatementDetailRepository } from '../db/repositories/postgresCreditCardStatementDetailRepository';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import type { CreditCardStatementActor } from './creditCardStatementAuthority';
import { deriveCreditCardStatementOverdue } from './creditCardStatementOverdue';

export class CreditCardStatementDetailAuthority {
  static async get(actor: CreditCardStatementActor, statementId: string) {
    return UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const repo = new PostgresCreditCardStatementDetailRepository(txContext.getRawTransaction());
      const statement = await repo.findStatement(actor.companyId, statementId);
      if (!statement) throw new Error('Fatura de cartão não encontrada');

      const [items, payments, adjustments, credits] = await Promise.all([
        repo.listItems(actor.companyId, statementId),
        repo.listPayments(actor.companyId, statementId),
        repo.listAdjustments(actor.companyId, statementId),
        repo.listCredits(actor.companyId, statementId),
      ]);

      const asOf = new Date().toISOString().slice(0, 10);
      return {
        statement: { ...statement, ...deriveCreditCardStatementOverdue(statement, asOf) },
        items,
        payments,
        adjustments,
        credits,
      };
    });
  }
}
