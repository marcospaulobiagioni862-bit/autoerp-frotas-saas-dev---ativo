import { sql } from 'drizzle-orm';

function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }

export class PostgresCreditCardPurchaseCycleRepository {
  constructor(private readonly tx: any) {}

  async findPurchaseForUpdate(companyId: string, transactionId: string) {
    return rows(await this.tx.execute(sql`
      SELECT id,type,amount,financial_account_id,transaction_date,is_reversed
      FROM financial_transactions
      WHERE company_id=${companyId} AND id=${transactionId}
      FOR UPDATE
    `))[0] || null;
  }

  async findProfileByAccountForUpdate(companyId: string, financialAccountId: string) {
    return rows(await this.tx.execute(sql`
      SELECT id,financial_account_id,closing_day,due_day,active
      FROM credit_card_profiles
      WHERE company_id=${companyId} AND financial_account_id=${financialAccountId}
      FOR UPDATE
    `))[0] || null;
  }

  async findOpenStatementForPurchaseForUpdate(companyId: string, profileId: string, purchaseDate: string) {
    return rows(await this.tx.execute(sql`
      SELECT id,cycle_ref,closing_date,due_date,status,original_amount,adjustment_amount,balance_amount
      FROM credit_card_statements
      WHERE company_id=${companyId}
        AND credit_card_profile_id=${profileId}
        AND status='OPEN'
        AND closing_date >= ${purchaseDate}
      ORDER BY closing_date ASC,id ASC
      LIMIT 1
      FOR UPDATE
    `))[0] || null;
  }

  async findItemByTransaction(companyId: string, financialTransactionId: string) {
    return rows(await this.tx.execute(sql`
      SELECT * FROM credit_card_statement_items
      WHERE company_id=${companyId} AND financial_transaction_id=${financialTransactionId}
    `))[0] || null;
  }

  async createItem(input: { id: string; companyId: string; statementId: string; financialTransactionId: string; payableId?: string; originType?: string; originId?: string; amount: number; userId: string; }) {
    return rows(await this.tx.execute(sql`
      INSERT INTO credit_card_statement_items(
        id,company_id,statement_id,financial_transaction_id,payable_id,origin_type,origin_id,
        original_amount,adjustment_amount,final_amount,created_by_id
      ) VALUES(
        ${input.id},${input.companyId},${input.statementId},${input.financialTransactionId},
        ${input.payableId || null},${input.originType || null},${input.originId || null},
        ${String(input.amount)},0,${String(input.amount)},${input.userId}
      ) RETURNING *
    `))[0];
  }

  async statementItemTotals(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`
      SELECT COALESCE(SUM(original_amount),0) original_amount,
             COALESCE(SUM(adjustment_amount),0) adjustment_amount,
             COALESCE(SUM(final_amount),0) balance_amount
      FROM credit_card_statement_items
      WHERE company_id=${companyId} AND statement_id=${statementId}
    `))[0];
  }

  async updateStatementItemTotals(companyId: string, statementId: string, totals: any, userId: string) {
    return rows(await this.tx.execute(sql`
      UPDATE credit_card_statements
      SET original_amount=${totals.original_amount},adjustment_amount=${totals.adjustment_amount},
          balance_amount=${totals.balance_amount},updated_by_id=${userId},updated_at=NOW(),version=version+1
      WHERE company_id=${companyId} AND id=${statementId}
      RETURNING *
    `))[0];
  }

  async countTransactions(companyId: string): Promise<number> {
    return Number(rows(await this.tx.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`))[0]?.count || 0);
  }
}
