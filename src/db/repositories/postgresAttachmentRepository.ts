import { sql } from 'drizzle-orm';
import type { FileAttachment } from '../../types/entities';
import type { ITransactionAttachmentRepository } from '../../domain/finance/ITransactionContext';

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

export class PostgresAttachmentRepository implements ITransactionAttachmentRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): FileAttachment {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      entityName: String(row.entity_name || row.entity_type || ''),
      entityType: String(row.entity_type || row.entity_name || ''),
      entityId: String(row.entity_id),
      documentType: text(row.document_type),
      fileName: String(row.file_name),
      fileSize: Number(row.file_size ?? row.size ?? 0),
      mimeType: String(row.mime_type),
      uploadedBy: text(row.created_by) || 'legacy',
      storageProvider: String(row.storage_provider || 'LEGACY_BROWSER') as FileAttachment['storageProvider'],
      storageKey: text(row.storage_key),
      checksum: text(row.checksum),
      createdBy: text(row.created_by),
      isArchived: Boolean(row.is_archived),
      contentState: String(row.content_state || 'LEGACY_BROWSER') as FileAttachment['contentState'],
      description: text(row.description),
      issueDate: text(row.issue_date),
      expirationDate: text(row.expiration_date),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }

  async findByIdForCompany(companyId: string, id: string): Promise<FileAttachment | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM file_attachments
      WHERE company_id = ${companyId} AND id = ${id}
      LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllByCompany(companyId: string): Promise<FileAttachment[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM file_attachments
      WHERE company_id = ${companyId}
      ORDER BY created_at DESC, id DESC
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async findByEntity(companyId: string, entityType: string, entityId: string): Promise<FileAttachment[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM file_attachments
      WHERE company_id = ${companyId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
      ORDER BY created_at DESC, id DESC
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async create(item: FileAttachment): Promise<FileAttachment> {
    await this.tx.execute(sql`
      INSERT INTO file_attachments (
        id, company_id, entity_type, entity_name, entity_id, document_type,
        file_name, mime_type, url, size, file_size, storage_provider, storage_key,
        checksum, description, issue_date, expiration_date, created_by,
        is_archived, content_state, created_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.entityType}, ${item.entityName}, ${item.entityId},
        ${item.documentType || null}, ${item.fileName}, ${item.mimeType}, ${`attachment://${item.id}`},
        ${item.fileSize}, ${item.fileSize}, ${item.storageProvider}, ${item.storageKey || null},
        ${item.checksum || null}, ${item.description || null}, ${item.issueDate || null},
        ${item.expirationDate || null}, ${item.createdBy || null}, ${item.isArchived},
        ${item.contentState}, ${item.createdAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('Attachment metadata create failed');
    return created;
  }

  async updateForCompany(
    companyId: string,
    id: string,
    item: Partial<Pick<FileAttachment, 'isArchived' | 'contentState'>>
  ): Promise<FileAttachment | null> {
    if (item.isArchived === undefined && item.contentState === undefined) {
      return await this.findByIdForCompany(companyId, id);
    }
    const result = await this.tx.execute(sql`
      UPDATE file_attachments SET
        is_archived = COALESCE(${item.isArchived ?? null}, is_archived),
        content_state = COALESCE(${item.contentState ?? null}, content_state)
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }
}
