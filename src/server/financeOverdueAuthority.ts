import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { FinancialPeriodService } from '../domain/finance/FinancialPeriodService';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { roundCurrency } from '../shared/utils/currency';
import { generateUUID } from '../shared/utils/uuid';

export type OverdueObligationType = 'RECEIVABLE' | 'PAYABLE';

export interface OverdueActor {
  companyId: string;
  userId: string;
  name: string;
}

export interface LateChargeRule {
  companyId: string;
  gracePeriodDays: number;
  finePercent: number;
  dailyInterestPercent: number;
  active: boolean;
}

export interface OverdueProcessResult {
  type: OverdueObligationType;
  processingDate: string;
  updated: number;
  unchanged: number;
  skippedClosedPeriod: number;
}

type ObligationRow = {
  id: string;
  companyId: string;
  originalAmount: string | number;
  discountAmount: string | number;
  fineAmount: string | number;
  interestAmount: string | number;
  updatedAmount: string | number;
  paidAmount: string | number;
  balanceAmount: string | number;
  dueDate: string;
  competenceDate: string;
  status: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
const DEFAULT_RULE = Object.freeze({
  gracePeriodDays: 0,
  finePercent: 2,
  dailyInterestPercent: 0.033,
});

function normalizeDate(value: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!DATE_PATTERN.test(text)) throw new Error('Data de processamento inválida');
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) throw new Error('Data de processamento inválida');
  return text;
}

function dateOnly(value: string): string {
  const text = String(value || '').slice(0, 10);
  return normalizeDate(text);
}

function daysBetween(start: string, end: string): number {
  const startDate = dateOnly(start);
  const endDate = dateOnly(end);
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY);
}

function numberValue(value: unknown): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) throw new Error('Valor financeiro inválido na obrigação');
  return parsed;
}

async function ensureAndLoadRule(tx: any, companyId: string): Promise<LateChargeRule> {
  await tx.execute(sql`
    INSERT INTO finance_late_charge_rules
      (company_id, grace_period_days, fine_percent, daily_interest_percent, active)
    VALUES
      (${companyId}, ${DEFAULT_RULE.gracePeriodDays}, ${DEFAULT_RULE.finePercent}, ${DEFAULT_RULE.dailyInterestPercent}, true)
    ON CONFLICT (company_id) DO NOTHING
  `);

  const result = await tx.execute(sql`
    SELECT
      company_id AS "companyId",
      grace_period_days AS "gracePeriodDays",
      fine_percent AS "finePercent",
      daily_interest_percent AS "dailyInterestPercent",
      active
    FROM finance_late_charge_rules
    WHERE company_id = ${companyId}
    LIMIT 1
  `);
  const row = result.rows?.[0] as any;
  if (!row || row.companyId !== companyId || row.active !== true) {
    throw new Error('Regra autoritativa de encargos por atraso indisponível');
  }
  return {
    companyId,
    gracePeriodDays: Number(row.gracePeriodDays),
    finePercent: Number(row.finePercent),
    dailyInterestPercent: Number(row.dailyInterestPercent),
    active: true,
  };
}

async function lockedRows(tx: any, companyId: string, type: OverdueObligationType): Promise<ObligationRow[]> {
  const result = type === 'RECEIVABLE'
    ? await tx.execute(sql`
        SELECT id,
          company_id AS "companyId",
          original_amount AS "originalAmount",
          discount_amount AS "discountAmount",
          fine_amount AS "fineAmount",
          interest_amount AS "interestAmount",
          updated_amount AS "updatedAmount",
          paid_amount AS "paidAmount",
          balance_amount AS "balanceAmount",
          due_date AS "dueDate",
          competence_date AS "competenceDate",
          status
        FROM account_receivables
        WHERE company_id = ${companyId}
          AND status NOT IN ('PAID', 'CANCELLED')
        ORDER BY id
        FOR UPDATE
      `)
    : await tx.execute(sql`
        SELECT id,
          company_id AS "companyId",
          original_amount AS "originalAmount",
          discount_amount AS "discountAmount",
          fine_amount AS "fineAmount",
          interest_amount AS "interestAmount",
          updated_amount AS "updatedAmount",
          paid_amount AS "paidAmount",
          balance_amount AS "balanceAmount",
          due_date AS "dueDate",
          competence_date AS "competenceDate",
          status
        FROM account_payables
        WHERE company_id = ${companyId}
          AND status NOT IN ('PAID', 'CANCELLED')
        ORDER BY id
        FOR UPDATE
      `);
  return (result.rows || []) as ObligationRow[];
}

