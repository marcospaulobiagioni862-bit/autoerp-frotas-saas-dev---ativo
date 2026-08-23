import { createHash } from 'node:crypto';
import { UnitOfWork } from '../db/uow';
import {
  PostgresBankStatementRepository,
  type AuthoritativeBankStatementEntry,
  type BankStatementDirection,
  type BankStatementStatus,
} from '../db/repositories/postgresBankStatementRepository';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { roundCurrency } from '../shared/utils/currency';
import { generateUUID } from '../shared/utils/uuid';
import { AuditAction } from '../types/enums';
import type { FinancialTransaction } from '../types/entities';

export interface ReconciliationActor {
  companyId: string;
  userId: string;
  name: string;
}

export interface ImportBankStatementInput {
  financialAccountId: string;
  entries: Array<{
    externalId?: string;
    date: string;
    description: string;
    amount: number;
    direction: BankStatementDirection;
    documentNumber?: string;
    importSource?: string;
  }>;
}

export interface ReconciliationCandidate {
  transaction: FinancialTransaction;
  confidence: 'EXACT' | 'HIGH_CONFIDENCE' | 'POSSIBLE';
}

export interface ReconciliationSuggestion {
  statementEntry: AuthoritativeBankStatementEntry;
  candidates: ReconciliationCandidate[];
  bestMatch?: FinancialTransaction;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IMPORT_ENTRIES = 2000;
const MS_PER_DAY = 86_400_000;

function txOf(txContext: any): any {
  const tx = txContext?.getRawTransaction?.();
  if (!tx) throw new Error('Autoridade PostgreSQL de conciliação bancária indisponível');
  return tx;
}

function normalizeDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!DATE_PATTERN.test(text)) throw new Error('Data de extrato inválida');
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) throw new Error('Data de extrato inválida');
  return text;
}

function requiredText(value: unknown, label: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new Error(`${label} inválido`);
  return text;
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!text || text.length > max) throw new Error(`${label} inválido`);
  return text;
}

function normalizeDirection(value: unknown): BankStatementDirection {
  if (value === 'CREDIT' || value === 'DEBIT') return value;
  throw new Error('Direção do extrato inválida');
}

function normalizeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999.99) {
    throw new Error('Valor da entrada de extrato inválido');
  }
  return roundCurrency(amount);
}

function normalizeStatus(value: unknown): BankStatementStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (['UNMATCHED', 'SUGGESTED', 'MATCHED', 'IGNORED', 'REVERSED'].includes(String(value))) {
    return String(value) as BankStatementStatus;
  }
  throw new Error('Status de conciliação inválido');
}

