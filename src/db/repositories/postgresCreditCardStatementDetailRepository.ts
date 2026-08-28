import { sql } from 'drizzle-orm';

function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }

export class PostgresCreditCardStatementDetailRepository {
  constructor(private readonly tx: any) {}

  async findStatement(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`
      SELECT s.*, p.financial_account_id
      FROM credit_card_statements s
      JOIN credit_card_profiles p
        ON p.company_id = s.company_id
       AND p.id = s.credit_card_profile_id
      WHERE s.company_id = ${companyId}
        AND s.id = ${statementId}
    `))[0] || null;
  }

  async listItems(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`
      SELECT id, statement_id, financial_transaction_id, payable_id, origin_type, origin_id,
             original_amount, adjustment_amount, final_amount, created_by_id, created_at
      FROM credit_card_statement_items
      WHERE company_id = ${companyId}
        AND statement_id = ${statementId}
      ORDER BY created_at, id
    `));
  }

  async listPayments(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`
      SELECT id, statement_id, financial_transaction_id, amount, idempotency_key, created_by_id, created_at
      FROM credit_card_statement_payments
      WHERE company_id = ${companyId}
        AND statement_id = ${statementId}
      ORDER BY created_at, id
    `));
  }

  async listAdjustments(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`
      SELECT id, statement_id, interest_amount, fine_amount, discount_amount, reason,
             idempotency_key, created_by_id, created_at
      FROM credit_card_statement_adjustments
      WHERE company_id = ${companyId}
        AND statement_id = ${statementId}
      ORDER BY created_at, id
    `));
  }

  async listCredits(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`
      SELECT id, statement_id, statement_item_id, financial_transaction_id, amount, reason,
             idempotency_key, created_by_id, created_at
      FROM credit_card_statement_credits
      WHERE company_id = ${companyId}
        AND statement_id = ${statementId}
      ORDER BY created_at, id
    `));
  }
}
