import { sql } from 'drizzle-orm';

export type BankStatementDirection = 'CREDIT' | 'DEBIT';
export type BankStatementStatus = 'UNMATCHED' | 'SUGGESTED' | 'MATCHED' | 'IGNORED' | 'REVERSED';

export interface AuthoritativeBankStatementEntry {
  id: string;
  companyId: string;
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
  correlationId?: string;
  dedupKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBankStatementEntryInput {
  id: string;
  companyId: string;
  financialAccountId: string;
  externalId?: string;
  date: string;
  description: string;
  amount: number;
  direction: BankStatementDirection;
  documentNumber?: string;
  importSource: string;
  correlationId?: string;
  dedupKey: string;
  createdAt: string;
}

type BankStatementRow = {
  id: string;
  companyId: string;
  financialAccountId: string;
  externalId: string | null;
  date: string;
  description: string;
  amount: string | number;
  direction: BankStatementDirection | null;
  documentNumber: string | null;
  importSource: string | null;
  status: BankStatementStatus;
  matchedTransactionId: string | null;
  matchedAt: string | null;
  matchedBy: string | null;
  correlationId: string | null;
  dedupKey: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: BankStatementRow): AuthoritativeBankStatementEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    financialAccountId: row.financialAccountId,
    externalId: row.externalId || undefined,
    date: String(row.date).slice(0, 10),
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    documentNumber: row.documentNumber || undefined,
    importSource: row.importSource || 'LEGACY',
    status: row.status,
    matchedTransactionId: row.matchedTransactionId || undefined,
    matchedAt: row.matchedAt || undefined,
    matchedBy: row.matchedBy || undefined,
    correlationId: row.correlationId || undefined,
    dedupKey: row.dedupKey || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SELECT_COLUMNS = sql.raw(`
  id,
  company_id AS "companyId",
  account_id AS "financialAccountId",
  external_id AS "externalId",
  date::date::text AS "date",
  description,
  amount,
  direction,
  document_number AS "documentNumber",
  import_source AS "importSource",
  status,
  transaction_id AS "matchedTransactionId",
  matched_at::text AS "matchedAt",
  matched_by AS "matchedBy",
  correlation_id AS "correlationId",
  dedup_key AS "dedupKey",
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
`);

function rows(result: any): BankStatementRow[] {
  return Array.isArray(result?.rows) ? result.rows as BankStatementRow[] : [];
}

export class PostgresBankStatementRepository {
  constructor(private readonly tx: any) {}

  async findByIdForCompany(companyId: string, id: string, lock = false): Promise<AuthoritativeBankStatementEntry | null> {
    const result = lock
      ? await this.tx.execute(sql`
          SELECT ${SELECT_COLUMNS}
          FROM bank_statement_entries
          WHERE company_id=${companyId} AND id=${id}
          LIMIT 1
          FOR UPDATE
        `)
      : await this.tx.execute(sql`
          SELECT ${SELECT_COLUMNS}
          FROM bank_statement_entries
          WHERE company_id=${companyId} AND id=${id}
          LIMIT 1
        `);
    const row = rows(result)[0];
    return row ? mapRow(row) : null;
  }

