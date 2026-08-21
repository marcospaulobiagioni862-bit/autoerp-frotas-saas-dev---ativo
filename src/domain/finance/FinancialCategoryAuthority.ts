import { sql } from 'drizzle-orm';
import type { ITransactionContext } from './ITransactionContext';

export type FinancialCategoryUsage = 'RECEIVABLE' | 'PAYABLE';

function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export async function assertFinancialCategoryForObligation(
  companyId: string,
  categoryId: string,
  usage: FinancialCategoryUsage,
  txContext: ITransactionContext
): Promise<void> {
  const normalizedId = typeof categoryId === 'string' ? categoryId.trim() : '';
  if (!normalizedId) {
    throw new Error('Categoria financeira não encontrada');
  }

  const raw = txContext.getRawTransaction?.();
  if (!raw) {
    throw new Error('Financial category authority unavailable');
  }

  const result = await raw.execute(sql`
    SELECT id, type, active
    FROM financial_categories
    WHERE company_id = ${companyId}
      AND id = ${normalizedId}
    LIMIT 1
  `);
  const category = rows(result)[0];

  if (!category) {
    throw new Error('Categoria financeira não encontrada');
  }
  if (category.active !== true) {
    throw new Error('Categoria financeira inativa');
  }

  const type = String(category.type);
  const allowed = type === 'BOTH' || (usage === 'RECEIVABLE' ? type === 'INCOME' : type === 'EXPENSE');
  if (!allowed) {
    throw new Error(
      usage === 'RECEIVABLE'
        ? 'Categoria financeira incompatível com Conta a Receber'
        : 'Categoria financeira incompatível com Conta a Pagar'
    );
  }
}
