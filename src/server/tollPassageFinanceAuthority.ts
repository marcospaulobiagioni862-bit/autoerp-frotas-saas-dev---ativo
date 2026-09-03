import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { PayableService } from '../domain/finance/PayableService';
import type { OriginType } from '../types/enums';
import type { AccountPayable } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import { TollPassageConflictError, TollPassageNotFoundError, TollPassageValidationError } from './tollPassageAuthority';

const TOLL_PASSAGE_COMPANY_ORIGIN = 'TOLL_PASSAGE_COMPANY' as OriginType;

export interface TollPassageCompanyPayableResult {
  payable: AccountPayable;
  created: boolean;
}

function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function requiredId(value: unknown, label: string): string {
  const item = typeof value === 'string' ? value.trim() : '';
  if (!item || item.length > 200) throw new TollPassageValidationError(`${label} inválido`);
  return item;
}

async function validateExpenseCategory(rawTx: any, companyId: string, categoryId: string): Promise<void> {
  const category = rows(await rawTx.execute(sql`
    SELECT id,type FROM financial_categories
    WHERE company_id=${companyId} AND id=${categoryId} AND active=true
    LIMIT 1
  `))[0];
  if (!category) throw new TollPassageNotFoundError('Categoria financeira não encontrada');
  if (!['EXPENSE', 'BOTH'].includes(String(category.type))) {
    throw new TollPassageConflictError('Categoria financeira incompatível com despesa de pedágio');
  }
}

export class TollPassageFinanceAuthorityService {
  static async createCompanyPayable(
    principal: AuthenticatedPrincipal,
    passageIdRaw: unknown,
    expenseCategoryIdRaw: unknown,
  ): Promise<TollPassageCompanyPayableResult> {
    const passageId = requiredId(passageIdRaw, 'Passagem');
    const expenseCategoryId = requiredId(expenseCategoryIdRaw, 'Categoria financeira');

    return await UnitOfWork.run(principal.companyId, async tx => {
      const rawTx = tx.getRawTransaction?.();
      if (!rawTx) throw new Error('Toll finance persistence unavailable');

      const passage = rows(await rawTx.execute(sql`
        SELECT id,vehicle_id,contract_id,driver_id,concessionaire,road,toll_point,occurred_at,amount,due_date,status
        FROM toll_passages
        WHERE company_id=${principal.companyId} AND id=${passageId}
        LIMIT 1
        FOR UPDATE
      `))[0];
      if (!passage) throw new TollPassageNotFoundError('Passagem não encontrada');
      if (!['PENDING', 'OVERDUE'].includes(String(passage.status))) {
        throw new TollPassageConflictError('Somente passagem pendente ou vencida pode gerar Conta a Pagar');
      }
      if (!passage.due_date) {
        throw new TollPassageConflictError('Passagem sem vencimento não pode gerar Conta a Pagar');
      }

      await validateExpenseCategory(rawTx, principal.companyId, expenseCategoryId);

      const existing = rows(await rawTx.execute(sql`
        SELECT id FROM account_payables
        WHERE company_id=${principal.companyId}
          AND origin_type=${TOLL_PASSAGE_COMPANY_ORIGIN}
          AND origin_id=${passageId}
          AND installment_number=1
        ORDER BY created_at,id
        LIMIT 1
      `))[0];

      const payable = (await PayableService.create({
        companyId: principal.companyId,
        originType: TOLL_PASSAGE_COMPANY_ORIGIN,
        originId: passageId,
        vehicleId: String(passage.vehicle_id),
        driverId: passage.driver_id ? String(passage.driver_id) : undefined,
        contractId: passage.contract_id ? String(passage.contract_id) : undefined,
        categoryId: expenseCategoryId,
        description: `Pedágio ${String(passage.concessionaire)} — ${String(passage.road)} / ${String(passage.toll_point)}`,
        totalAmount: Number(passage.amount),
        dueDate: String(passage.due_date).slice(0, 10),
        competenceDate: new Date(passage.occurred_at).toISOString().slice(0, 10),
        userId: principal.userId,
        userName: principal.name,
      }, tx))[0];

      return { payable, created: !existing };
    });
  }
}
