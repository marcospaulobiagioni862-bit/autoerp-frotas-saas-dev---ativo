import { sql } from 'drizzle-orm';
import type { ContractTemplate } from '../../types/entities';
import type { ITransactionContractTemplateRepository } from '../../domain/finance/ITransactionContext';

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export class PostgresContractTemplateRepository implements ITransactionContractTemplateRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): ContractTemplate {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      templateKey: String(row.template_key),
      title: String(row.title),
      contentMarkdown: String(row.content_markdown),
      versionNumber: Number(row.version_number),
      supersedesTemplateId: row.supersedes_template_id || undefined,
      isCurrent: Boolean(row.is_current),
      isActive: Boolean(row.is_active),
      isArchived: Boolean(row.is_archived),
      createdBy: String(row.created_by),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  async findByIdForCompany(companyId: string, id: string): Promise<ContractTemplate | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contract_templates WHERE company_id = ${companyId} AND id = ${id} LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<ContractTemplate | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contract_templates WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllByCompany(companyId: string, includeArchived = false): Promise<ContractTemplate[]> {
    const result = includeArchived
      ? await this.tx.execute(sql`SELECT * FROM contract_templates WHERE company_id = ${companyId} ORDER BY template_key, version_number DESC`)
      : await this.tx.execute(sql`SELECT * FROM contract_templates WHERE company_id = ${companyId} AND is_archived = false ORDER BY title, version_number DESC`);
    return rowsOf(result).map((row) => this.map(row));
  }

  async findVersions(companyId: string, templateKey: string): Promise<ContractTemplate[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contract_templates
      WHERE company_id = ${companyId} AND template_key = ${templateKey}
      ORDER BY version_number DESC, created_at DESC
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async findCurrentWithLock(companyId: string, templateKey: string): Promise<ContractTemplate | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contract_templates
      WHERE company_id = ${companyId} AND template_key = ${templateKey}
        AND is_current = true AND is_archived = false
      FOR UPDATE
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async create(item: ContractTemplate): Promise<ContractTemplate> {
    await this.tx.execute(sql`
      INSERT INTO contract_templates (
        id, company_id, template_key, title, content_markdown, version_number,
        supersedes_template_id, is_current, is_active, is_archived,
        created_by, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.templateKey}, ${item.title}, ${item.contentMarkdown}, ${item.versionNumber},
        ${item.supersedesTemplateId || null}, ${item.isCurrent}, ${item.isActive}, ${item.isArchived},
        ${item.createdBy}, ${item.createdAt}, ${item.updatedAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('ContractTemplate create failed');
    return created;
  }

  async updateForCompany(
    companyId: string,
    id: string,
    changes: Partial<Pick<ContractTemplate, 'isCurrent' | 'isActive' | 'isArchived' | 'updatedAt'>>
  ): Promise<ContractTemplate | null> {
    const existing = await this.findByIdForCompany(companyId, id);
    if (!existing) return null;
    const next = { ...existing, ...changes };
    const result = await this.tx.execute(sql`
      UPDATE contract_templates SET
        is_current = ${next.isCurrent},
        is_active = ${next.isActive},
        is_archived = ${next.isArchived},
        updated_at = ${next.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }
}