  async findByDedupKey(
    companyId: string,
    financialAccountId: string,
    dedupKey: string,
  ): Promise<AuthoritativeBankStatementEntry | null> {
    const result = await this.tx.execute(sql`
      SELECT ${SELECT_COLUMNS}
      FROM bank_statement_entries
      WHERE company_id=${companyId}
        AND account_id=${financialAccountId}
        AND dedup_key=${dedupKey}
      LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? mapRow(row) : null;
  }

  async createOrGet(input: CreateBankStatementEntryInput): Promise<{
    item: AuthoritativeBankStatementEntry;
    inserted: boolean;
  }> {
    const result = await this.tx.execute(sql`
      INSERT INTO bank_statement_entries (
        id, company_id, account_id, external_id, date, description, amount, direction,
        document_number, import_source, status, correlation_id, dedup_key, created_at, updated_at
      ) VALUES (
        ${input.id}, ${input.companyId}, ${input.financialAccountId}, ${input.externalId || null},
        ${input.date}, ${input.description}, ${input.amount}, ${input.direction},
        ${input.documentNumber || null}, ${input.importSource}, 'UNMATCHED',
        ${input.correlationId || null}, ${input.dedupKey}, ${input.createdAt}, ${input.createdAt}
      )
      ON CONFLICT DO NOTHING
      RETURNING ${SELECT_COLUMNS}
    `);
    const insertedRow = rows(result)[0];
    if (insertedRow) return { item: mapRow(insertedRow), inserted: true };

    const existing = await this.findByDedupKey(input.companyId, input.financialAccountId, input.dedupKey);
    if (!existing) throw new Error('Conflito de idempotência na importação de extrato bancário');
    return { item: existing, inserted: false };
  }

  async findAllForCompany(
    companyId: string,
    financialAccountId?: string,
    status?: BankStatementStatus,
  ): Promise<AuthoritativeBankStatementEntry[]> {
    let result: any;
    if (financialAccountId && status) {
      result = await this.tx.execute(sql`
        SELECT ${SELECT_COLUMNS} FROM bank_statement_entries
        WHERE company_id=${companyId} AND account_id=${financialAccountId} AND status=${status}
        ORDER BY date DESC, id DESC
      `);
    } else if (financialAccountId) {
      result = await this.tx.execute(sql`
        SELECT ${SELECT_COLUMNS} FROM bank_statement_entries
        WHERE company_id=${companyId} AND account_id=${financialAccountId}
        ORDER BY date DESC, id DESC
      `);
    } else if (status) {
      result = await this.tx.execute(sql`
        SELECT ${SELECT_COLUMNS} FROM bank_statement_entries
        WHERE company_id=${companyId} AND status=${status}
        ORDER BY date DESC, id DESC
      `);
    } else {
      result = await this.tx.execute(sql`
        SELECT ${SELECT_COLUMNS} FROM bank_statement_entries
        WHERE company_id=${companyId}
        ORDER BY date DESC, id DESC
      `);
    }
    return rows(result).map(mapRow);
  }

  async findMatchedForTransactionScope(
    companyId: string,
    financialAccountId: string,
    transactionId: string,
    excludeEntryId?: string,
  ): Promise<AuthoritativeBankStatementEntry | null> {
    const result = excludeEntryId
      ? await this.tx.execute(sql`
          SELECT ${SELECT_COLUMNS} FROM bank_statement_entries
          WHERE company_id=${companyId} AND account_id=${financialAccountId}
            AND transaction_id=${transactionId} AND status='MATCHED' AND id<>${excludeEntryId}
          LIMIT 1
        `)
      : await this.tx.execute(sql`
          SELECT ${SELECT_COLUMNS} FROM bank_statement_entries
          WHERE company_id=${companyId} AND account_id=${financialAccountId}
            AND transaction_id=${transactionId} AND status='MATCHED'
          LIMIT 1
        `);
    const row = rows(result)[0];
    return row ? mapRow(row) : null;
  }

  async match(
    companyId: string,
    id: string,
    transactionId: string,
    matchedBy: string,
    correlationId: string,
    matchedAt: string,
  ): Promise<AuthoritativeBankStatementEntry> {
    const result = await this.tx.execute(sql`
      UPDATE bank_statement_entries
      SET status='MATCHED', transaction_id=${transactionId}, matched_at=${matchedAt},
          matched_by=${matchedBy}, correlation_id=${correlationId}, updated_at=${matchedAt}
      WHERE company_id=${companyId} AND id=${id}
      RETURNING ${SELECT_COLUMNS}
    `);
    const row = rows(result)[0];
    if (!row) throw new Error('Entrada de extrato bancário não encontrada');
    return mapRow(row);
  }

  async unmatch(
    companyId: string,
    id: string,
    correlationId: string,
    updatedAt: string,
  ): Promise<AuthoritativeBankStatementEntry> {
    const result = await this.tx.execute(sql`
      UPDATE bank_statement_entries
      SET status='UNMATCHED', transaction_id=NULL, matched_at=NULL, matched_by=NULL,
          correlation_id=${correlationId}, updated_at=${updatedAt}
      WHERE company_id=${companyId} AND id=${id}
      RETURNING ${SELECT_COLUMNS}
    `);
    const row = rows(result)[0];
    if (!row) throw new Error('Entrada de extrato bancário não encontrada');
    return mapRow(row);
  }

  async ignore(
    companyId: string,
    id: string,
    correlationId: string,
    updatedAt: string,
  ): Promise<AuthoritativeBankStatementEntry> {
    const result = await this.tx.execute(sql`
      UPDATE bank_statement_entries
      SET status='IGNORED', transaction_id=NULL, matched_at=NULL, matched_by=NULL,
          correlation_id=${correlationId}, updated_at=${updatedAt}
      WHERE company_id=${companyId} AND id=${id}
      RETURNING ${SELECT_COLUMNS}
    `);
    const row = rows(result)[0];
    if (!row) throw new Error('Entrada de extrato bancário não encontrada');
    return mapRow(row);
  }
}
