import { sql } from 'drizzle-orm';
import type { ContractArtifact, ContractArtifactType } from '../../types/entities';
import type { ITransactionContractArtifactRepository } from '../../domain/finance/ITransactionContext';

function rowsOf(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export class PostgresContractArtifactRepository implements ITransactionContractArtifactRepository {
  constructor(private readonly tx: any) {}

  private map(row: any): ContractArtifact {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      contractId: String(row.contract_id),
      artifactType: String(row.artifact_type) as ContractArtifactType,
      attachmentId: String(row.attachment_id),
      templateId: row.template_id || undefined,
      sourceArtifactId: row.source_artifact_id || undefined,
      snapshotJson: row.snapshot_json || undefined,
      snapshotHash: String(row.snapshot_hash),
      isCurrent: Boolean(row.is_current),
      isArchived: Boolean(row.is_archived),
      signatureMethod: row.signature_method || undefined,
      signedByName: row.signed_by_name || undefined,
      signedAt: row.signed_at instanceof Date ? row.signed_at.toISOString() : (row.signed_at ? String(row.signed_at) : undefined),
      createdBy: String(row.created_by),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  async findByIdForCompany(companyId: string, id: string): Promise<ContractArtifact | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contract_artifacts WHERE company_id = ${companyId} AND id = ${id} LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findCurrentForContract(
    companyId: string,
    contractId: string,
    artifactType: ContractArtifactType,
    lock = false
  ): Promise<ContractArtifact | null> {
    const result = lock
      ? await this.tx.execute(sql`
          SELECT * FROM contract_artifacts
          WHERE company_id = ${companyId} AND contract_id = ${contractId}
            AND artifact_type = ${artifactType} AND is_current = true AND is_archived = false
          FOR UPDATE
        `)
      : await this.tx.execute(sql`
          SELECT * FROM contract_artifacts
          WHERE company_id = ${companyId} AND contract_id = ${contractId}
            AND artifact_type = ${artifactType} AND is_current = true AND is_archived = false
          LIMIT 1
        `);
    const row = rowsOf(result)[0];
    return row ? this.map(row) : null;
  }

  async findAllForContract(companyId: string, contractId: string): Promise<ContractArtifact[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM contract_artifacts
      WHERE company_id = ${companyId} AND contract_id = ${contractId}
      ORDER BY created_at DESC, id DESC
    `);
    return rowsOf(result).map((row) => this.map(row));
  }

  async create(item: ContractArtifact): Promise<ContractArtifact> {
    await this.tx.execute(sql`
      INSERT INTO contract_artifacts (
        id, company_id, contract_id, artifact_type, attachment_id, template_id,
        source_artifact_id, snapshot_json, snapshot_hash, is_current, is_archived,
        signature_method, signed_by_name, signed_at, created_by, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.contractId}, ${item.artifactType}, ${item.attachmentId}, ${item.templateId || null},
        ${item.sourceArtifactId || null}, ${item.snapshotJson || null}, ${item.snapshotHash}, ${item.isCurrent}, ${item.isArchived},
        ${item.signatureMethod || null}, ${item.signedByName || null}, ${item.signedAt || null},
        ${item.createdBy}, ${item.createdAt}, ${item.updatedAt}
      )
    `);
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('ContractArtifact create failed');
    return created;
  }

  async updateForCompany(
    companyId: string,
    id: string,
    changes: Partial<Pick<ContractArtifact, 'isCurrent' | 'isArchived' | 'updatedAt'>>
  ): Promise<ContractArtifact | null> {
    const existing = await this.findByIdForCompany(companyId, id);
    if (!existing) return null;
    const next = { ...existing, ...changes };
    const result = await this.tx.execute(sql`
      UPDATE contract_artifacts SET
        is_current = ${next.isCurrent},
        is_archived = ${next.isArchived},
        updated_at = ${next.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING id
    `);
    if (!rowsOf(result)[0]) return null;
    return await this.findByIdForCompany(companyId, id);
  }
}
