import { sql } from 'drizzle-orm';
import type { DocumentRecord, DocumentSubjectType } from '../../types/entities';
import type { ITransactionDocumentRepository, TransactionDocumentFilters } from '../../domain/finance/ITransactionContext';
import { evaluateDocumentCompliance } from '../../domain/documents/documentPolicy';

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

export class PostgresDocumentRepository implements ITransactionDocumentRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): DocumentRecord {
    const attachmentId = optionalText(row.attachment_id);
    const derived = evaluateDocumentCompliance(optionalText(row.expiration_date), Boolean(attachmentId));
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      subjectType: String(row.subject_type) as DocumentSubjectType,
      subjectId: String(row.subject_id),
      documentType: String(row.document_type),
      documentNumber: optionalText(row.document_number),
      referenceYear: row.reference_year === null || row.reference_year === undefined ? undefined : Number(row.reference_year),
      issueDate: optionalText(row.issue_date),
      expirationDate: optionalText(row.expiration_date),
      attachmentId,
      versionNumber: Number(row.version_number),
      supersedesDocumentId: optionalText(row.supersedes_document_id),
      isCurrent: Boolean(row.is_current),
      isArchived: Boolean(row.is_archived),
      cost: Number(row.cost || 0),
      payableId: optionalText(row.payable_id),
      notes: optionalText(row.notes),
      createdBy: String(row.created_by),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      ...derived,
    };
  }

  async findByIdForCompany(companyId: string, id: string): Promise<DocumentRecord | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM documents
      WHERE company_id = ${companyId} AND id = ${id}
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllByCompany(companyId: string, filters?: TransactionDocumentFilters): Promise<DocumentRecord[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM documents
      WHERE company_id = ${companyId}
      ORDER BY updated_at DESC, created_at DESC, id DESC
    `);
    let items = rowsOf(result).map((row) => this.map(row));
    if (filters?.subjectType) items = items.filter((item) => item.subjectType === filters.subjectType);
    if (filters?.subjectId) items = items.filter((item) => item.subjectId === filters.subjectId);
    if (filters?.documentType) items = items.filter((item) => item.documentType === filters.documentType);
    if (filters?.referenceYear !== undefined) items = items.filter((item) => item.referenceYear === filters.referenceYear);
    if (filters?.currentOnly !== false) items = items.filter((item) => item.isCurrent);
    if (!filters?.includeArchived) items = items.filter((item) => !item.isArchived);
    return items;
  }

  async findVersions(
    companyId: string,
    subjectType: DocumentSubjectType,
    subjectId: string,
    documentType: string,
    referenceYear?: number
  ): Promise<DocumentRecord[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM documents
      WHERE company_id = ${companyId}
        AND subject_type = ${subjectType}
        AND subject_id = ${subjectId}
        AND document_type = ${documentType}
        AND COALESCE(reference_year, 0) = ${referenceYear ?? 0}
      ORDER BY version_number DESC, created_at DESC
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async findCurrentWithLock(
    companyId: string,
    subjectType: DocumentSubjectType,
    subjectId: string,
    documentType: string,
    referenceYear?: number
  ): Promise<DocumentRecord | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM documents
      WHERE company_id = ${companyId}
        AND subject_type = ${subjectType}
        AND subject_id = ${subjectId}
        AND document_type = ${documentType}
        AND COALESCE(reference_year, 0) = ${referenceYear ?? 0}
        AND is_current = true
        AND is_archived = false
      LIMIT 1
      FOR UPDATE
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async create(item: DocumentRecord): Promise<DocumentRecord> {
    await this.tx.execute(sql`
      INSERT INTO documents (
        id, company_id, subject_type, subject_id, document_type, document_number,
        reference_year, issue_date, expiration_date, attachment_id, version_number,
        supersedes_document_id, is_current, is_archived, cost, payable_id, notes,
        created_by, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.subjectType}, ${item.subjectId}, ${item.documentType},
        ${item.documentNumber || null}, ${item.referenceYear ?? null}, ${item.issueDate || null},
        ${item.expirationDate || null}, ${item.attachmentId || null}, ${item.versionNumber},
        ${item.supersedesDocumentId || null}, ${item.isCurrent}, ${item.isArchived}, ${item.cost},
        ${item.payableId || null}, ${item.notes || null}, ${item.createdBy}, ${item.createdAt}, ${item.updatedAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('Document create failed');
    return created;
  }

  async updateForCompany(
    companyId: string,
    id: string,
    item: Partial<Pick<DocumentRecord, 'isCurrent' | 'isArchived' | 'payableId' | 'updatedAt'>>
  ): Promise<DocumentRecord | null> {
    const result = await this.tx.execute(sql`
      UPDATE documents SET
        is_current = COALESCE(${item.isCurrent ?? null}, is_current),
        is_archived = COALESCE(${item.isArchived ?? null}, is_archived),
        payable_id = CASE WHEN ${item.payableId === undefined} THEN payable_id ELSE ${item.payableId ?? null} END,
        updated_at = COALESCE(${item.updatedAt || null}, updated_at)
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }
}
