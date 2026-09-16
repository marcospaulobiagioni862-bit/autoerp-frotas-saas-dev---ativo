import {
  RecurringRuleRepository,
  ContractRepository,
  TrackerRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import {
  RecurringRule,
  AccountReceivable,
  AccountPayable,
} from '../../types/entities';
import {
  ContractStatus,
  OriginType,
  RecurringFrequency,
  ObligationStatus,
} from '../../types/enums';
import { ReceivableService } from './ReceivableService';
import { PayableService } from './PayableService';
import { IdempotencyService } from '../services/IdempotencyService';

export interface ProcessRecurringRulesParams {
  companyId: string;
  processingDate: string; // YYYY-MM-DD
  userId?: string;
  userName?: string;
}

export interface ProcessingRuleDetail {
  ruleId: string;
  originType: string;
  originId?: string;
  periodRef: string;
  status: 'GENERATED' | 'SKIPPED' | 'FAILED';
  message?: string;
}

export interface RecurringProcessingResult {
  companyId: string;
  processedDate: string;
  rulesEvaluated: number;
  generatedCount: number;
  skippedCount: number;
  errorsCount: number;
  generatedReceivables: AccountReceivable[];
  generatedPayables: AccountPayable[];
  details: ProcessingRuleDetail[];
}

export function getIsoWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
  const wStr = String(weekNumber).padStart(2, '0');
  return `${y}-W${wStr}`;
}

export function calculatePeriodRef(frequency: RecurringFrequency, dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  switch (frequency) {
    case RecurringFrequency.WEEKLY:
      return getIsoWeek(dateStr);
    case RecurringFrequency.MONTHLY:
      return `${yStr}-${mStr}`;
    case RecurringFrequency.QUARTERLY: {
      const q = Math.ceil(month / 3);
      return `${yStr}-Q${q}`;
    }
    case RecurringFrequency.SEMI_ANNUAL: {
      const s = month <= 6 ? 1 : 2;
      return `${yStr}-S${s}`;
    }
    case RecurringFrequency.ANNUAL:
      return `${yStr}`;
    default:
      return `${yStr}-${mStr}`;
  }
}

export function advanceNextGenerationDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const [year, month, day] = currentDateStr.split('-').map(Number);
  switch (frequency) {
    case RecurringFrequency.WEEKLY: {
      const d = new Date(Date.UTC(year, month - 1, day));
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().split('T')[0];
    }
    case RecurringFrequency.MONTHLY: {
      let nextYear = year;
      let nextMonth = month + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const maxDays = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const nextDay = Math.min(day, maxDays);
      const mPad = String(nextMonth).padStart(2, '0');
      const dPad = String(nextDay).padStart(2, '0');
      return `${nextYear}-${mPad}-${dPad}`;
    }
    case RecurringFrequency.QUARTERLY: {
      let nextYear = year;
      let nextMonth = month + 3;
      if (nextMonth > 12) {
        nextMonth -= 12;
        nextYear += 1;
      }
      const maxDays = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const nextDay = Math.min(day, maxDays);
      const mPad = String(nextMonth).padStart(2, '0');
      const dPad = String(nextDay).padStart(2, '0');
      return `${nextYear}-${mPad}-${dPad}`;
    }
    case RecurringFrequency.SEMI_ANNUAL: {
      let nextYear = year;
      let nextMonth = month + 6;
      if (nextMonth > 12) {
        nextMonth -= 12;
        nextYear += 1;
      }
      const maxDays = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const nextDay = Math.min(day, maxDays);
      const mPad = String(nextMonth).padStart(2, '0');
      const dPad = String(nextDay).padStart(2, '0');
      return `${nextYear}-${mPad}-${dPad}`;
    }
    case RecurringFrequency.ANNUAL: {
      const nextYear = year + 1;
      const maxDays = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
      const nextDay = Math.min(day, maxDays);
      const mPad = String(month).padStart(2, '0');
      const dPad = String(nextDay).padStart(2, '0');
      return `${nextYear}-${mPad}-${dPad}`;
    }
    default: {
      const d = new Date(Date.UTC(year, month - 1, day));
      d.setUTCDate(d.getUTCDate() + 30);
      return d.toISOString().split('T')[0];
    }
  }
}

export class RecurringProcessingService {
  private static ruleRepo = new RecurringRuleRepository();
  private static contractRepo = new ContractRepository();
  private static trackerRepo = new TrackerRepository();
  private static receivableRepo = new AccountReceivableRepository();
  private static payableRepo = new AccountPayableRepository();