async function persist(
  tx: any,
  actor: OverdueActor,
  type: OverdueObligationType,
  row: ObligationRow,
  next: { status: string; fineAmount: number; interestAmount: number; updatedAmount: number; balanceAmount: number },
  processingDate: string
): Promise<void> {
  const now = new Date().toISOString();
  if (type === 'RECEIVABLE') {
    await tx.execute(sql`
      UPDATE account_receivables
      SET status = ${next.status},
          fine_amount = ${next.fineAmount},
          interest_amount = ${next.interestAmount},
          updated_amount = ${next.updatedAmount},
          balance_amount = ${next.balanceAmount},
          updated_at = ${now}
      WHERE company_id = ${actor.companyId} AND id = ${row.id}
    `);
  } else {
    await tx.execute(sql`
      UPDATE account_payables
      SET status = ${next.status},
          fine_amount = ${next.fineAmount},
          interest_amount = ${next.interestAmount},
          updated_amount = ${next.updatedAmount},
          balance_amount = ${next.balanceAmount},
          updated_at = ${now}
      WHERE company_id = ${actor.companyId} AND id = ${row.id}
    `);
  }

  await tx.execute(sql`
    INSERT INTO audit_logs
      (id, company_id, user_id, action, entity_type, entity_id, changes, timestamp)
    VALUES
      (${generateUUID()}, ${actor.companyId}, ${actor.userId}, 'UPDATE',
       ${type === 'RECEIVABLE' ? 'AccountReceivable' : 'AccountPayable'}, ${row.id},
       ${JSON.stringify({
         reason: 'AUTHORITATIVE_OVERDUE_RECALCULATION',
         processingDate,
         previous: {
           status: row.status,
           fineAmount: numberValue(row.fineAmount),
           interestAmount: numberValue(row.interestAmount),
           updatedAmount: numberValue(row.updatedAmount),
           balanceAmount: numberValue(row.balanceAmount),
         },
         next,
       })}, ${now})
  `);
}

export class FinanceOverdueAuthority {
  static async getRule(companyId: string): Promise<LateChargeRule> {
    return await UnitOfWork.run(companyId, async (txContext: any) =>
      await ensureAndLoadRule(txContext.getRawTransaction(), companyId)
    );
  }

  static async process(actor: OverdueActor, type: OverdueObligationType, processingDateInput: string): Promise<OverdueProcessResult> {
    const processingDate = normalizeDate(processingDateInput);
    const permission = type === 'RECEIVABLE' ? 'RECEIPT_REGISTER' : 'PAYMENT_REGISTER';

    return await UnitOfWork.run(
      actor.companyId,
      async (txContext: any) => {
        await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, permission, txContext);
        const tx = txContext.getRawTransaction();
        const rule = await ensureAndLoadRule(tx, actor.companyId);
        const rows = await lockedRows(tx, actor.companyId, type);
        let updated = 0;
        let unchanged = 0;
        let skippedClosedPeriod = 0;

        for (const row of rows) {
          if (row.companyId !== actor.companyId) throw new Error('Descompasso de tenant na obrigação financeira');
          if (!(await FinancialPeriodService.isDateOpen(actor.companyId, dateOnly(row.competenceDate), txContext))) {
            skippedClosedPeriod += 1;
            continue;
          }

          const daysOverdue = Math.max(0, daysBetween(row.dueDate, processingDate));
          const originalAmount = numberValue(row.originalAmount);
          const paidAmount = numberValue(row.paidAmount);
          const discountAmount = numberValue(row.discountAmount);
          const outstandingPrincipal = roundCurrency(Math.max(0, originalAmount - paidAmount));
          const chargeable = daysOverdue > rule.gracePeriodDays;
          const fineAmount = chargeable
            ? roundCurrency(outstandingPrincipal * (rule.finePercent / 100))
            : 0;
          const interestAmount = chargeable
            ? roundCurrency(outstandingPrincipal * (rule.dailyInterestPercent / 100) * daysOverdue)
            : 0;
          const updatedAmount = roundCurrency(Math.max(0, originalAmount + fineAmount + interestAmount - discountAmount));
          const balanceAmount = roundCurrency(Math.max(0, updatedAmount - paidAmount));
          const status = daysOverdue > 0
            ? 'OVERDUE'
            : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';

          const changed =
            row.status !== status ||
            numberValue(row.fineAmount) !== fineAmount ||
            numberValue(row.interestAmount) !== interestAmount ||
            numberValue(row.updatedAmount) !== updatedAmount ||
            numberValue(row.balanceAmount) !== balanceAmount;

          if (!changed) {
            unchanged += 1;
            continue;
          }

          await persist(tx, actor, type, row, { status, fineAmount, interestAmount, updatedAmount, balanceAmount }, processingDate);
          updated += 1;
        }

        return { type, processingDate, updated, unchanged, skippedClosedPeriod };
      },
      { financialPeriodLock: 'SHARED' }
    );
  }
}
