import {
  BankStatementEntryRepository,
  FinancialTransactionRepository,
  FinancialAccountRepository,
} from '../../persistence/repositories/localRepositories';
import { BankStatementEntry, FinancialTransaction } from '../../types/entities';
import {
  StatementEntryStatus,
  StatementDirection,
  TransactionType,
  AuditAction,
} from '../../types/enums';
import { roundCurrency } from '../../shared/utils/currency';
import { generateUUID } from '../../shared/utils/uuid';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { FinancialAuthorizationService } from './FinancialAuthorizationService';

export interface ImportStatementParams {
  companyId: string;
  financialAccountId: string;
  entries: Array<{
    externalId?: string;
    date: string; // YYYY-MM-DD
    description: string;
    amount: number;
    direction: StatementDirection;
    documentNumber?: string;
    importSource?: string;
  }>;
  userId?: string;
  userName?: string;
}

export interface MatchSuggestion {
  statementEntry: BankStatementEntry;
  candidates: Array<{
    transaction: FinancialTransaction;
    confidence: 'EXACT' | 'HIGH_CONFIDENCE' | 'POSSIBLE';
  }>;
  bestMatch?: FinancialTransaction;
}

export class BankReconciliationService {
  private static entryRepo = new BankStatementEntryRepository();
  private static txRepo = new FinancialTransactionRepository();
  private static accountRepo = new FinancialAccountRepository();