function canonicalDescription(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function dedupKey(input: {
  externalId?: string;
  date: string;
  description: string;
  amount: number;
  direction: BankStatementDirection;
  documentNumber?: string;
}): string {
  if (input.externalId) return `EXT:${digest(input.externalId)}`;
  return `FALLBACK:${digest([
    input.date,
    input.direction,
    input.amount.toFixed(2),
    canonicalDescription(input.description),
    (input.documentNumber || '').trim(),
  ].join('|'))}`;
}

async function requireAccount(txContext: any, actor: ReconciliationActor, accountId: string, lock: boolean, requireActive: boolean): Promise<any> {
  const id = requiredText(accountId, 'Conta financeira', 200);
  const account = lock && txContext.findFinancialAccountByIdWithLock
    ? await txContext.findFinancialAccountByIdWithLock(id)
    : await txContext.getAccountRepo().findById(id);
  if (!account || account.companyId !== actor.companyId) throw new Error('Conta financeira não encontrada');
  if (requireActive && account.status !== 'ACTIVE') throw new Error('Conta financeira inativa');
  return account;
}

async function audit(
  txContext: any,
  actor: ReconciliationActor,
  entryId: string,
  action: AuditAction,
  previous: unknown,
  next: unknown,
): Promise<void> {
  await txContext.getAuditLogRepo().create({
    id: generateUUID(),
    companyId: actor.companyId,
    entityName: 'BankStatementEntry',
    entityId: entryId,
    action,
    previousState: previous === undefined || previous === null ? undefined : JSON.stringify(previous),
    newState: next === undefined || next === null ? undefined : JSON.stringify(next),
    userId: actor.userId,
    userName: actor.name,
    timestamp: new Date().toISOString(),
  });
}

async function transactionDirectionForAccount(
  txContext: any,
  transaction: FinancialTransaction,
  accountId: string,
): Promise<BankStatementDirection | null> {
  if (transaction.type !== 'REVERSAL' && transaction.isReversed) return null;

  if (transaction.type === 'INCOME') {
    return transaction.financialAccountId === accountId ? 'CREDIT' : null;
  }
  if (transaction.type === 'EXPENSE') {
    return transaction.financialAccountId === accountId ? 'DEBIT' : null;
  }
  if (transaction.type === 'TRANSFER') {
    if (transaction.financialAccountId === accountId) return 'DEBIT';
    if (transaction.destinationAccountId === accountId) return 'CREDIT';
    return null;
  }
  if (transaction.type === 'REVERSAL') {
    if (!transaction.reversalTransactionId) return null;
    const original = await txContext.getTransactionRepo().findById(transaction.reversalTransactionId);
    if (!original || original.companyId !== transaction.companyId) return null;
    if (original.type === 'INCOME') {
      return original.financialAccountId === accountId ? 'DEBIT' : null;
    }
    if (original.type === 'EXPENSE') {
      return original.financialAccountId === accountId ? 'CREDIT' : null;
    }
    if (original.type === 'TRANSFER') {
      if (original.financialAccountId === accountId) return 'CREDIT';
      if (original.destinationAccountId === accountId) return 'DEBIT';
    }
  }
  return null;
}

function daysApart(a: string, b: string): number {
  const parse = (value: string): number => {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.abs(parse(a) - parse(b)) / MS_PER_DAY;
}

export class BankReconciliationAuthority {
  static normalizeStatus(value: unknown): BankStatementStatus | undefined {
    return normalizeStatus(value);
  }

  static async importEntries(actor: ReconciliationActor, input: ImportBankStatementInput): Promise<{
    imported: AuthoritativeBankStatementEntry[];
    skippedDuplicates: number;
  }> {
    if (!Array.isArray(input?.entries) || input.entries.length < 1 || input.entries.length > MAX_IMPORT_ENTRIES) {
      throw new Error('Quantidade de entradas de extrato inválida');
    }
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'BANK_RECONCILIATION_MATCH', txContext);
      const accountId = requiredText(input.financialAccountId, 'Conta financeira', 200);
      await requireAccount(txContext, actor, accountId, true, true);
      const repo = new PostgresBankStatementRepository(txOf(txContext));
      const imported: AuthoritativeBankStatementEntry[] = [];
      let skippedDuplicates = 0;

      for (const raw of input.entries) {
        const date = normalizeDate(raw?.date);
        const description = requiredText(raw?.description, 'Descrição do extrato', 500);
        const amount = normalizeAmount(raw?.amount);
        const direction = normalizeDirection(raw?.direction);
        const externalId = optionalText(raw?.externalId, 'Identificador externo', 200);
        const documentNumber = optionalText(raw?.documentNumber, 'Número de documento', 200);
        const importSource = optionalText(raw?.importSource, 'Origem de importação', 100) || 'MANUAL';
        const key = dedupKey({ externalId, date, description, amount, direction, documentNumber });
        const now = new Date().toISOString();
        const correlationId = generateUUID();
        const result = await repo.createOrGet({
          id: generateUUID(),
          companyId: actor.companyId,
          financialAccountId: accountId,
          externalId,
          date,
          description,
          amount,
          direction,
          documentNumber,
          importSource,
          correlationId,
          dedupKey: key,
          createdAt: now,
        });
        if (!result.inserted) {
          skippedDuplicates += 1;
          continue;
        }
        imported.push(result.item);
        await audit(txContext, actor, result.item.id, AuditAction.STATEMENT_ENTRY_IMPORTED, null, {
          ...result.item,
          reason: 'AUTHORITATIVE_BANK_STATEMENT_IMPORT',
        });
      }
      return { imported, skippedDuplicates };
    });
  }

  static async listEntries(
    actor: ReconciliationActor,
    financialAccountId?: string,
    statusValue?: BankStatementStatus,
  ): Promise<AuthoritativeBankStatementEntry[]> {
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'BANK_RECONCILIATION_VIEW', txContext);
      let accountId: string | undefined;
      if (financialAccountId) {
        accountId = requiredText(financialAccountId, 'Conta financeira', 200);
        await requireAccount(txContext, actor, accountId, false, false);
      }
      return await new PostgresBankStatementRepository(txOf(txContext))
        .findAllForCompany(actor.companyId, accountId, statusValue);
    });
  }

  static async matchEntry(
    actor: ReconciliationActor,
    statementEntryId: string,
    transactionId: string,
  ): Promise<AuthoritativeBankStatementEntry> {
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'BANK_RECONCILIATION_MATCH', txContext);
      const repo = new PostgresBankStatementRepository(txOf(txContext));
      const entryId = requiredText(statementEntryId, 'Entrada de extrato', 200);
      const txId = requiredText(transactionId, 'Transação financeira', 200);
      const entry = await repo.findByIdForCompany(actor.companyId, entryId, true);
      if (!entry) throw new Error('Entrada de extrato bancário não encontrada');
      if (!entry.direction) throw new Error('Entrada legada sem direção autoritativa não pode ser conciliada');
      if (entry.status === 'MATCHED') throw new Error('Entrada de extrato já está conciliada');
      if (entry.status === 'REVERSED') throw new Error('Entrada de extrato revertida não pode ser conciliada');
      await requireAccount(txContext, actor, entry.financialAccountId, true, true);

      if (!txContext.findFinancialTransactionByIdWithLock) throw new Error('Autoridade transacional de conciliação indisponível');
      const transaction = await txContext.findFinancialTransactionByIdWithLock(txId) as FinancialTransaction | null;
      if (!transaction || transaction.companyId !== actor.companyId) throw new Error('Transação financeira não encontrada');
      const expectedDirection = await transactionDirectionForAccount(txContext, transaction, entry.financialAccountId);
      if (!expectedDirection || expectedDirection !== entry.direction) {
        throw new Error('Direção ou conta financeira incompatível com a transação');
      }
      if (roundCurrency(Number(transaction.amount)) !== roundCurrency(entry.amount)) {
        throw new Error('Valor do extrato diverge do valor da transação');
      }
      const existing = await repo.findMatchedForTransactionScope(
        actor.companyId,
        entry.financialAccountId,
        transaction.id,
        entry.id,
      );
      if (existing) throw new Error('Transação já conciliada nesta conta financeira');

      const now = new Date().toISOString();
      const correlationId = generateUUID();
      const updated = await repo.match(actor.companyId, entry.id, transaction.id, actor.name, correlationId, now);
      await audit(txContext, actor, entry.id, AuditAction.RECONCILIATION_MATCHED, entry, {
        ...updated,
        reason: 'AUTHORITATIVE_BANK_RECONCILIATION_MATCH',
      });
      return updated;
    });
  }

  static async unmatchEntry(
    actor: ReconciliationActor,
    statementEntryId: string,
    reason = 'Desconciliação manual',
  ): Promise<AuthoritativeBankStatementEntry> {
    const normalizedReason = requiredText(reason, 'Motivo da desconciliação', 1000);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'BANK_RECONCILIATION_UNMATCH', txContext);
      const repo = new PostgresBankStatementRepository(txOf(txContext));
      const entry = await repo.findByIdForCompany(
        actor.companyId,
        requiredText(statementEntryId, 'Entrada de extrato', 200),
        true,
      );
      if (!entry) throw new Error('Entrada de extrato bancário não encontrada');
      if (entry.status !== 'MATCHED') return entry;
      const correlationId = generateUUID();
      const updated = await repo.unmatch(actor.companyId, entry.id, correlationId, new Date().toISOString());
      await audit(txContext, actor, entry.id, AuditAction.RECONCILIATION_UNMATCHED, entry, {
        ...updated,
        reason: normalizedReason,
      });
      return updated;
    });
  }

  static async ignoreEntry(
    actor: ReconciliationActor,
    statementEntryId: string,
    reason = 'Ignorado manualmente',
  ): Promise<AuthoritativeBankStatementEntry> {
    const normalizedReason = requiredText(reason, 'Motivo para ignorar', 1000);
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'BANK_RECONCILIATION_IGNORE', txContext);
      const repo = new PostgresBankStatementRepository(txOf(txContext));
      const entry = await repo.findByIdForCompany(
        actor.companyId,
        requiredText(statementEntryId, 'Entrada de extrato', 200),
        true,
      );
      if (!entry) throw new Error('Entrada de extrato bancário não encontrada');
      if (entry.status === 'MATCHED') throw new Error('Desconcilie a entrada antes de ignorá-la');
      if (entry.status === 'IGNORED') return entry;
      if (entry.status === 'REVERSED') throw new Error('Entrada de extrato revertida não pode ser ignorada');
      const correlationId = generateUUID();
      const updated = await repo.ignore(actor.companyId, entry.id, correlationId, new Date().toISOString());
      await audit(txContext, actor, entry.id, AuditAction.RECONCILIATION_IGNORED, entry, {
        ...updated,
        reason: normalizedReason,
      });
      return updated;
    });
  }

  static async suggestMatches(
    actor: ReconciliationActor,
    financialAccountId: string,
  ): Promise<ReconciliationSuggestion[]> {
    return await UnitOfWork.run(actor.companyId, async (txContext: any) => {
      await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'BANK_RECONCILIATION_VIEW', txContext);
      const accountId = requiredText(financialAccountId, 'Conta financeira', 200);
      await requireAccount(txContext, actor, accountId, false, true);
      const repo = new PostgresBankStatementRepository(txOf(txContext));
      const entries = (await repo.findAllForCompany(actor.companyId, accountId, 'UNMATCHED'))
        .filter((entry) => Boolean(entry.direction));
      const allEntries = await repo.findAllForCompany(actor.companyId, accountId);
      const matchedTxIds = new Set(
        allEntries.filter((entry) => entry.status === 'MATCHED' && entry.matchedTransactionId)
          .map((entry) => entry.matchedTransactionId as string),
      );
      const transactions = (await txContext.getTransactionRepo().findAll({ companyId: actor.companyId })) as FinancialTransaction[];
      const suggestions: ReconciliationSuggestion[] = [];

      for (const entry of entries) {
        const candidates: ReconciliationCandidate[] = [];
        for (const transaction of transactions) {
          if (matchedTxIds.has(transaction.id)) continue;
          if (transaction.type !== 'REVERSAL' && transaction.isReversed) continue;
          if (roundCurrency(Number(transaction.amount)) !== roundCurrency(entry.amount)) continue;
          const direction = await transactionDirectionForAccount(txContext, transaction, accountId);
          if (!direction || direction !== entry.direction) continue;
          const diff = daysApart(entry.date, transaction.transactionDate);
          if (diff === 0) candidates.push({ transaction, confidence: 'EXACT' });
          else if (diff <= 3) candidates.push({ transaction, confidence: 'HIGH_CONFIDENCE' });
          else if (diff <= 7) candidates.push({ transaction, confidence: 'POSSIBLE' });
        }
        candidates.sort((a, b) => {
          const rank = { EXACT: 0, HIGH_CONFIDENCE: 1, POSSIBLE: 2 } as const;
          return rank[a.confidence] - rank[b.confidence] || a.transaction.id.localeCompare(b.transaction.id);
        });
        const exact = candidates.filter((item) => item.confidence === 'EXACT');
        const high = candidates.filter((item) => item.confidence === 'HIGH_CONFIDENCE');
        let bestMatch: FinancialTransaction | undefined;
        if (exact.length === 1) bestMatch = exact[0].transaction;
        else if (exact.length === 0 && high.length === 1) bestMatch = high[0].transaction;
        suggestions.push({ statementEntry: entry, candidates, bestMatch });
      }
      return suggestions;
    });
  }
}