  public static async processRecurringRules(
    params: ProcessRecurringRulesParams
  ): Promise<RecurringProcessingResult> {
    if (!params.companyId) {
      throw new Error('companyId é obrigatório para o processamento de recorrência');
    }
    if (!params.processingDate) {
      throw new Error('processingDate é obrigatória para o processamento de recorrência');
    }

    const { companyId, processingDate } = params;
    const userId = params.userId || 'system-recurring';
    const userName = params.userName || 'Motor de Recorrência';

    const allRules = await this.ruleRepo.findAll({ companyId });
    const eligibleRules = allRules.filter(
      (r) =>
        r.companyId === companyId &&
        r.status === 'ACTIVE' &&
        r.startDate <= processingDate &&
        r.nextGenerationDate <= processingDate
    );

    const generatedReceivables: AccountReceivable[] = [];
    const generatedPayables: AccountPayable[] = [];
    const details: ProcessingRuleDetail[] = [];

    let generatedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;

    const inMemoryLocks = new Set<string>();
    const MAX_GENERATIONS_PER_RUN = 52;

    for (const rule of eligibleRules) {
      let generationsCount = 0;

      while (
        rule.status === 'ACTIVE' &&
        rule.nextGenerationDate <= processingDate &&
        generationsCount < MAX_GENERATIONS_PER_RUN
      ) {
        // Check end date bounds
        if (rule.endDate && rule.nextGenerationDate > rule.endDate) {
          rule.status = 'COMPLETED';
          rule.updatedAt = new Date().toISOString();
          await this.ruleRepo.update(rule.id, rule);
          break;
        }

        // Validate underlying entity status
        if (rule.originType === OriginType.CONTRACT_RENT || rule.originType === ('CONTRACT_RENT' as any)) {
          if (!rule.originId) {
            skippedCount++;
            details.push({
              ruleId: rule.id,
              originType: rule.originType,
              periodRef: 'N/A',
              status: 'SKIPPED',
              message: 'Regra sem originId do contrato',
            });
            break;
          }

          const contract = await this.contractRepo.findById(rule.originId);
          if (!contract || contract.companyId !== companyId) {
            rule.status = 'CANCELLED';
            rule.updatedAt = new Date().toISOString();
            await this.ruleRepo.update(rule.id, rule);
            skippedCount++;
            details.push({
              ruleId: rule.id,
              originType: rule.originType,
              originId: rule.originId,
              periodRef: 'N/A',
              status: 'SKIPPED',
              message: 'Contrato não encontrado ou de outro tenant',
            });
            break;
          }

          if (
            contract.status === ContractStatus.DRAFT ||
            contract.status === ContractStatus.AWAITING_SIGNATURE ||
            contract.status === ContractStatus.SUSPENDED
          ) {
            skippedCount++;
            details.push({
              ruleId: rule.id,
              originType: rule.originType,
              originId: rule.originId,
              periodRef: 'N/A',
              status: 'SKIPPED',
              message: `Contrato em estado inelegível: ${contract.status}`,
            });
            break; // Stop catch-up loop for this inactive contract
          }

          if (
            contract.status === ContractStatus.CLOSED ||
            contract.status === ContractStatus.FINISHED ||
            contract.status === ContractStatus.CANCELLED
          ) {
            rule.status = 'COMPLETED';
            rule.updatedAt = new Date().toISOString();
            await this.ruleRepo.update(rule.id, rule);
            skippedCount++;
            details.push({
              ruleId: rule.id,
              originType: rule.originType,
              originId: rule.originId,
              periodRef: 'N/A',
              status: 'SKIPPED',
              message: `Contrato encerrado/cancelado (${contract.status}). Regra marcada como COMPLETED.`,
            });
            break;
          }
        } else if (rule.originType === OriginType.TRACKER || rule.originType === ('TRACKER' as any)) {
          if (!rule.originId) {
            skippedCount++;
            details.push({
              ruleId: rule.id,
              originType: rule.originType,
              periodRef: 'N/A',
              status: 'SKIPPED',
              message: 'Regra sem originId do rastreador',
            });
            break;
          }

          const tracker = await this.trackerRepo.findById(rule.originId);
          if (!tracker || tracker.companyId !== companyId || tracker.status !== 'ACTIVE') {
            rule.status = 'COMPLETED';
            rule.updatedAt = new Date().toISOString();
            await this.ruleRepo.update(rule.id, rule);
            skippedCount++;
            details.push({
              ruleId: rule.id,
              originType: rule.originType,
              originId: rule.originId,
              periodRef: 'N/A',
              status: 'SKIPPED',
              message: 'Rastreador inativo, não encontrado ou de outro tenant',
            });
            break;
          }
        }

        const periodRef = calculatePeriodRef(rule.frequency, rule.nextGenerationDate);
        const lockKey = `${companyId}_${rule.id}_${periodRef}`;

        if (inMemoryLocks.has(lockKey)) {
          skippedCount++;
          details.push({
            ruleId: rule.id,
            originType: rule.originType,
            originId: rule.originId,
            periodRef,
            status: 'SKIPPED',
            message: 'Execução duplicada evitada pela trava em memória',
          });
          break;
        }
        inMemoryLocks.add(lockKey);

        try {
          // Check if it's an INCOME or EXPENSE rule
          const isIncome =
            rule.originType === OriginType.CONTRACT_RENT ||
            rule.originType === ('CONTRACT_RENT' as any);

          if (isIncome) {
            const created = await ReceivableService.create({
              companyId: rule.companyId,
              originType: rule.originType,
              originId: rule.originId || rule.id,
              vehicleId: rule.vehicleId,
              driverId: rule.driverId,
              contractId: rule.originId,
              categoryId: rule.categoryId || 'cat-rent-inc',
              description: rule.description,
              totalAmount: rule.amount,
              dueDate: rule.nextGenerationDate,
              competenceDate: periodRef,
              userId,
              userName,
            });

            if (created && created.length > 0) {
              generatedReceivables.push(...created);
              generatedCount += created.length;
              details.push({
                ruleId: rule.id,
                originType: rule.originType,
                originId: rule.originId,
                periodRef,
                status: 'GENERATED',
                message: `Conta a receber gerada (${created[0].id})`,
              });
            } else {
              skippedCount++;
              details.push({
                ruleId: rule.id,
                originType: rule.originType,
                originId: rule.originId,
                periodRef,
                status: 'SKIPPED',
                message: 'Título de receita já existia (idempotência)',
              });
            }
          } else {
            // Expense / Payable (e.g. TRACKER)
            const created = await PayableService.create({
              companyId: rule.companyId,
              originType: rule.originType,
              originId: rule.originId || rule.id,
              vehicleId: rule.vehicleId,
              supplierId: rule.supplierId,
              driverId: rule.driverId,
              categoryId: rule.categoryId || 'cat-tracker-exp',
              description: rule.description,
              totalAmount: rule.amount,
              dueDate: rule.nextGenerationDate,
              competenceDate: periodRef,
              userId,
              userName,
            });

            if (created && created.length > 0) {
              generatedPayables.push(...created);
              generatedCount += created.length;
              details.push({
                ruleId: rule.id,
                originType: rule.originType,
                originId: rule.originId,
                periodRef,
                status: 'GENERATED',
                message: `Conta a pagar gerada (${created[0].id})`,
              });
            } else {
              skippedCount++;
              details.push({
                ruleId: rule.id,
                originType: rule.originType,
                originId: rule.originId,
                periodRef,
                status: 'SKIPPED',
                message: 'Título de despesa já existia (idempotência)',
              });
            }
          }

          // Advance rule nextGenerationDate
          rule.lastGeneratedReference = periodRef;
          rule.nextGenerationDate = advanceNextGenerationDate(rule.nextGenerationDate, rule.frequency);
          rule.updatedAt = new Date().toISOString();
          await this.ruleRepo.update(rule.id, rule);

          generationsCount++;
        } catch (err: any) {
          errorsCount++;
          details.push({
            ruleId: rule.id,
            originType: rule.originType,
            originId: rule.originId,
            periodRef,
            status: 'FAILED',
            message: err?.message || 'Erro ao processar regra de recorrência',
          });
          break; // Stop catch-up loop on error for this rule
        }
      }

      if (generationsCount >= MAX_GENERATIONS_PER_RUN) {
        details.push({
          ruleId: rule.id,
          originType: rule.originType,
          originId: rule.originId,
          periodRef: 'MAX_LIMIT_REACHED',
          status: 'SKIPPED',
          message: `Limite de ${MAX_GENERATIONS_PER_RUN} gerações por execução atingido para esta regra.`,
        });
      }
    }

    return {
      companyId,
      processedDate: processingDate,
      rulesEvaluated: eligibleRules.length,
      generatedCount,
      skippedCount,
      errorsCount,
      generatedReceivables,
      generatedPayables,
      details,
    };
  }
}
