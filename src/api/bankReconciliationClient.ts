export type BankStatementDirection = 'CREDIT' | 'DEBIT';
export type BankStatementStatus = 'UNMATCHED' | 'SUGGESTED' | 'MATCHED' | 'IGNORED' | 'REVERSED';

export interface BankStatementEntry {
  id: string;
  financialAccountId: string;
  externalId?: string;
  date: string;
  description: string;
  amount: number;
  direction: BankStatementDirection | null;
  documentNumber?: string;
  importSource: string;
  status: BankStatementStatus;
  matchedTransactionId?: string;
  matchedAt?: string;
  matchedBy?: string;
}

export interface BankReconciliationTransaction {
  id: string;
  financialAccountId: string;
  destinationAccountId?: string;
  type: string;
  amount: number;
  transactionDate: string;
  description: string;
  isReversed: boolean;
}

export interface ReconciliationCandidate {
  transaction: BankReconciliationTransaction;
  confidence: 'EXACT' | 'HIGH_CONFIDENCE' | 'POSSIBLE';
}

export interface ReconciliationSuggestion {
  statementEntry: BankStatementEntry;
  candidates: ReconciliationCandidate[];
  bestMatch?: BankReconciliationTransaction;
}

export interface ImportBankStatementEntry {
  externalId?: string;
  date: string;
  description: string;
  amount: number;
  direction: BankStatementDirection;
  documentNumber?: string;
  importSource?: string;
}

export class BankReconciliationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'BankReconciliationApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bank reconciliation response');
  return value as JsonRecord;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid bank reconciliation field: ${field}`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function number(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid bank reconciliation numeric field: ${field}`);
  return parsed;
}

function normalizeEntry(value: unknown): BankStatementEntry {
  const item = record(value);
  const status = text(item.status, 'status') as BankStatementStatus;
  if (!['UNMATCHED', 'SUGGESTED', 'MATCHED', 'IGNORED', 'REVERSED'].includes(status)) throw new Error('Invalid bank statement status');
  const direction = item.direction === null ? null : text(item.direction, 'direction') as BankStatementDirection;
  if (direction !== null && direction !== 'CREDIT' && direction !== 'DEBIT') throw new Error('Invalid bank statement direction');
  return {
    id: text(item.id, 'id'),
    financialAccountId: text(item.financialAccountId, 'financialAccountId'),
    externalId: optionalText(item.externalId),
    date: text(item.date, 'date').slice(0, 10),
    description: text(item.description, 'description'),
    amount: number(item.amount, 'amount'),
    direction,
    documentNumber: optionalText(item.documentNumber),
    importSource: text(item.importSource, 'importSource'),
    status,
    matchedTransactionId: optionalText(item.matchedTransactionId),
    matchedAt: optionalText(item.matchedAt),
    matchedBy: optionalText(item.matchedBy),
  };
}

function normalizeTransaction(value: unknown): BankReconciliationTransaction {
  const item = record(value);
  if (typeof item.isReversed !== 'boolean') throw new Error('Invalid reconciliation transaction');
  return {
    id: text(item.id, 'transaction.id'),
    financialAccountId: text(item.financialAccountId, 'transaction.financialAccountId'),
    destinationAccountId: optionalText(item.destinationAccountId),
    type: text(item.type, 'transaction.type'),
    amount: number(item.amount, 'transaction.amount'),
    transactionDate: text(item.transactionDate, 'transaction.transactionDate').slice(0, 10),
    description: text(item.description, 'transaction.description'),
    isReversed: item.isReversed,
  };
}

function normalizeSuggestion(value: unknown): ReconciliationSuggestion {
  const item = record(value);
  if (!Array.isArray(item.candidates)) throw new Error('Invalid reconciliation candidates');
  return {
    statementEntry: normalizeEntry(item.statementEntry),
    candidates: item.candidates.map((raw) => {
      const candidate = record(raw);
      const confidence = text(candidate.confidence, 'confidence') as ReconciliationCandidate['confidence'];
      if (!['EXACT', 'HIGH_CONFIDENCE', 'POSSIBLE'].includes(confidence)) throw new Error('Invalid reconciliation confidence');
      return { transaction: normalizeTransaction(candidate.transaction), confidence };
    }),
    bestMatch: item.bestMatch ? normalizeTransaction(item.bestMatch) : undefined,
  };
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Bank reconciliation request failed (${response.status})`;
    try {
      const payload = record(await response.json());
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
    } catch {
      // Fail closed; never fall back to browser persistence.
    }
    throw new BankReconciliationApiError(response.status, message);
  }
  return await response.json();
}

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export class BankReconciliationClient {
  static async listEntries(financialAccountId?: string, status?: BankStatementStatus): Promise<BankStatementEntry[]> {
    const params = new URLSearchParams();
    if (financialAccountId) params.set('financialAccountId', financialAccountId);
    if (status) params.set('status', status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = record(await requestJson(`/api/finance/bank-reconciliation/entries${suffix}`));
    if (!Array.isArray(payload.items)) throw new Error('Invalid bank statement entry list');
    return payload.items.map(normalizeEntry);
  }

  static async suggestions(financialAccountId: string): Promise<ReconciliationSuggestion[]> {
    const id = financialAccountId.trim();
    if (!id) throw new Error('Invalid financial account id');
    const payload = record(await requestJson(`/api/finance/bank-reconciliation/suggestions?financialAccountId=${encodeURIComponent(id)}`));
    if (!Array.isArray(payload.items)) throw new Error('Invalid reconciliation suggestion list');
    return payload.items.map(normalizeSuggestion);
  }

  static async importEntries(financialAccountId: string, entries: ImportBankStatementEntry[]): Promise<{ imported: BankStatementEntry[]; skippedDuplicates: number }> {
    const id = financialAccountId.trim();
    if (!id || !Array.isArray(entries) || entries.length === 0) throw new Error('Invalid bank statement import');
    const payload = record(await requestJson('/api/finance/bank-reconciliation/import', post({ financialAccountId: id, entries })));
    if (!Array.isArray(payload.imported)) throw new Error('Invalid bank statement import response');
    return { imported: payload.imported.map(normalizeEntry), skippedDuplicates: number(payload.skippedDuplicates, 'skippedDuplicates') };
  }

  static async match(entryId: string, transactionId: string): Promise<BankStatementEntry> {
    const payload = record(await requestJson(`/api/finance/bank-reconciliation/entries/${encodeURIComponent(entryId)}/match`, post({ transactionId })));
    return normalizeEntry(payload.item);
  }

  static async unmatch(entryId: string, reason?: string): Promise<BankStatementEntry> {
    const payload = record(await requestJson(`/api/finance/bank-reconciliation/entries/${encodeURIComponent(entryId)}/unmatch`, post(reason ? { reason } : {})));
    return normalizeEntry(payload.item);
  }

  static async ignore(entryId: string, reason?: string): Promise<BankStatementEntry> {
    const payload = record(await requestJson(`/api/finance/bank-reconciliation/entries/${encodeURIComponent(entryId)}/ignore`, post(reason ? { reason } : {})));
    return normalizeEntry(payload.item);
  }
}
