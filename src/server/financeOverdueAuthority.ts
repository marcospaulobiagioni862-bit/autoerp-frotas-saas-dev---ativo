import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { FinancialPeriodService } from '../domain/finance/FinancialPeriodService';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { roundCurrency } from '../shared/utils/currency';
import { generateUUID } from '../shared/utils/uuid';
import { AuditAction } from '../types/enums';

export type OverdueObligationType = 'RECEIVABLE' | 'PAYABLE';
export type OverdueProcessType = OverdueObligationType | 'BOTH';

export interface OverdueActor {
  companyId: string;
  userId: string;
  name: string;
}

export interface LateChargeRule {
  id: string;
  companyId: string;
  obligationType: OverdueObligationType;
  gracePeriodDays: number;
  finePercent: number;
  dailyInterestPercent: number;
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LateChargeRuleInput {
  gracePeriodDays: number;
  finePercent: number;
  dailyInterestPercent: number;
  active: boolean;
}

export interface OverdueProcessResult {
  type: OverdueObligationType;
  processingDate: string;
  examined: number;
  updated: number;
  unchanged: number;
  skippedClosedPeriod: number;
}

export interface DelinquentReceivable {
  companyId: string;
  receivableId: string;
  originType: string;
  originId: string;
  driverId?: string;
  vehicleId?: string;
  contractId?: string;
  dueDate: string;
  daysOverdue: number;
  originalAmount: number;
  receivedAmount: number;
  lateFee: number;
  interest: number;
  updatedOutstandingAmount: number;
}

export interface AuthoritativeAgingReport {
  'A VENCER': number;
  '1-7': number;
  '8-15': number;
  '16-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
  aVencer: number;
  '1_7': number;
  '8_15': number;
  '16_30': number;
  '31_60': number;
  '61_90': number;
  '90_plus': number;
}

type RuleRow = {
  id: string;
  companyId: string;
  obligationType: string;
  gracePeriodDays: string | number;
  finePercent: string | number;
  dailyInterestPercent: string | number;
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

type ObligationRow = {
  id: string;
  companyId: string;
  originType: string;
  originId: string;
  vehicleId: string | null;
  driverId: string | null;
  contractId: string | null;
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

function normalizeDate(value: unknown, label = 'Data de processamento'): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!DATE_PATTERN.test(text)) throw new Error(`${label} inválida`);
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) throw new Error(`${label} inválida`);
  return text;
}

function dateOnly(value: unknown): string {
  return normalizeDate(String(value || '').slice(0, 10), 'Data financeira');
}

function deterministicDaysBetween(start: unknown, end: unknown): number {
  const startDate = dateOnly(start);
  const endDate = dateOnly(end);
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  return Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY);
}

