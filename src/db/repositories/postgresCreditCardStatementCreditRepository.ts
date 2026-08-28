import { sql } from 'drizzle-orm';

function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }

export class PostgresCreditCardStatementCreditRepository {
  constructor(private readonly tx: any) {}

  async findCreditByIdempotency(companyId: string, idempotencyKey: string) {
    return rows(await this.tx.execute(sql`SELECT * FROM credit_card_statement_credits WHERE company_id=${companyId} AND idempotency_key=${idempotencyKey}`))[0] || null;
  }

  async findStatementForUpdate(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`SELECT * FROM credit_card_statements WHERE company_id=${companyId} AND id=${statementId} FOR UPDATE`))[0] || null;
  }

  async findItemForTransactionForUpdate(companyId: string, statementId: string, financialTransactionId: string) {
    return rows(await this.tx.execute(sql`SELECT * FROM credit_card_statement_items
      WHERE company_id=${companyId} AND statement_id=${statementId} AND financial_transaction_id=${financialTransactionId}
      FOR UPDATE`))[0] || null;
  }

  async findTransactionForUpdate(companyId: string, financialTransactionId: string) {
    return rows(await this.tx.execute(sql`SELECT id,type,amount,is_reversed,financial_account_id FROM financial_transactions
      WHERE company_id=${companyId} AND id=${financialTransactionId} FOR UPDATE`))[0] || null;
  }

  async creditedAmount(companyId: string, financialTransactionId: string): Promise<number> {
    const row = rows(await this.tx.execute(sql`SELECT COALESCE(SUM(amount),0) amount FROM credit_card_statement_credits
      WHERE company_id=${companyId} AND financial_transaction_id=${financialTransactionId}`))[0];
    return Number(row?.amount || 0);
  }

  async createCredit(input: { id: string; companyId: string; statementId: string; statementItemId: string; financialTransactionId: string; amount: number; reason: string; idempotencyKey: string; userId: string; }) {
    return rows(await this.tx.execute(sql`INSERT INTO credit_card_statement_credits(
      id,company_id,statement_id,statement_item_id,financial_transaction_id,amount,reason,idempotency_key,created_by_id
    ) VALUES(
      ${input.id},${input.companyId},${input.statementId},${input.statementItemId},${input.financialTransactionId},${String(input.amount)},${input.reason},${input.idempotencyKey},${input.userId}
    ) RETURNING *`))[0];
  }

  async applyCreditToStatement(input: { companyId: string; statementId: string; amount: number; userId: string; }) {
    return rows(await this.tx.execute(sql`UPDATE credit_card_statements
      SET balance_amount=balance_amount-${String(input.amount)},
          status=CASE WHEN balance_amount-${String(input.amount)}=0 THEN 'PAID' ELSE status END,
          updated_by_id=${input.userId},updated_at=NOW(),version=version+1
      WHERE company_id=${input.companyId} AND id=${input.statementId}
      RETURNING *`))[0];
  }

  async countTransactions(companyId: string): Promise<number> {
    return Number(rows(await this.tx.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`))[0]?.count || 0);
  }
}
