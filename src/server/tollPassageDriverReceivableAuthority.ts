import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { ReceivableService } from '../domain/finance/ReceivableService';
import type { OriginType } from '../types/enums';
import type { AccountReceivable } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import { TollPassageConflictError, TollPassageNotFoundError, TollPassageValidationError } from './tollPassageAuthority';

const TOLL_PASSAGE_DRIVER_ORIGIN = 'TOLL_PASSAGE_DRIVER' as OriginType;

export interface TollContractPassThroughPolicy {
  contractId: string;
  passThroughEnabled: boolean;
}

export interface TollPassageDriverReceivableResult {
  receivable: AccountReceivable;
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

async function validateIncomeCategory(rawTx: any, companyId: string, categoryId: string): Promise<void> {
  const category = rows(await rawTx.execute(sql`
    SELECT id,type FROM financial_categories
    WHERE company_id=${companyId} AND id=${categoryId} AND active=true
    LIMIT 1
  `))[0];
  if (!category) throw new TollPassageNotFoundError('Categoria financeira não encontrada');
  if (!['INCOME', 'BOTH'].includes(String(category.type))) {
    throw new TollPassageConflictError('Categoria financeira incompatível com cobrança de pedágio');
  }
}

export class TollPassageDriverReceivableAuthorityService {
  static async setContractPolicy(
    principal: AuthenticatedPrincipal,
    contractIdRaw: unknown,
    passThroughEnabled: boolean,
  ): Promise<TollContractPassThroughPolicy> {
    const contractId = requiredId(contractIdRaw, 'Contrato');
    return UnitOfWork.run(principal.companyId, async tx => {
      const rawTx = tx.getRawTransaction?.();
      if (!rawTx) throw new Error('Toll contract policy persistence unavailable');
      const contract = rows(await rawTx.execute(sql`
        SELECT id FROM contracts
        WHERE company_id=${principal.companyId} AND id=${contractId} AND is_archived=false
        LIMIT 1
      `))[0];
      if (!contract) throw new TollPassageNotFoundError('Contrato não encontrado');
      await rawTx.execute(sql`
        INSERT INTO toll_contract_policies(company_id,contract_id,pass_through_enabled,created_at,updated_at)
        VALUES(${principal.companyId},${contractId},${passThroughEnabled},now(),now())
        ON CONFLICT(company_id,contract_id) DO UPDATE SET
          pass_through_enabled=excluded.pass_through_enabled,
          updated_at=now()
      `);
      return { contractId, passThroughEnabled };
    });
  }

  static async getContractPolicy(companyId: string, contractIdRaw: unknown): Promise<TollContractPassThroughPolicy> {
    const contractId = requiredId(contractIdRaw, 'Contrato');
    return UnitOfWork.run(companyId, async tx => {
      const rawTx = tx.getRawTransaction?.();
      if (!rawTx) throw new Error('Toll contract policy persistence unavailable');
      const contract = rows(await rawTx.execute(sql`
        SELECT id FROM contracts
        WHERE company_id=${companyId} AND id=${contractId} AND is_archived=false
        LIMIT 1
      `))[0];
      if (!contract) throw new TollPassageNotFoundError('Contrato não encontrado');
      const policy = rows(await rawTx.execute(sql`
        SELECT pass_through_enabled FROM toll_contract_policies
        WHERE company_id=${companyId} AND contract_id=${contractId}
        LIMIT 1
      `))[0];
      return { contractId, passThroughEnabled: Boolean(policy?.pass_through_enabled) };
    });
  }

  static async createDriverReceivable(
    principal: AuthenticatedPrincipal,
    passageIdRaw: unknown,
    receivableCategoryIdRaw: unknown,
  ): Promise<TollPassageDriverReceivableResult> {
    const passageId = requiredId(passageIdRaw, 'Passagem');
    const receivableCategoryId = requiredId(receivableCategoryIdRaw, 'Categoria financeira');

    return UnitOfWork.run(principal.companyId, async tx => {
      const rawTx = tx.getRawTransaction?.();
      if (!rawTx) throw new Error('Toll driver finance persistence unavailable');
      const passage = rows(await rawTx.execute(sql`
        SELECT id,vehicle_id,contract_id,driver_id,concessionaire,road,toll_point,occurred_at,amount,due_date,status
        FROM toll_passages
        WHERE company_id=${principal.companyId} AND id=${passageId}
        LIMIT 1
        FOR UPDATE
      `))[0];
      if (!passage) throw new TollPassageNotFoundError('Passagem não encontrada');
      if (!['PENDING', 'OVERDUE'].includes(String(passage.status))) {
        throw new TollPassageConflictError('Somente passagem pendente ou vencida pode gerar cobrança ao motorista');
      }
      if (!passage.contract_id || !passage.driver_id) {
        throw new TollPassageConflictError('Passagem sem contrato e motorista únicos não pode ser repassada');
      }
      if (!passage.due_date) {
        throw new TollPassageConflictError('Passagem sem vencimento não pode gerar cobrança ao motorista');
      }

      const contract = rows(await rawTx.execute(sql`
        SELECT id,driver_id,vehicle_id,is_archived FROM contracts
        WHERE company_id=${principal.companyId} AND id=${String(passage.contract_id)}
        LIMIT 1
        FOR SHARE
      `))[0];
      if (!contract || contract.is_archived) throw new TollPassageConflictError('Contrato da passagem indisponível');
      if (String(contract.driver_id) !== String(passage.driver_id) || String(contract.vehicle_id) !== String(passage.vehicle_id)) {
        throw new TollPassageConflictError('Vínculo da passagem diverge do contrato');
      }

      const policy = rows(await rawTx.execute(sql`
        SELECT pass_through_enabled FROM toll_contract_policies
        WHERE company_id=${principal.companyId} AND contract_id=${String(passage.contract_id)}
        LIMIT 1
      `))[0];
      if (!policy?.pass_through_enabled) {
        throw new TollPassageConflictError('Contrato não autoriza repasse de pedágio ao motorista');
      }

      await validateIncomeCategory(rawTx, principal.companyId, receivableCategoryId);
      const existing = rows(await rawTx.execute(sql`
        SELECT id FROM account_receivables
        WHERE company_id=${principal.companyId}
          AND origin_type=${TOLL_PASSAGE_DRIVER_ORIGIN}
          AND origin_id=${passageId}
          AND installment_number=1
        ORDER BY created_at,id
        LIMIT 1
      `))[0];

      const receivable = (await ReceivableService.create({
        companyId: principal.companyId,
        originType: TOLL_PASSAGE_DRIVER_ORIGIN,
        originId: passageId,
        vehicleId: String(passage.vehicle_id),
        driverId: String(passage.driver_id),
        contractId: String(passage.contract_id),
        categoryId: receivableCategoryId,
        description: `Repasse de pedágio ${String(passage.concessionaire)} — ${String(passage.road)} / ${String(passage.toll_point)}`,
        totalAmount: Number(passage.amount),
        dueDate: String(passage.due_date).slice(0, 10),
        competenceDate: new Date(passage.occurred_at).toISOString().slice(0, 10),
        userId: principal.userId,
        userName: principal.name,
      }, tx))[0];

      return { receivable, created: !existing };
    });
  }
}