function numberValue(value: unknown, label = 'Valor financeiro'): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido`);
  return parsed;
}

function normalizePercent(value: unknown, label: string, max: number, decimals: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new Error(`${label} inválido`);
  return Number(parsed.toFixed(decimals));
}

function normalizeRuleInput(input: LateChargeRuleInput): LateChargeRuleInput {
  const gracePeriodDays = Number(input?.gracePeriodDays);
  if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0 || gracePeriodDays > 365) {
    throw new Error('Período de tolerância inválido');
  }
  if (typeof input?.active !== 'boolean') throw new Error('Status da regra de atraso inválido');
  return {
    gracePeriodDays,
    finePercent: normalizePercent(input.finePercent, 'Percentual de multa', 100, 4),
    dailyInterestPercent: normalizePercent(input.dailyInterestPercent, 'Percentual diário de juros', 10, 6),
    active: input.active,
  };
}

function assertType(value: unknown): OverdueObligationType {
  if (value === 'RECEIVABLE' || value === 'PAYABLE') return value;
  throw new Error('Tipo de obrigação inválido para encargos de atraso');
}

function rawTransaction(txContext: any): any {
  const tx = txContext?.getRawTransaction?.();
  if (!tx) throw new Error('Autoridade PostgreSQL de encargos por atraso indisponível');
  return tx;
}

function mapRule(row: RuleRow): LateChargeRule {
  return {
    id: row.id,
    companyId: row.companyId,
    obligationType: row.obligationType as OverdueObligationType,
    gracePeriodDays: Number(row.gracePeriodDays),
    finePercent: Number(row.finePercent),
    dailyInterestPercent: Number(row.dailyInterestPercent),
    active: row.active === true,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listRulesForCompany(tx: any, companyId: string): Promise<LateChargeRule[]> {
  const result = await tx.execute(sql`
    SELECT id,
      company_id AS "companyId",
      obligation_type AS "obligationType",
      grace_period_days AS "gracePeriodDays",
      fine_percent AS "finePercent",
      daily_interest_percent AS "dailyInterestPercent",
      active,
      created_by AS "createdBy",
      updated_by AS "updatedBy",
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt"
    FROM finance_late_charge_rules
    WHERE company_id = ${companyId}
    ORDER BY obligation_type
  `);
  return ((result.rows || []) as RuleRow[])
    .filter((row) => row.companyId === companyId)
    .map(mapRule);
}

async function requireActiveRule(tx: any, companyId: string, type: OverdueObligationType): Promise<LateChargeRule> {
  const result = await tx.execute(sql`
    SELECT id,
      company_id AS "companyId",
      obligation_type AS "obligationType",
      grace_period_days AS "gracePeriodDays",
      fine_percent AS "finePercent",
      daily_interest_percent AS "dailyInterestPercent",
      active,
      created_by AS "createdBy",
      updated_by AS "updatedBy",
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt"
    FROM finance_late_charge_rules
    WHERE company_id = ${companyId} AND obligation_type = ${type}
    LIMIT 1
    FOR SHARE
  `);
  const row = result.rows?.[0] as RuleRow | undefined;
  if (!row || row.companyId !== companyId || row.obligationType !== type || row.active !== true) {
    throw new Error(`Regra autoritativa de encargos por atraso não configurada ou inativa para ${type}`);
  }
  return mapRule(row);
}

async function lockedRows(tx: any, companyId: string, type: OverdueObligationType): Promise<ObligationRow[]> {
  const result = type === 'RECEIVABLE'
    ? await tx.execute(sql`
        SELECT id,
          company_id AS "companyId", origin_type AS "originType", origin_id AS "originId",
          vehicle_id AS "vehicleId", driver_id AS "driverId", contract_id AS "contractId",
          original_amount AS "originalAmount", discount_amount AS "discountAmount",
          fine_amount AS "fineAmount", interest_amount AS "interestAmount",
          updated_amount AS "updatedAmount", paid_amount AS "paidAmount", balance_amount AS "balanceAmount",
          due_date::date::text AS "dueDate", competence_date::date::text AS "competenceDate", status
        FROM account_receivables
        WHERE company_id = ${companyId} AND status IN ('PENDING','PARTIALLY_PAID','OVERDUE')
        ORDER BY id
        FOR UPDATE
      `)
    : await tx.execute(sql`
        SELECT id,
          company_id AS "companyId", origin_type AS "originType", origin_id AS "originId",
          vehicle_id AS "vehicleId", driver_id AS "driverId", contract_id AS "contractId",
          original_amount AS "originalAmount", discount_amount AS "discountAmount",
          fine_amount AS "fineAmount", interest_amount AS "interestAmount",
          updated_amount AS "updatedAmount", paid_amount AS "paidAmount", balance_amount AS "balanceAmount",
          due_date::date::text AS "dueDate", competence_date::date::text AS "competenceDate", status
        FROM account_payables
        WHERE company_id = ${companyId} AND status IN ('PENDING','PARTIALLY_PAID','OVERDUE')
        ORDER BY id
        FOR UPDATE
      `);
  return ((result.rows || []) as ObligationRow[]).filter((row) => row.companyId === companyId);
}

async function persistObligation(
  tx: any,
  txContext: any,
  actor: OverdueActor,
  type: OverdueObligationType,
  row: ObligationRow,
  next: { status: string; fineAmount: number; interestAmount: number; updatedAmount: number; balanceAmount: number },
  processingDate: string
): Promise<void> {
  const now = new Date().toISOString();
  const result = type === 'RECEIVABLE'
    ? await tx.execute(sql`
        UPDATE account_receivables
        SET status=${next.status}, fine_amount=${next.fineAmount}, interest_amount=${next.interestAmount},
            updated_amount=${next.updatedAmount}, balance_amount=${next.balanceAmount}, updated_at=${now}
        WHERE company_id=${actor.companyId} AND id=${row.id}
        RETURNING id
      `)
    : await tx.execute(sql`
        UPDATE account_payables
        SET status=${next.status}, fine_amount=${next.fineAmount}, interest_amount=${next.interestAmount},
            updated_amount=${next.updatedAmount}, balance_amount=${next.balanceAmount}, updated_at=${now}
        WHERE company_id=${actor.companyId} AND id=${row.id}
        RETURNING id
      `);
  if (!result.rows?.[0]) throw new Error('Obrigação financeira não encontrada durante atualização de atraso');

  await txContext.getAuditLogRepo().create({
    id: generateUUID(),
    companyId: actor.companyId,
    entityName: type === 'RECEIVABLE' ? 'AccountReceivable' : 'AccountPayable',
    entityId: row.id,
    action: AuditAction.UPDATE,
    previousState: JSON.stringify({
      status: row.status,
      fineAmount: numberValue(row.fineAmount),
      interestAmount: numberValue(row.interestAmount),
      updatedAmount: numberValue(row.updatedAmount),
      balanceAmount: numberValue(row.balanceAmount),
    }),
    newState: JSON.stringify({ reason: 'AUTHORITATIVE_OVERDUE_RECALCULATION', processingDate, ...next }),
    userId: actor.userId,
    userName: actor.name,
    timestamp: now,
  });
}

async function processType(
  tx: any,
  txContext: any,
  actor: OverdueActor,
  type: OverdueObligationType,
  processingDate: string,
  rule: LateChargeRule
): Promise<OverdueProcessResult> {
  const rows = await lockedRows(tx, actor.companyId, type);
  let updated = 0;
  let unchanged = 0;
  let skippedClosedPeriod = 0;

  for (const row of rows) {
    if (row.companyId !== actor.companyId) throw new Error('Descompasso de tenant na obrigação financeira');
    if (!(await FinancialPeriodService.isDateOpen(actor.companyId, row.competenceDate, txContext))) {
      skippedClosedPeriod += 1;
      continue;
    }

    const daysOverdue = Math.max(0, deterministicDaysBetween(row.dueDate, processingDate));
    const originalAmount = numberValue(row.originalAmount);
    const paidAmount = numberValue(row.paidAmount);
    const discountAmount = numberValue(row.discountAmount);

    // FINANCE-R12 intentionally preserves the proven legacy charge-base equation:
    // face value minus amounts already settled. Discount remains a separate
    // authoritative adjustment in updatedAmount until a future business rule says otherwise.
    const outstandingPrincipal = roundCurrency(Math.max(0, originalAmount - paidAmount));
    const chargeable = daysOverdue > rule.gracePeriodDays;
    // Preserve operation-specific charges and never accrue global charges on CP.
    const preserveCharges = type === 'PAYABLE' || Boolean((await tx.execute(sql`SELECT 1 FROM audit_logs WHERE company_id=${actor.companyId} AND entity_type='FinancialSettlement' AND (changes::jsonb->>'newState')::jsonb->>'obligationId'=${row.id} LIMIT 1`)).rows?.length);
    const fineAmount = preserveCharges ? numberValue(row.fineAmount) : chargeable ? roundCurrency(outstandingPrincipal * (rule.finePercent / 100)) : 0;
    const interestAmount = preserveCharges ? numberValue(row.interestAmount) : chargeable
      ? roundCurrency(outstandingPrincipal * (rule.dailyInterestPercent / 100) * daysOverdue)
      : 0;
    const updatedAmount = roundCurrency(Math.max(0, originalAmount + fineAmount + interestAmount - discountAmount));
    const balanceAmount = roundCurrency(Math.max(0, updatedAmount - paidAmount));
    const status = daysOverdue > 0 ? 'OVERDUE' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';

    const changed =
      row.status !== status ||
      roundCurrency(numberValue(row.fineAmount)) !== fineAmount ||
      roundCurrency(numberValue(row.interestAmount)) !== interestAmount ||
      roundCurrency(numberValue(row.updatedAmount)) !== updatedAmount ||
      roundCurrency(numberValue(row.balanceAmount)) !== balanceAmount;

    if (!changed) {
      unchanged += 1;
      continue;
    }
    await persistObligation(tx, txContext, actor, type, row, { status, fineAmount, interestAmount, updatedAmount, balanceAmount }, processingDate);
    updated += 1;
  }

  return { type, processingDate, examined: rows.length, updated, unchanged, skippedClosedPeriod };
}

async function reportRows(tx: any, companyId: string, type: OverdueObligationType): Promise<ObligationRow[]> {
  const result = type === 'RECEIVABLE'
    ? await tx.execute(sql`
        SELECT id,
          company_id AS "companyId", origin_type AS "originType", origin_id AS "originId",
          vehicle_id AS "vehicleId", driver_id AS "driverId", contract_id AS "contractId",
          original_amount AS "originalAmount", discount_amount AS "discountAmount",
          fine_amount AS "fineAmount", interest_amount AS "interestAmount",
          updated_amount AS "updatedAmount", paid_amount AS "paidAmount", balance_amount AS "balanceAmount",
          due_date::date::text AS "dueDate", competence_date::date::text AS "competenceDate", status
        FROM account_receivables
        WHERE company_id=${companyId} AND status IN ('PENDING','PARTIALLY_PAID','OVERDUE') AND balance_amount > 0
        ORDER BY due_date,id
      `)
    : await tx.execute(sql`
        SELECT id,
          company_id AS "companyId", origin_type AS "originType", origin_id AS "originId",
          vehicle_id AS "vehicleId", driver_id AS "driverId", contract_id AS "contractId",
          original_amount AS "originalAmount", discount_amount AS "discountAmount",
          fine_amount AS "fineAmount", interest_amount AS "interestAmount",
          updated_amount AS "updatedAmount", paid_amount AS "paidAmount", balance_amount AS "balanceAmount",
          due_date::date::text AS "dueDate", competence_date::date::text AS "competenceDate", status
        FROM account_payables
        WHERE company_id=${companyId} AND status IN ('PENDING','PARTIALLY_PAID','OVERDUE') AND balance_amount > 0
        ORDER BY due_date,id
      `);
  return ((result.rows || []) as ObligationRow[]).filter((row) => row.companyId === companyId);
}

export class FinanceOverdueAuthority {
  static normalizeProcessingDate(value: unknown): string {
    return normalizeDate(value);
  }

  static async listRules(actor: OverdueActor): Promise<LateChargeRule[]> {
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      return await listRulesForCompany(rawTransaction(txContext), actor.companyId);
    });
  }

  static async upsertRule(actor: OverdueActor, typeInput: OverdueObligationType, input: LateChargeRuleInput): Promise<LateChargeRule> {
    const type = assertType(typeInput);
    const ruleInput = normalizeRuleInput(input);

    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(
        actor.userId,
        actor.companyId,
        'FINANCIAL_LATE_CHARGE_RULE_MANAGE',
        txContext
      );
      const tx = rawTransaction(txContext);
      const existingResult = await tx.execute(sql`
        SELECT id,
          company_id AS "companyId", obligation_type AS "obligationType",
          grace_period_days AS "gracePeriodDays", fine_percent AS "finePercent",
          daily_interest_percent AS "dailyInterestPercent", active,
          created_by AS "createdBy", updated_by AS "updatedBy",
          created_at::text AS "createdAt", updated_at::text AS "updatedAt"
        FROM finance_late_charge_rules
        WHERE company_id=${actor.companyId} AND obligation_type=${type}
        LIMIT 1
        FOR UPDATE
      `);
      const existingRow = existingResult.rows?.[0] as RuleRow | undefined;
      const existing = existingRow ? mapRule(existingRow) : null;
      const id = existing?.id || generateUUID();
      const now = new Date().toISOString();

      const savedResult = await tx.execute(sql`
        INSERT INTO finance_late_charge_rules(
          id,company_id,obligation_type,grace_period_days,fine_percent,daily_interest_percent,
          active,created_by,updated_by,created_at,updated_at
        ) VALUES (
          ${id},${actor.companyId},${type},${ruleInput.gracePeriodDays},${ruleInput.finePercent},
          ${ruleInput.dailyInterestPercent},${ruleInput.active},${existing?.createdBy || actor.userId},
          ${actor.userId},${existing?.createdAt || now},${now}
        )
        ON CONFLICT (company_id, obligation_type) DO UPDATE SET
          grace_period_days=EXCLUDED.grace_period_days,
          fine_percent=EXCLUDED.fine_percent,
          daily_interest_percent=EXCLUDED.daily_interest_percent,
          active=EXCLUDED.active,
          updated_by=EXCLUDED.updated_by,
          updated_at=EXCLUDED.updated_at
        RETURNING id,
          company_id AS "companyId", obligation_type AS "obligationType",
          grace_period_days AS "gracePeriodDays", fine_percent AS "finePercent",
          daily_interest_percent AS "dailyInterestPercent", active,
          created_by AS "createdBy", updated_by AS "updatedBy",
          created_at::text AS "createdAt", updated_at::text AS "updatedAt"
      `);
      const savedRow = savedResult.rows?.[0] as RuleRow | undefined;
      if (!savedRow || savedRow.companyId !== actor.companyId) throw new Error('Falha ao persistir regra autoritativa de atraso');
      const saved = mapRule(savedRow);

      await txContext.getAuditLogRepo().create({
        id: generateUUID(), companyId: actor.companyId,
        entityName: 'FinancialLateChargeRule', entityId: saved.id,
        action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
        previousState: existing ? JSON.stringify(existing) : undefined,
        newState: JSON.stringify(saved), userId: actor.userId, userName: actor.name, timestamp: now,
      });
      return saved;
    });
  }

  static async process(actor: OverdueActor, typeInput: OverdueProcessType, processingDateInput: unknown): Promise<OverdueProcessResult[]> {
    const processingDate = normalizeDate(processingDateInput);
    const types: OverdueObligationType[] = typeInput === 'BOTH' ? ['RECEIVABLE', 'PAYABLE'] : [assertType(typeInput)];

    return await UnitOfWork.run(
      actor.companyId,
      async (txContext: any) => {
        await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'FINANCIAL_OVERDUE_PROCESS', txContext);
        const tx = rawTransaction(txContext);
        const rules = new Map<OverdueObligationType, LateChargeRule>();
        // Resolve all rules before the first mutation so BOTH is atomic if one side is unconfigured.
        for (const type of types) rules.set(type, await requireActiveRule(tx, actor.companyId, type));

        const results: OverdueProcessResult[] = [];
        for (const type of types) {
          results.push(await processType(tx, txContext, actor, type, processingDate, rules.get(type)!));
        }
        return results;
      },
      { financialPeriodLock: 'SHARED' }
    );
  }

  static async getDelinquentReceivables(actor: OverdueActor, processingDateInput: unknown): Promise<DelinquentReceivable[]> {
    const processingDate = normalizeDate(processingDateInput);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const rows = await reportRows(rawTransaction(txContext), actor.companyId, 'RECEIVABLE');
      return rows.flatMap((row) => {
        const daysOverdue = deterministicDaysBetween(row.dueDate, processingDate);
        if (daysOverdue <= 0) return [];
        return [{
          companyId: actor.companyId,
          receivableId: row.id,
          originType: row.originType,
          originId: row.originId,
          driverId: row.driverId || undefined,
          vehicleId: row.vehicleId || undefined,
          contractId: row.contractId || undefined,
          dueDate: row.dueDate,
          daysOverdue,
          originalAmount: numberValue(row.originalAmount),
          receivedAmount: numberValue(row.paidAmount),
          lateFee: numberValue(row.fineAmount),
          interest: numberValue(row.interestAmount),
          updatedOutstandingAmount: numberValue(row.balanceAmount),
        }];
      });
    });
  }

  static async getAgingReport(
    actor: OverdueActor,
    typeInput: OverdueObligationType,
    processingDateInput: unknown
  ): Promise<AuthoritativeAgingReport> {
    const type = assertType(typeInput);
    const processingDate = normalizeDate(processingDateInput);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
      const rows = await reportRows(rawTransaction(txContext), actor.companyId, type);
      let aVencer=0,u1_7=0,u8_15=0,u16_30=0,u31_60=0,u61_90=0,u90Plus=0;
      for (const row of rows) {
        const value = numberValue(row.balanceAmount);
        const days = deterministicDaysBetween(row.dueDate, processingDate);
        if (days <= 0) aVencer += value;
        else if (days <= 7) u1_7 += value;
        else if (days <= 15) u8_15 += value;
        else if (days <= 30) u16_30 += value;
        else if (days <= 60) u31_60 += value;
        else if (days <= 90) u61_90 += value;
        else u90Plus += value;
      }
      aVencer=roundCurrency(aVencer);u1_7=roundCurrency(u1_7);u8_15=roundCurrency(u8_15);
      u16_30=roundCurrency(u16_30);u31_60=roundCurrency(u31_60);u61_90=roundCurrency(u61_90);u90Plus=roundCurrency(u90Plus);
      return {
        'A VENCER':aVencer,'1-7':u1_7,'8-15':u8_15,'16-30':u16_30,'31-60':u31_60,'61-90':u61_90,'90+':u90Plus,
        aVencer,'1_7':u1_7,'8_15':u8_15,'16_30':u16_30,'31_60':u31_60,'61_90':u61_90,'90_plus':u90Plus,
      };
    });
  }
}
