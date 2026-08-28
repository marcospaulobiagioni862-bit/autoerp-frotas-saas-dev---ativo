import { sql } from 'drizzle-orm';

function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }

export class PostgresCreditCardStatementRepository {
  constructor(private readonly tx: any) {}

  async listProfiles(companyId: string) {
    return rows(await this.tx.execute(sql`SELECT id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_at,updated_at FROM credit_card_profiles WHERE company_id=${companyId} ORDER BY created_at,id`));
  }

  async findFinancialAccountForUpdate(companyId: string, id: string) {
    return rows(await this.tx.execute(sql`SELECT id,type,status FROM financial_accounts WHERE company_id=${companyId} AND id=${id} FOR UPDATE`))[0] || null;
  }

  async findProfileByAccount(companyId: string, financialAccountId: string) {
    return rows(await this.tx.execute(sql`SELECT id FROM credit_card_profiles WHERE company_id=${companyId} AND financial_account_id=${financialAccountId}`))[0] || null;
  }

  async findProfileForUpdate(companyId: string, id: string) {
    return rows(await this.tx.execute(sql`SELECT * FROM credit_card_profiles WHERE company_id=${companyId} AND id=${id} FOR UPDATE`))[0] || null;
  }

  async createProfile(input: { id: string; companyId: string; financialAccountId: string; creditLimit: number; closingDay: number; dueDay: number; userId: string; }) {
    return rows(await this.tx.execute(sql`INSERT INTO credit_card_profiles(id,company_id,financial_account_id,credit_limit,closing_day,due_day,active,version,created_by_id,updated_by_id) VALUES(${input.id},${input.companyId},${input.financialAccountId},${String(input.creditLimit)},${input.closingDay},${input.dueDay},true,1,${input.userId},${input.userId}) RETURNING *`))[0];
  }

  async listStatements(companyId: string, profileId?: string) {
    return profileId
      ? rows(await this.tx.execute(sql`SELECT * FROM credit_card_statements WHERE company_id=${companyId} AND credit_card_profile_id=${profileId} ORDER BY closing_date DESC,id`))
      : rows(await this.tx.execute(sql`SELECT * FROM credit_card_statements WHERE company_id=${companyId} ORDER BY closing_date DESC,id`));
  }

  async createStatement(input: { id: string; companyId: string; creditCardProfileId: string; cycleRef: string; closingDate: string; dueDate: string; userId: string; }) {
    return rows(await this.tx.execute(sql`INSERT INTO credit_card_statements(id,company_id,credit_card_profile_id,cycle_ref,closing_date,due_date,status,original_amount,adjustment_amount,interest_amount,fine_amount,discount_amount,paid_amount,balance_amount,version,created_by_id,updated_by_id) VALUES(${input.id},${input.companyId},${input.creditCardProfileId},${input.cycleRef},${input.closingDate},${input.dueDate},'OPEN',0,0,0,0,0,0,0,1,${input.userId},${input.userId}) RETURNING *`))[0];
  }

  async findStatementForUpdate(companyId: string, id: string) {
    return rows(await this.tx.execute(sql`SELECT s.*,p.financial_account_id FROM credit_card_statements s JOIN credit_card_profiles p ON p.id=s.credit_card_profile_id WHERE s.company_id=${companyId} AND s.id=${id} FOR UPDATE OF s`))[0] || null;
  }

  async findTransactionForItemForUpdate(companyId: string, id: string) {
    return rows(await this.tx.execute(sql`SELECT id,type,amount,financial_account_id FROM financial_transactions WHERE company_id=${companyId} AND id=${id} FOR UPDATE`))[0] || null;
  }

  async createItem(input: { id: string; companyId: string; statementId: string; financialTransactionId: string; payableId?: string; originType?: string; originId?: string; originalAmount: number; adjustmentAmount: number; finalAmount: number; userId: string; }) {
    return rows(await this.tx.execute(sql`INSERT INTO credit_card_statement_items(id,company_id,statement_id,financial_transaction_id,payable_id,origin_type,origin_id,original_amount,adjustment_amount,final_amount,created_by_id) VALUES(${input.id},${input.companyId},${input.statementId},${input.financialTransactionId},${input.payableId || null},${input.originType || null},${input.originId || null},${String(input.originalAmount)},${String(input.adjustmentAmount)},${String(input.finalAmount)},${input.userId}) RETURNING *`))[0];
  }

