import { sql } from 'drizzle-orm';
import { ITransactionContext } from './ITransactionContext';
import {
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { AccountPayable, AccountReceivable } from '../../types/entities';
import { ObligationStatus, OriginType, AuditAction } from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import {
  calculateRenegotiationDueDate,
  resolveRenegotiationInstallmentFrequency,
  type RenegotiationInstallmentFrequency,
} from '../../shared/utils/renegotiationSchedule';
import { IdempotencyService } from '../services/IdempotencyService';
import { FinancialPeriodService } from './FinancialPeriodService';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface RenegotiateParams {
  companyId: string;
  obligationIds: string[]; // List of receivables or payables to consolidate
  type: 'RECEIVABLE' | 'PAYABLE';
  newTotalAmount: number;
  installmentsCount: number;
  firstDueDate: string;
  installmentFrequency?: RenegotiationInstallmentFrequency;
  categoryId: string;
  description: string;
  /** Durable logical command key. Required for authoritative PAYABLE renegotiation; optional for RECEIVABLE, where a deterministic server key is derived when absent. */
  idempotencyKey?: string;
  userId: string;
  userName: string;
}

function dateKey(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function stableHash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code + ((i + 1) * 131);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export class RenegotiationService {
  private static recRepo = new AccountReceivableRepository();
  private static payRepo = new AccountPayableRepository();

  private static payableCommandKey(params: RenegotiateParams, txContext?: ITransactionContext): string | undefined {
    const key = typeof params.idempotencyKey === 'string' ? params.idempotencyKey.trim() : '';
    if (!txContext || params.type !== 'PAYABLE') return key || undefined;
    if (!key || key.length > 160) {
      throw new Error('Chave de idempotência da renegociação de contas a pagar é obrigatória e deve ter até 160 caracteres');
    }
    return key;
  }

  private static receivableCommandKey(
    params: RenegotiateParams,
    txContext: ITransactionContext,
    installmentFrequency: RenegotiationInstallmentFrequency
  ): string {
    const explicit = typeof params.idempotencyKey === 'string' ? params.idempotencyKey.trim() : '';
    if (explicit) {
      if (explicit.length > 160) {
        throw new Error('Chave de idempotência da renegociação de contas a receber deve ter até 160 caracteres');
      }
      return explicit;
    }

    // Legacy callers did not send an idempotency key. Keep them safe by deriving a
    // deterministic command key from the complete authoritative command payload.
    const canonical = JSON.stringify({
      companyId: params.companyId,
      obligationIds: [...params.obligationIds].sort(),
      newTotalAmount: roundCurrency(params.newTotalAmount),
      installmentsCount: params.installmentsCount,
      firstDueDate: dateKey(params.firstDueDate),
      installmentFrequency,
      categoryId: params.categoryId.trim(),
      description: params.description.trim(),
    });
    const key = `AUTO-AR-${stableHash(canonical)}`;
    if (!txContext.getRawTransaction?.() || !txContext.findReceivableByIdWithLock) {
      throw new Error('Autoridade transacional de renegociação de contas a receber indisponível');
    }
    return key;
  }

  private static async lockPayableCommand(
    companyId: string,
    commandKey: string,
    txContext: ITransactionContext
  ): Promise<void> {
    const raw = txContext.getRawTransaction?.();
    if (!raw || !txContext.findPayableByIdWithLock) {
      throw new Error('Autoridade transacional de renegociação de contas a pagar indisponível');
    }
    await raw.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${companyId}:${commandKey}`}, 0))`);
  }

  private static async lockReceivableCommand(
    companyId: string,
    commandKey: string,
    txContext: ITransactionContext
  ): Promise<void> {
    const raw = txContext.getRawTransaction?.();
    if (!raw || !txContext.findReceivableByIdWithLock) {
      throw new Error('Autoridade transacional de renegociação de contas a receber indisponível');
    }
    await raw.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${companyId}:${commandKey}`}, 0))`);
  }

  private static payableRenegotiationId(commandKey: string): string {
    return `R17:${commandKey}`;
  }

  private static receivableRenegotiationId(commandKey: string): string {
    return `R18:${commandKey}`;
  }

  private static async recoverPayableRetry(
    params: RenegotiateParams,
    txContext: ITransactionContext,
    locked: AccountPayable[],
    renegotiationId: string,
    installmentFrequency: RenegotiationInstallmentFrequency
  ): Promise<AccountPayable[] | null> {
    const allSameRenegotiation = locked.every(
      (item) => item.status === ObligationStatus.CANCELLED && item.renegotiationId === renegotiationId
    );
    const anyRenegotiated = locked.some(
      (item) => item.status === ObligationStatus.CANCELLED || Boolean(item.renegotiationId)
    );

    if (!allSameRenegotiation) {
      if (anyRenegotiated) {
        throw new Error('Conjunto de contas a pagar já foi renegociado ou cancelado por outro comando');
      }
      return null;
    }

    const recovered: AccountPayable[] = [];
    const totalCents = Math.round(params.newTotalAmount * 100);
    const baseCents = Math.floor(totalCents / params.installmentsCount);
    const remainderCents = totalCents - (baseCents * params.installmentsCount);

    for (let i = 1; i <= params.installmentsCount; i++) {
      const key = IdempotencyService.buildKey(
        OriginType.RENEGOTIATION,
        renegotiationId,
        i,
        undefined,
        params.companyId
      );
      const item = await txContext.getPayableRepo().findByIdempotencyKey(key);
      if (!item) {
        throw new Error('Renegociação anterior incompleta: parcela idempotente não encontrada');
      }
      const expectedAmount = (baseCents + (i === params.installmentsCount ? remainderCents : 0)) / 100;
      const expectedDueDate = calculateRenegotiationDueDate(params.firstDueDate, i, installmentFrequency);
      const matches =
        item.companyId === params.companyId &&
        item.originType === OriginType.RENEGOTIATION &&
        item.originId === renegotiationId &&
        item.renegotiationId === renegotiationId &&
        item.categoryId === params.categoryId &&
        item.installmentNumber === i &&
        item.totalInstallments === params.installmentsCount &&
        roundCurrency(Number(item.originalAmount)) === roundCurrency(expectedAmount) &&
        dateKey(item.dueDate) === dateKey(expectedDueDate);
      if (!matches) {
        throw new Error('Chave de idempotência reutilizada com comando de renegociação diferente');
      }
      recovered.push(item);
    }
    return recovered;
  }

  private static async recoverReceivableRetry(
    params: RenegotiateParams,
    txContext: ITransactionContext,
    locked: AccountReceivable[],
    renegotiationId: string,
    installmentFrequency: RenegotiationInstallmentFrequency
  ): Promise<AccountReceivable[] | null> {
    const allSameRenegotiation = locked.every(
      (item) => item.status === ObligationStatus.CANCELLED && item.renegotiationId === renegotiationId
    );
    const anyRenegotiated = locked.some(
      (item) => item.status === ObligationStatus.CANCELLED || Boolean(item.renegotiationId)
    );

    if (!allSameRenegotiation) {
      if (anyRenegotiated) {
        throw new Error('Conjunto de contas a receber já foi renegociado ou cancelado por outro comando');
      }
      return null;
    }

    const recovered: AccountReceivable[] = [];
    const totalCents = Math.round(params.newTotalAmount * 100);
    const baseCents = Math.floor(totalCents / params.installmentsCount);
    const remainderCents = totalCents - (baseCents * params.installmentsCount);

    for (let i = 1; i <= params.installmentsCount; i++) {
      const key = IdempotencyService.buildKey(
        OriginType.RENEGOTIATION,
        renegotiationId,
        i,
        undefined,
        params.companyId
      );
      const item = await txContext.getReceivableRepo().findByIdempotencyKey(key);
      if (!item) {
        throw new Error('Renegociação anterior incompleta: parcela idempotente não encontrada');
      }
      const expectedAmount = (baseCents + (i === params.installmentsCount ? remainderCents : 0)) / 100;
      const expectedDueDate = calculateRenegotiationDueDate(params.firstDueDate, i, installmentFrequency);
      const matches =
        item.companyId === params.companyId &&
        item.originType === OriginType.RENEGOTIATION &&
        item.originId === renegotiationId &&
        item.renegotiationId === renegotiationId &&
        item.categoryId === params.categoryId &&
        item.installmentNumber === i &&
        item.totalInstallments === params.installmentsCount &&
        item.description === `${params.description} (${i}/${params.installmentsCount})` &&
        roundCurrency(Number(item.originalAmount)) === roundCurrency(expectedAmount) &&
        dateKey(item.dueDate) === dateKey(expectedDueDate);
      if (!matches) {
        throw new Error('Chave de idempotência reutilizada com comando de renegociação diferente');
      }
      recovered.push(item);
    }
    return recovered;
  }

  public static async renegociate(params: RenegotiateParams, txContext?: ITransactionContext) {
    const installmentFrequency = resolveRenegotiationInstallmentFrequency(params.installmentFrequency);
    if (!Array.isArray(params.obligationIds) || params.obligationIds.length === 0) {
      throw new Error('Ao menos um título deve ser informado para renegociação');
    }
    if (new Set(params.obligationIds).size !== params.obligationIds.length) {
      throw new Error('A renegociação não aceita títulos duplicados');
    }
    if (!Number.isInteger(params.installmentsCount) || params.installmentsCount < 1 || params.installmentsCount > 120) {
      throw new Error('Quantidade de parcelas inválida');
    }
    if (!Number.isFinite(params.newTotalAmount) || params.newTotalAmount <= 0) {
      throw new Error('Valor da renegociação inválido');
    }
    if (!params.categoryId?.trim() || !params.description?.trim()) {
      throw new Error('Categoria e descrição são obrigatórias');
    }

    // Validate the date before any obligation is mutated, including legacy/local test paths.
    calculateRenegotiationDueDate(params.firstDueDate, 1, installmentFrequency);

    await FinancialAuthorizationService.authorize(params.userId, params.companyId, 'FINANCIAL_RENEGOTIATION', txContext);
    await FinancialPeriodService.assertDateOpen(params.companyId, params.firstDueDate, txContext);

    if (params.type === 'RECEIVABLE' && txContext) {
      const commandKey = this.receivableCommandKey(params, txContext, installmentFrequency);
      await this.lockReceivableCommand(params.companyId, commandKey, txContext);
      const renegotiationId = this.receivableRenegotiationId(commandKey);
      const locked: AccountReceivable[] = [];

      // Deterministic lock order prevents deadlocks when concurrent commands overlap.
      for (const id of [...params.obligationIds].sort()) {
        const item = await txContext.findReceivableByIdWithLock!(id);
        if (!item) {
          throw new Error(`Título a receber ${id} não encontrado ou pertence a outra empresa.`);
        }
        if (!item.companyId || item.companyId !== params.companyId) {
          throw new Error('Acesso negado: Conta a Receber pertence a outra empresa ou tenant inválido');
        }
        locked.push(item);
      }

      const retry = await this.recoverReceivableRetry(
        params,
        txContext,
        locked,
        renegotiationId,
        installmentFrequency
      );
      if (retry) return retry;

      for (const item of locked) {
        if (![ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID].includes(item.status as ObligationStatus)) {
          throw new Error(`Título em status ${item.status} não aceita renegociação`);
        }
        if (item.renegotiationId) {
          throw new Error('Título já vinculado a outra renegociação');
        }
      }

      // Prior partial receipts and authorized adjustments are reflected in balanceAmount.
      // Without an explicit renegotiation adjustment policy, replacement principal must
      // exactly match the remaining authoritative debt.
      const authoritativeCents = locked.reduce(
        (sum, item) => sum + Math.round(roundCurrency(Number(item.balanceAmount)) * 100),
        0
      );
      const requestedCents = Math.round(params.newTotalAmount * 100);
      if (requestedCents !== authoritativeCents || authoritativeCents <= 0) {
        throw new Error('Valor da renegociação diverge do saldo devedor autoritativo');
      }

      const totalCents = authoritativeCents;
      const baseCentsPerInstallment = Math.floor(totalCents / params.installmentsCount);
      const remainderCents = totalCents - (baseCentsPerInstallment * params.installmentsCount);
      const now = new Date().toISOString();

      for (const item of locked) {
        await txContext.getReceivableRepo().update(item.id, {
          status: ObligationStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: `Renegociado através do lote ${renegotiationId}`,
          renegotiationId,
          updatedAt: now,
        });
      }

      const createdList: AccountReceivable[] = [];
      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;
        const idempotencyKey = IdempotencyService.buildKey(
          OriginType.RENEGOTIATION,
          renegotiationId,
          i,
          undefined,
          params.companyId
        );
        const calculatedDueDate = calculateRenegotiationDueDate(params.firstDueDate, i, installmentFrequency);
        const item = await txContext.getReceivableRepo().create({
          id: generateUUID(),
          companyId: params.companyId,
          originType: OriginType.RENEGOTIATION,
          originId: renegotiationId,
          categoryId: params.categoryId,
          description: `${params.description} (${i}/${params.installmentsCount})`,
          originalAmount: installmentAmount,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount,
          paidAmount: 0,
          balanceAmount: installmentAmount,
          dueDate: calculatedDueDate,
          competenceDate: calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentNumber: i,
          totalInstallments: params.installmentsCount,
          renegotiationId,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        });
        createdList.push(item);
      }

      await AuditLogger.logAction(
        params.companyId,
        'Renegotiation',
        renegotiationId,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        {
          obligationIds: params.obligationIds,
          installmentFrequency,
          authoritativeRemainingAmount: authoritativeCents / 100,
          idempotencyKey: commandKey,
          newInstallments: createdList,
        },
        txContext
      );
      return createdList;
    }

    if (params.type === 'PAYABLE' && txContext) {
      const commandKey = this.payableCommandKey(params, txContext)!;
      await this.lockPayableCommand(params.companyId, commandKey, txContext);
      const renegotiationId = this.payableRenegotiationId(commandKey);
      const locked: AccountPayable[] = [];

      // Deterministic lock order prevents deadlocks when concurrent commands overlap.
      for (const id of [...params.obligationIds].sort()) {
        const item = await txContext.findPayableByIdWithLock!(id);
        if (!item) {
          throw new Error(`Título a pagar ${id} não encontrado ou pertence a outra empresa.`);
        }
        if (!item.companyId || item.companyId !== params.companyId) {
          throw new Error('Acesso negado: Conta a Pagar pertence a outra empresa ou tenant inválido');
        }
        locked.push(item);
      }

      const retry = await this.recoverPayableRetry(
        params,
        txContext,
        locked,
        renegotiationId,
        installmentFrequency
      );
      if (retry) return retry;

      for (const item of locked) {
        if (![ObligationStatus.PENDING, ObligationStatus.PARTIALLY_PAID].includes(item.status as ObligationStatus)) {
          throw new Error(`Título em status ${item.status} não aceita renegociação`);
        }
        if (item.renegotiationId) {
          throw new Error('Título já vinculado a outra renegociação');
        }
      }

      // R11/R12 adjustments and prior partial payments are already reflected in balanceAmount.
      // Until an explicit authorized renegotiation-adjustment policy exists, the server refuses
      // to forgive or inflate debt: replacement principal must equal the authoritative remaining debt.
      const authoritativeCents = locked.reduce(
        (sum, item) => sum + Math.round(roundCurrency(Number(item.balanceAmount)) * 100),
        0
      );
      const requestedCents = Math.round(params.newTotalAmount * 100);
      if (requestedCents !== authoritativeCents || authoritativeCents <= 0) {
        throw new Error('Valor da renegociação diverge do saldo devedor autoritativo');
      }

      const totalCents = authoritativeCents;
      const baseCentsPerInstallment = Math.floor(totalCents / params.installmentsCount);
      const remainderCents = totalCents - (baseCentsPerInstallment * params.installmentsCount);
      const now = new Date().toISOString();

      for (const item of locked) {
        await txContext.getPayableRepo().update(item.id, {
          status: ObligationStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: `Renegociado através do lote ${renegotiationId}`,
          renegotiationId,
          updatedAt: now,
        });
      }

      const createdList: AccountPayable[] = [];
      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;
        const idempotencyKey = IdempotencyService.buildKey(
          OriginType.RENEGOTIATION,
          renegotiationId,
          i,
          undefined,
          params.companyId
        );
        const calculatedDueDate = calculateRenegotiationDueDate(params.firstDueDate, i, installmentFrequency);
        const item = await txContext.getPayableRepo().create({
          id: generateUUID(),
          companyId: params.companyId,
          originType: OriginType.RENEGOTIATION,
          originId: renegotiationId,
          categoryId: params.categoryId,
          description: `${params.description} (${i}/${params.installmentsCount})`,
          originalAmount: installmentAmount,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount,
          paidAmount: 0,
          balanceAmount: installmentAmount,
          dueDate: calculatedDueDate,
          competenceDate: calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentNumber: i,
          totalInstallments: params.installmentsCount,
          renegotiationId,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        });
        createdList.push(item);
      }

      await AuditLogger.logAction(
        params.companyId,
        'Renegotiation',
        renegotiationId,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        {
          obligationIds: params.obligationIds,
          installmentFrequency,
          authoritativeRemainingAmount: authoritativeCents / 100,
          idempotencyKey: commandKey,
          newInstallments: createdList,
        },
        txContext
      );
      return createdList;
    }

    // Legacy local/non-UOW compatibility path only. Server routes use UnitOfWork.
    const renegotiationId = generateUUID();
    const totalCents = Math.round(params.newTotalAmount * 100);
    const baseCentsPerInstallment = Math.floor(totalCents / params.installmentsCount);
    const remainderCents = totalCents - (baseCentsPerInstallment * params.installmentsCount);

    if (params.type === 'RECEIVABLE') {
      for (const id of params.obligationIds) {
        const item = await this.recRepo.findByIdForCompany(id, params.companyId);
        if (!item) throw new Error(`Título a receber ${id} não encontrado ou pertence a outra empresa.`);
      }

      for (const id of params.obligationIds) {
        await this.recRepo.updateForCompany(id, params.companyId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt: new Date().toISOString(),
          cancelReason: `Renegociado através do lote ${renegotiationId}`,
          renegotiationId,
        });
      }

      const createdList = [];
      for (let i = 1; i <= params.installmentsCount; i++) {
        const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
        const installmentAmount = installmentCents / 100;
        const idempotencyKey = IdempotencyService.buildKey(OriginType.RENEGOTIATION, renegotiationId, i, undefined, params.companyId);
        const calculatedDueDate = calculateRenegotiationDueDate(params.firstDueDate, i, installmentFrequency);
        const item = await this.recRepo.createForCompany(params.companyId, {
          id: generateUUID(),
          companyId: params.companyId,
          originType: OriginType.RENEGOTIATION,
          originId: renegotiationId,
          categoryId: params.categoryId,
          description: `${params.description} (${i}/${params.installmentsCount})`,
          originalAmount: installmentAmount,
          discountAmount: 0,
          fineAmount: 0,
          interestAmount: 0,
          updatedAmount: installmentAmount,
          paidAmount: 0,
          balanceAmount: installmentAmount,
          dueDate: calculatedDueDate,
          competenceDate: calculatedDueDate,
          status: ObligationStatus.PENDING,
          installmentNumber: i,
          totalInstallments: params.installmentsCount,
          renegotiationId,
          idempotencyKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        createdList.push(item);
      }

      await AuditLogger.logAction(
        params.companyId,
        'Renegotiation',
        renegotiationId,
        AuditAction.CREATE,
        params.userId,
        params.userName,
        null,
        { obligationIds: params.obligationIds, installmentFrequency, newInstallments: createdList }
      );
      return createdList;
    }

    // Legacy non-UOW PAYABLE compatibility path only. Production uses the authoritative path above.
    for (const id of params.obligationIds) {
      const item = await this.payRepo.findByIdForCompany(id, params.companyId);
      if (!item) throw new Error(`Título a pagar ${id} não encontrado ou pertence a outra empresa.`);
    }
    for (const id of params.obligationIds) {
      await this.payRepo.updateForCompany(id, params.companyId, {
        status: ObligationStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
        cancelReason: `Renegociado através do lote ${renegotiationId}`,
        renegotiationId,
      });
    }
    const createdList = [];
    for (let i = 1; i <= params.installmentsCount; i++) {
      const installmentCents = baseCentsPerInstallment + (i === params.installmentsCount ? remainderCents : 0);
      const installmentAmount = installmentCents / 100;
      const idempotencyKey = IdempotencyService.buildKey(OriginType.RENEGOTIATION, renegotiationId, i, undefined, params.companyId);
      const calculatedDueDate = calculateRenegotiationDueDate(params.firstDueDate, i, installmentFrequency);
      const item = await this.payRepo.createForCompany(params.companyId, {
        id: generateUUID(), companyId: params.companyId, originType: OriginType.RENEGOTIATION,
        originId: renegotiationId, categoryId: params.categoryId,
        description: `${params.description} (${i}/${params.installmentsCount})`, originalAmount: installmentAmount,
        discountAmount: 0, fineAmount: 0, interestAmount: 0, updatedAmount: installmentAmount,
        paidAmount: 0, balanceAmount: installmentAmount, dueDate: calculatedDueDate, competenceDate: calculatedDueDate,
        status: ObligationStatus.PENDING, installmentNumber: i, totalInstallments: params.installmentsCount,
        renegotiationId, idempotencyKey, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      createdList.push(item);
    }
    await AuditLogger.logAction(params.companyId, 'Renegotiation', renegotiationId, AuditAction.CREATE,
      params.userId, params.userName, null,
      { obligationIds: params.obligationIds, installmentFrequency, newInstallments: createdList });
    return createdList;
  }
}