  public static async importStatementEntries(
    params: ImportStatementParams
  ): Promise<{ imported: BankStatementEntry[]; skippedDuplicates: number }> {
    if (!params.companyId) {
      throw new Error('companyId é obrigatório para importação de extrato');
    }
    if (!params.financialAccountId) {
      throw new Error('financialAccountId é obrigatório para importação de extrato');
    }

    const { companyId, financialAccountId } = params;
    const userId = params.userId || 'system';
    const userName = params.userName || 'System';

    await FinancialAuthorizationService.authorize(userId, companyId, 'BANK_RECONCILIATION_MATCH');

    const account = await this.accountRepo.findByIdForCompany(financialAccountId, companyId);
    if (!account || account.companyId !== companyId) {
      throw new Error('Conta financeira não encontrada ou de outro tenant');
    }

    const existingEntries = await this.entryRepo.findAllForCompany(companyId);
    const imported: BankStatementEntry[] = [];
    let skippedDuplicates = 0;

    for (const item of params.entries) {
      if (!item.amount || item.amount <= 0 || isNaN(item.amount) || !isFinite(item.amount)) {
        throw new Error('Valor da entrada de extrato deve ser um número positivo válido');
      }
      if (!item.date || !item.description) {
        throw new Error('Data e descrição são obrigatórias para entrada de extrato');
      }

      const entryAmount = roundCurrency(item.amount);
      const entryDirection = item.direction;
      const entryExternalId = item.externalId ? item.externalId.trim() : undefined;

      // Deterministic idempotency key
      const isDuplicate = existingEntries.some((e) => {
        if (e.companyId !== companyId || e.financialAccountId !== financialAccountId) return false;
        if (entryExternalId && e.externalId && e.externalId === entryExternalId) return true;
        return (
          e.date === item.date &&
          roundCurrency(e.amount) === entryAmount &&
          e.direction === entryDirection &&
          e.description === item.description
        );
      });

      if (isDuplicate) {
        skippedDuplicates++;
        continue;
      }

      const newEntry: BankStatementEntry = {
        id: generateUUID(),
        companyId,
        financialAccountId,
        externalId: entryExternalId,
        date: item.date,
        description: item.description,
        amount: entryAmount,
        direction: entryDirection,
        documentNumber: item.documentNumber,
        importSource: item.importSource || 'MANUAL',
        status: StatementEntryStatus.UNMATCHED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const created = await this.entryRepo.createForCompany(companyId, newEntry);
      existingEntries.push(created);
      imported.push(created);

      await AuditLogger.logAction(
        companyId,
        'BankStatementEntry',
        created.id,
        AuditAction.STATEMENT_ENTRY_IMPORTED,
        userId,
        userName,
        null,
        created
      );
    }

    // CRITICAL INVARIANT: Reconciling / Importing statement entries NEVER creates a FinancialTransaction and NEVER changes account balance!
    return { imported, skippedDuplicates };
  }

  public static async matchEntry(
    companyId: string,
    statementEntryId: string,
    transactionId: string,
    userId: string = 'system',
    userName: string = 'System'
  ): Promise<BankStatementEntry> {
    await FinancialAuthorizationService.authorize(userId, companyId, 'BANK_RECONCILIATION_MATCH');

    if (!companyId) throw new Error('companyId é obrigatório para conciliação');

    const entry = await this.entryRepo.findByIdForCompany(statementEntryId, companyId);
    if (!entry || entry.companyId !== companyId) {
      throw new Error('Entrada de extrato não encontrada ou pertence a outra empresa');
    }

    if (entry.status === StatementEntryStatus.MATCHED) {
      throw new Error('Entrada de extrato já está conciliada. Desconcilie primeiro.');
    }

    const tx = await this.txRepo.findByIdForCompany(transactionId, companyId);
    if (!tx || tx.companyId !== companyId) {
      throw new Error('Transação financeira não encontrada ou pertence a outra empresa');
    }

    // Financial Account Check
    if (tx.financialAccountId !== entry.financialAccountId && tx.destinationAccountId !== entry.financialAccountId) {
      throw new Error('Conta financeira do lançamento não corresponde à conta do extrato');
    }

    // Direction Compatibility
    if (entry.direction === StatementDirection.CREDIT) {
      if (
        tx.type !== TransactionType.INCOME &&
        tx.type !== TransactionType.REVERSAL &&
        !(tx.type === TransactionType.TRANSFER && tx.destinationAccountId === entry.financialAccountId)
      ) {
        throw new Error('Direção CRÉDITO do extrato é incompatível com o tipo de transação');
      }
    } else if (entry.direction === StatementDirection.DEBIT) {
      if (
        tx.type !== TransactionType.EXPENSE &&
        tx.type !== TransactionType.REVERSAL &&
        !(tx.type === TransactionType.TRANSFER && tx.financialAccountId === entry.financialAccountId)
      ) {
        throw new Error('Direção DÉBITO do extrato é incompatível com o tipo de transação');
      }
    }

    // Amount Compatibility
    if (roundCurrency(entry.amount) !== roundCurrency(tx.amount)) {
      throw new Error(
        `Valor do extrato (R$ ${entry.amount}) diverge do valor da transação (R$ ${tx.amount})`
      );
    }

    // Prevent duplicate reconciliation of same transaction
    const allEntries = await this.entryRepo.findAllForCompany(companyId);
    const alreadyMatched = allEntries.some(
      (e) =>
        e.id !== entry.id &&
        e.companyId === companyId &&
        e.status === StatementEntryStatus.MATCHED &&
        e.matchedTransactionId === tx.id
    );
    if (alreadyMatched) {
      throw new Error('Esta transação já está conciliada com outro movimento de extrato');
    }

    const previousState = { ...entry };
    const now = new Date().toISOString();

    entry.status = StatementEntryStatus.MATCHED;
    entry.matchedTransactionId = tx.id;
    entry.matchedAt = now;
    entry.matchedBy = userName;
    entry.updatedAt = now;

    const updated = await this.entryRepo.updateForCompany(entry.id, companyId, entry);

    await AuditLogger.logAction(
      companyId,
      'BankStatementEntry',
      updated.id,
      AuditAction.RECONCILIATION_MATCHED,
      userId,
      userName,
      previousState,
      updated
    );

    // CRITICAL: Reconciliation only links records, NEVER creates transactions or changes balance!
    return updated;
  }

  public static async unmatchEntry(
    companyId: string,
    statementEntryId: string,
    userId: string = 'system',
    userName: string = 'System',
    reason: string = 'Desconciliação manual'
  ): Promise<BankStatementEntry> {
    await FinancialAuthorizationService.authorize(userId, companyId, 'BANK_RECONCILIATION_UNMATCH');

    if (!companyId) throw new Error('companyId é obrigatório para desconciliação');

    const entry = await this.entryRepo.findByIdForCompany(statementEntryId, companyId);
    if (!entry || entry.companyId !== companyId) {
      throw new Error('Entrada de extrato não encontrada ou pertence a outra empresa');
    }

    if (entry.status !== StatementEntryStatus.MATCHED) {
      return entry; // Already unmatched
    }

    const previousState = { ...entry };
    const now = new Date().toISOString();

    entry.status = StatementEntryStatus.UNMATCHED;
    entry.matchedTransactionId = undefined;
    entry.matchedAt = undefined;
    entry.matchedBy = undefined;
    entry.updatedAt = now;

    const updated = await this.entryRepo.updateForCompany(entry.id, companyId, entry);

    await AuditLogger.logAction(
      companyId,
      'BankStatementEntry',
      updated.id,
      AuditAction.RECONCILIATION_UNMATCHED,
      userId,
      userName,
      previousState,
      { ...updated, unmatchReason: reason }
    );

    return updated;
  }

  public static async ignoreEntry(
    companyId: string,
    statementEntryId: string,
    userId: string = 'system',
    userName: string = 'System',
    reason: string = 'Ignorado manualmente'
  ): Promise<BankStatementEntry> {
    await FinancialAuthorizationService.authorize(userId, companyId, 'BANK_RECONCILIATION_IGNORE');

    if (!companyId) throw new Error('companyId é obrigatório');

    const entry = await this.entryRepo.findByIdForCompany(statementEntryId, companyId);
    if (!entry || entry.companyId !== companyId) {
      throw new Error('Entrada de extrato não encontrada ou pertence a outra empresa');
    }

    const previousState = { ...entry };
    const now = new Date().toISOString();

    entry.status = StatementEntryStatus.IGNORED;
    entry.updatedAt = now;

    const updated = await this.entryRepo.updateForCompany(entry.id, companyId, entry);

    await AuditLogger.logAction(
      companyId,
      'BankStatementEntry',
      updated.id,
      AuditAction.RECONCILIATION_IGNORED,
      userId,
      userName,
      previousState,
      { ...updated, ignoreReason: reason }
    );

    return updated;
  }

  public static async suggestMatches(
    companyId: string,
    financialAccountId: string
  ): Promise<MatchSuggestion[]> {
    if (!companyId || !financialAccountId) return [];

    const entries = await this.entryRepo.findAllForCompany(companyId);
    const unmatchedEntries = entries.filter(
      (e) =>
        e.companyId === companyId &&
        e.financialAccountId === financialAccountId &&
        e.status === StatementEntryStatus.UNMATCHED
    );

    const matchedTxIds = new Set(
      entries
        .filter((e) => e.companyId === companyId && e.status === StatementEntryStatus.MATCHED && e.matchedTransactionId)
        .map((e) => e.matchedTransactionId!)
    );

    const allTxs = await this.txRepo.findAllForCompany(companyId);
    const eligibleTxs = allTxs.filter(
      (tx) =>
        tx.companyId === companyId &&
        !tx.isReversed &&
        !matchedTxIds.has(tx.id) &&
        (tx.financialAccountId === financialAccountId || tx.destinationAccountId === financialAccountId)
    );

    const suggestions: MatchSuggestion[] = [];

    for (const entry of unmatchedEntries) {
      const candidates: MatchSuggestion['candidates'] = [];

      for (const tx of eligibleTxs) {
        if (roundCurrency(entry.amount) !== roundCurrency(tx.amount)) continue;

        // Check direction
        let directionCompatible = false;
        if (entry.direction === StatementDirection.CREDIT) {
          directionCompatible =
            tx.type === TransactionType.INCOME ||
            tx.type === TransactionType.REVERSAL ||
            (tx.type === TransactionType.TRANSFER && tx.destinationAccountId === financialAccountId);
        } else {
          directionCompatible =
            tx.type === TransactionType.EXPENSE ||
            tx.type === TransactionType.REVERSAL ||
            (tx.type === TransactionType.TRANSFER && tx.financialAccountId === financialAccountId);
        }

        if (!directionCompatible) continue;

        // Date proximity
        const entryDate = new Date(entry.date).getTime();
        const txDate = new Date(tx.transactionDate.split('T')[0]).getTime();
        const diffDays = Math.abs(entryDate - txDate) / (1000 * 3600 * 24);

        if (diffDays === 0) {
          candidates.push({ transaction: tx, confidence: 'EXACT' });
        } else if (diffDays <= 3) {
          candidates.push({ transaction: tx, confidence: 'HIGH_CONFIDENCE' });
        } else if (diffDays <= 7) {
          candidates.push({ transaction: tx, confidence: 'POSSIBLE' });
        }
      }

      // Safe suggestion: only offer bestMatch if there is exactly 1 EXACT or 1 HIGH_CONFIDENCE candidate
      let bestMatch: FinancialTransaction | undefined = undefined;
      const exacts = candidates.filter((c) => c.confidence === 'EXACT');
      const highs = candidates.filter((c) => c.confidence === 'HIGH_CONFIDENCE');

      if (exacts.length === 1) {
        bestMatch = exacts[0].transaction;
      } else if (exacts.length === 0 && highs.length === 1) {
        bestMatch = highs[0].transaction;
      }

      suggestions.push({
        statementEntry: entry,
        candidates,
        bestMatch,
      });
    }

    return suggestions;
  }

  public static async getStatementEntries(
    companyId: string,
    financialAccountId?: string,
    status?: StatementEntryStatus
  ): Promise<BankStatementEntry[]> {
    if (!companyId) return [];
    const items = await this.entryRepo.findAllForCompany(companyId);
    return items.filter((e) => {
      if (e.companyId !== companyId) return false;
      if (financialAccountId && e.financialAccountId !== financialAccountId) return false;
      if (status && e.status !== status) return false;
      return true;
    });
  }
}