  async statementItemTotals(companyId: string, statementId: string) {
    return rows(await this.tx.execute(sql`SELECT COALESCE(SUM(original_amount),0) original_amount,COALESCE(SUM(adjustment_amount),0) adjustment_amount,COALESCE(SUM(final_amount),0) balance_amount FROM credit_card_statement_items WHERE company_id=${companyId} AND statement_id=${statementId}`))[0];
  }

  async updateStatementItemTotals(companyId: string, statementId: string, totals: any, userId: string) {
    await this.tx.execute(sql`UPDATE credit_card_statements SET original_amount=${totals.original_amount},adjustment_amount=${totals.adjustment_amount},balance_amount=${totals.balance_amount},updated_by_id=${userId},updated_at=NOW(),version=version+1 WHERE company_id=${companyId} AND id=${statementId}`);
  }

  async countTransactions(companyId: string): Promise<number> {
    return Number(rows(await this.tx.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`))[0]?.count || 0);
  }

  async closeStatement(companyId: string, statementId: string, userId: string) {
    return rows(await this.tx.execute(sql`UPDATE credit_card_statements SET status='CLOSED',closed_at=NOW(),closed_by_id=${userId},updated_by_id=${userId},updated_at=NOW(),version=version+1 WHERE company_id=${companyId} AND id=${statementId} RETURNING *`))[0];
  }

  async findPaymentByIdempotency(companyId: string, idempotencyKey: string) {
    return rows(await this.tx.execute(sql`SELECT * FROM credit_card_statement_payments WHERE company_id=${companyId} AND idempotency_key=${idempotencyKey}`))[0] || null;
  }

  async findTransferForUpdate(companyId: string, id: string) {
    return rows(await this.tx.execute(sql`SELECT id,type,amount,destination_account_id,is_reversed FROM financial_transactions WHERE company_id=${companyId} AND id=${id} FOR UPDATE`))[0] || null;
  }

  async createPayment(input: { id: string; companyId: string; statementId: string; financialTransactionId: string; amount: number; idempotencyKey: string; userId: string; }) {
    return rows(await this.tx.execute(sql`INSERT INTO credit_card_statement_payments(id,company_id,statement_id,financial_transaction_id,amount,idempotency_key,created_by_id) VALUES(${input.id},${input.companyId},${input.statementId},${input.financialTransactionId},${String(input.amount)},${input.idempotencyKey},${input.userId}) RETURNING *`))[0];
  }

  async applyPaymentToStatement(input: { companyId: string; statementId: string; paidAmount: number; balanceAmount: number; status: string; userId: string; }) {
    return rows(await this.tx.execute(sql`UPDATE credit_card_statements SET paid_amount=${String(input.paidAmount)},balance_amount=${String(input.balanceAmount)},status=${input.status},updated_by_id=${input.userId},updated_at=NOW(),version=version+1 WHERE company_id=${input.companyId} AND id=${input.statementId} RETURNING *`))[0];
  }

  async findAdjustmentByIdempotency(companyId: string, idempotencyKey: string) {
    return rows(await this.tx.execute(sql`SELECT * FROM credit_card_statement_adjustments WHERE company_id=${companyId} AND idempotency_key=${idempotencyKey}`))[0] || null;
  }

  async createAdjustment(input: { id: string; companyId: string; statementId: string; interestAmount: number; fineAmount: number; discountAmount: number; reason: string; idempotencyKey: string; userId: string; }) {
    return rows(await this.tx.execute(sql`INSERT INTO credit_card_statement_adjustments(
      id,company_id,statement_id,interest_amount,fine_amount,discount_amount,reason,idempotency_key,created_by_id
    ) VALUES(
      ${input.id},${input.companyId},${input.statementId},${String(input.interestAmount)},${String(input.fineAmount)},${String(input.discountAmount)},${input.reason},${input.idempotencyKey},${input.userId}
    ) RETURNING *`))[0];
  }

  async applyStatementAdjustment(input: { companyId: string; statementId: string; interestAmount: number; fineAmount: number; discountAmount: number; balanceAmount: number; userId: string; }) {
    return rows(await this.tx.execute(sql`UPDATE credit_card_statements
      SET interest_amount=interest_amount+${String(input.interestAmount)},
          fine_amount=fine_amount+${String(input.fineAmount)},
          discount_amount=discount_amount+${String(input.discountAmount)},
          balance_amount=${String(input.balanceAmount)},
          updated_by_id=${input.userId},updated_at=NOW(),version=version+1
      WHERE company_id=${input.companyId} AND id=${input.statementId}
      RETURNING *`))[0];
  }
}
