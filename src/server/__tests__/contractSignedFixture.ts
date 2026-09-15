import { sql } from 'drizzle-orm';
import { db } from '../../db';

/** Historical lifecycle fixtures now need actual canonical evidence, not a legacy bypass. */
export async function seedContractSignedFixture(contractId: string): Promise<void> {
  await db.execute(sql`INSERT INTO contract_artifacts
    (id,company_id,contract_id,artifact_type,attachment_id,template_id,snapshot_json,snapshot_hash,created_by,created_at)
    SELECT id || '-fixture-pdf', company_id,id,'GENERATED_PDF',id || '-fixture-file','fixture-template','{}',repeat('a',64),'fixture',start_date::timestamp - interval '1 day'
    FROM contracts WHERE id=${contractId} ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO contract_artifacts
    (id,company_id,contract_id,artifact_type,attachment_id,source_artifact_id,snapshot_hash,signature_method,signed_by_name,signed_at,created_by,created_at)
    SELECT id || '-fixture-signed',company_id,id,'SIGNED_EVIDENCE',id || '-fixture-file',id || '-fixture-pdf',repeat('a',64),'MANUAL_CONFIRMATION','Fixture',start_date::timestamp,'fixture',start_date::timestamp
    FROM contracts WHERE id=${contractId} ON CONFLICT DO NOTHING`);
}
