import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { registerAttachmentRoutes } from '../attachmentRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { PostgresAuditLogRepository } from '../../db/repositories/postgresRepositories';

const companyA = 'security-2i4a-company-a';
const companyB = 'security-2i4a-company-b';
const adminAId = 'security-2i4a-admin-a';
const adminBId = 'security-2i4a-admin-b';
const readonlyAId = 'security-2i4a-readonly-a';
const operationalAId = 'security-2i4a-operational-a';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function scalar(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function fileCount(root: string, companyId: string): Promise<number> {
  try {
    const entries = await readdir(path.join(root, companyId), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.bin')).length;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

export class AttachmentAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    const storageRoot = await mkdtemp(path.join(tmpdir(), 'autoerp-i4a-'));
    const previousStorage = process.env.ATTACHMENT_STORAGE_DIR;
    const previousDurable = process.env.ATTACHMENT_STORAGE_DURABLE;
    process.env.ATTACHMENT_STORAGE_DIR = storageRoot;
    delete process.env.ATTACHMENT_STORAGE_DURABLE;

    await db.execute(sql`
      INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
        (${companyA}, 'I4A Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'I4A Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
        (${adminAId}, ${companyA}, 'I4A Admin A', 'i4a-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
        (${adminBId}, ${companyB}, 'I4A Admin B', 'i4a-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
        (${readonlyAId}, ${companyA}, 'I4A Readonly A', 'i4a-readonly-a@example.test', 'READONLY', true, NOW(), NOW()),
        (${operationalAId}, ${companyA}, 'I4A Operational A', 'i4a-operational-a@example.test', 'OPERATIONAL', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
        ('i4a-veh-a1', ${companyA}, 'I4A1A01', 'I4ARENAVAM-A1', 'AVAILABLE', NOW(), NOW()),
        ('i4a-veh-b1', ${companyB}, 'I4B1B01', 'I4ARENAVAM-B1', 'AVAILABLE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO drivers (id, company_id, name, cpf, cnh, active, status, app_platforms, is_archived, created_at, updated_at) VALUES
        ('i4a-drv-a1', ${companyA}, 'Driver I4A A1', '52998224725', '12345678900', true, 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
        ('i4a-drv-b1', ${companyB}, 'Driver I4A B1', '11144477735', '02650306461', true, 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO contracts (
        id, company_id, driver_id, vehicle_id, status, contract_number, start_date,
        rental_amount, billing_periodicity, billing_due_day_of_week, billing_due_day_of_month,
        security_deposit_amount, franchise_km, excess_km_rate, is_archived, created_at, updated_at
      ) VALUES
        ('i4a-contract-a1', ${companyA}, 'i4a-drv-a1', 'i4a-veh-a1', 'DRAFT', 'I4A-CNT-A1', '2026-08-19', 0, 'WEEKLY', 1, 1, 0, 0, 0, false, NOW(), NOW()),
        ('i4a-contract-b1', ${companyB}, 'i4a-drv-b1', 'i4a-veh-b1', 'DRAFT', 'I4A-CNT-B1', '2026-08-19', 0, 'WEEKLY', 1, 1, 0, 0, 0, false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO work_orders (
        id, company_id, number, vehicle_id, status, opened_at, cancelled_at, entry_km,
        description, subtotal_parts, subtotal_services, subtotal_labor, discount, total,
        created_by, created_at, updated_at
      ) VALUES
        ('i4a-wo-cancelled-a1', ${companyA}, 'I4A-WO-CANCELLED-A1', 'i4a-veh-a1', 'CANCELLED',
         NOW(), NOW(), 1000, 'Cancelled work order A', 0, 0, 0, 0, 0, ${adminAId}, NOW(), NOW()),
        ('i4a-wo-cancelled-b1', ${companyB}, 'I4A-WO-CANCELLED-B1', 'i4a-veh-b1', 'CANCELLED',
         NOW(), NOW(), 1000, 'Cancelled work order B', 0, 0, 0, 0, 0, ${adminBId}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO file_attachments (
        id, company_id, entity_type, entity_name, entity_id, file_name, mime_type, url,
        size, file_size, storage_provider, is_archived, content_state, created_at
      ) VALUES (
        'i4a-legacy-a1', ${companyA}, 'Vehicle', 'Vehicle', 'i4a-veh-a1', 'legacy.pdf', 'application/pdf',
        'legacy://browser', 4, 4, 'LEGACY_BROWSER', false, 'LEGACY_BROWSER', NOW()
      ) ON CONFLICT (id) DO NOTHING
    `);

    const app = express();
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
      const role = typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : '';
      const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
      if (companyId && role && userId) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId,
          userId,
          name: `${role} Attachment Integration`,
          role,
          permissions: [],
        };
      }
      next();
    });
    registerAttachmentRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object', 'integration server unavailable');
    const base = `http://127.0.0.1:${address.port}`;

    const request = async (
      route: string,
      options: RequestInit = {},
      principal?: { companyId: string; role: string; userId: string }
    ): Promise<globalThis.Response> => {
      const headers = new Headers(options.headers);
      if (principal) {
        headers.set('x-test-company', principal.companyId);
        headers.set('x-test-role', principal.role);
        headers.set('x-test-user', principal.userId);
      }
      return await fetch(`${base}${route}`, { ...options, headers });
    };

    const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
    const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
    const readonlyA = { companyId: companyA, role: 'READONLY', userId: readonlyAId };
    const operationalA = { companyId: companyA, role: 'OPERATIONAL', userId: operationalAId };

    const upload = async (
      principal: typeof adminA,
      input: { entityType?: string; entityId?: string; documentType?: string; fileName?: string; mimeType?: string; bytes?: Uint8Array; extraHeaders?: Record<string, string> } = {}
    ) => {
      const headers = new Headers(input.extraHeaders || {});
      headers.set('content-type', input.mimeType || 'application/pdf');
      headers.set('x-autoerp-entity-type', encodeURIComponent(input.entityType || 'Vehicle'));
      headers.set('x-autoerp-entity-id', encodeURIComponent(input.entityId || 'i4a-veh-a1'));
      headers.set('x-autoerp-document-type', encodeURIComponent(input.documentType || 'CRLV'));
      headers.set('x-autoerp-file-name', encodeURIComponent(input.fileName || 'crlv.pdf'));
      return await request('/api/attachments', {
        method: 'POST', headers, body: (input.bytes || new Uint8Array([37, 80, 68, 70])) as any,
      }, principal);
    };

    try {
      let response = await request('/api/attachments');
      assert(response.status === 401, `no-session list expected 401, got ${response.status}`);

      response = await request('/api/attachments', {}, readonlyA);
      assert(response.status === 200, `READONLY list expected 200, got ${response.status}`);

      response = await request('/api/attachments/storage/status', {}, adminA);
      assert(response.status === 200, `storage status expected 200, got ${response.status}`);
      const localStorageStatus = (await json(response)).storage;
      assert(localStorageStatus.configured === true, 'configured storage was not reported');
      assert(localStorageStatus.ephemeralPath === true && localStorageStatus.durable === false, 'temporary test storage was incorrectly reported as durable');
      assert(!('path' in localStorageStatus), 'storage status leaked the server filesystem path');

      response = await upload(readonlyA as typeof adminA);
      assert(response.status === 403, `READONLY upload expected 403, got ${response.status}`);

      response = await upload(adminA, {
        extraHeaders: {
          'x-company-id': companyB,
          'x-user-id': adminBId,
          'x-autoerp-storage-key': 'forged/key',
          'x-autoerp-checksum': 'forged-checksum',
          'x-autoerp-file-size': '999999',
          'x-autoerp-storage-provider': 'CLOUD',
        },
      });
      assert(response.status === 201, `ADMIN upload expected 201, got ${response.status}`);
      const created = (await json(response)).item;
      assert(created.companyId === companyA, 'forged company became authoritative');
      assert(created.createdBy === adminAId, 'forged user became authoritative');
      assert(created.storageProvider === 'SERVER_FS' && created.contentState === 'AVAILABLE', 'server storage authority mismatch');
      assert(created.storageKey.startsWith(`${companyA}/`) && created.storageKey !== 'forged/key', 'forged storage key became authoritative');
      assert(created.fileSize === 4 && /^[a-f0-9]{64}$/.test(created.checksum), 'size/checksum authority mismatch');
      assert(await fileCount(storageRoot, companyA) === 1, 'server file was not materialized');

      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/content`, {}, adminA);
      assert(response.status === 200, `content expected 200, got ${response.status}`);
      const downloaded = new Uint8Array(await response.arrayBuffer());
      assert(downloaded.length === 4 && downloaded[0] === 37 && downloaded[1] === 80, 'download bytes mismatch');
      assert(response.headers.get('content-length') === '4', 'download content-length mismatch');

      response = await request(`/api/attachments/${encodeURIComponent(created.id)}`, {}, adminB);
      assert(response.status === 404, `cross-tenant metadata expected 404, got ${response.status}`);
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/content`, {}, adminB);
      assert(response.status === 404, `cross-tenant content expected 404, got ${response.status}`);

      response = await upload(adminA, { entityId: 'i4a-veh-b1' });
      assert(response.status === 404, `cross-tenant entity upload expected 404, got ${response.status}`);

      response = await upload(adminA, {
        entityType: 'MaintenanceWorkOrder',
        entityId: 'i4a-wo-cancelled-a1',
        documentType: 'MAINTENANCE_DOCUMENT',
        fileName: 'cancelled-work-order.pdf',
      });
      assert(response.status === 201, `cancelled work order upload expected 201, got ${response.status}`);
      const cancelledWorkOrderAttachment = (await json(response)).item;

      response = await request(
        '/api/attachments?entityType=MaintenanceWorkOrder&entityId=i4a-wo-cancelled-a1',
        {},
        adminA
      );
      assert(response.status === 200, `cancelled work order list expected 200, got ${response.status}`);
      const cancelledItems = (await json(response)).items;
      assert(
        cancelledItems.some((item: any) => item.id === cancelledWorkOrderAttachment.id),
        'cancelled work order list omitted its persisted attachment'
      );

      response = await request(
        `/api/attachments/${encodeURIComponent(cancelledWorkOrderAttachment.id)}/content`,
        {},
        adminA
      );
      assert(response.status === 200, `cancelled work order content expected 200, got ${response.status}`);

      response = await request(
        '/api/attachments?entityType=MaintenanceWorkOrder&entityId=i4a-wo-cancelled-a1',
        {},
        adminB
      );
      assert(response.status === 404, `cross-tenant cancelled work order list expected 404, got ${response.status}`);
      response = await request(
        `/api/attachments/${encodeURIComponent(cancelledWorkOrderAttachment.id)}/content`,
        {},
        adminB
      );
      assert(response.status === 404, `cross-tenant cancelled work order content expected 404, got ${response.status}`);

      response = await upload(adminA, { mimeType: 'text/plain', fileName: 'notes.txt' });
      assert(response.status === 400, `invalid MIME expected 400, got ${response.status}`);

      response = await upload(adminA, { mimeType: 'application/pdf', fileName: 'forged.pdf', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) });
      assert(response.status === 400, `forged PDF signature expected 400, got ${response.status}`);

      response = await upload(adminA, {
        entityType: 'Contract',
        entityId: 'i4a-contract-a1',
        documentType: 'SIGNED_CONTRACT',
        mimeType: 'application/pdf',
        fileName: 'contrato-assinado-separado.pdf',
        bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x0a, 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
      });
      assert(response.status === 201, `split signed PDF with leading bytes expected 201, got ${response.status}`);
      const relatedContractAttachment = (await json(response)).item;

      response = await request('/api/attachments/gallery?entityType=Vehicle&entityId=i4a-veh-a1', {}, readonlyA);
      assert(response.status === 200, `vehicle gallery READONLY expected 200, got ${response.status}`);
      const vehicleGallery = (await json(response)).items;
      assert(vehicleGallery.some((item:any)=>item.id===created.id), 'vehicle gallery omitted direct vehicle attachment');
      assert(vehicleGallery.some((item:any)=>item.id===relatedContractAttachment.id), 'vehicle gallery omitted related contract attachment');
      assert(vehicleGallery.some((item:any)=>item.id===cancelledWorkOrderAttachment.id), 'vehicle gallery omitted related maintenance work-order attachment');
      assert(new Set(vehicleGallery.map((item:any)=>item.id)).size===vehicleGallery.length, 'vehicle gallery duplicated attachment metadata');

      response = await request('/api/attachments/gallery?entityType=Driver&entityId=i4a-drv-a1', {}, readonlyA);
      assert(response.status === 200, `driver gallery READONLY expected 200, got ${response.status}`);
      const driverGallery = (await json(response)).items;
      assert(driverGallery.some((item:any)=>item.id===relatedContractAttachment.id), 'driver gallery omitted related contract attachment');
      assert(!driverGallery.some((item:any)=>item.id===created.id), 'driver gallery leaked unrelated vehicle attachment');

      response = await request('/api/attachments/gallery?entityType=Vehicle&entityId=i4a-veh-a1', {}, adminB);
      assert(response.status === 404, `cross-tenant vehicle gallery expected 404, got ${response.status}`);
      response = await request('/api/attachments/gallery?entityType=Driver&entityId=i4a-drv-a1', {}, adminB);
      assert(response.status === 404, `cross-tenant driver gallery expected 404, got ${response.status}`);
      response = await request('/api/attachments/gallery?entityType=Contract&entityId=i4a-contract-a1', {}, adminA);
      assert(response.status === 400, `unsupported gallery entity expected 400, got ${response.status}`);

      response = await upload(adminA, { mimeType: 'image/png', fileName: 'forged.png', bytes: new Uint8Array([37, 80, 68, 70]) });
      assert(response.status === 400, `mismatched PNG signature expected 400, got ${response.status}`);

      response = await upload(adminA, { fileName: '../evil.pdf' });
      assert(response.status === 400, `path traversal filename expected 400, got ${response.status}`);

      response = await upload(adminA, { entityType: 'UnknownEntity' });
      assert(response.status === 400, `invalid entity type expected 400, got ${response.status}`);

      const oversize = new Uint8Array(10 * 1024 * 1024 + 1);
      response = await upload(adminA, { bytes: oversize });
      assert(response.status === 413, `oversize expected 413, got ${response.status}`);

      response = await request('/api/attachments?entityType=HealthAndEmergency&entityId=i4a-drv-a1', {}, operationalA);
      assert(response.status === 403, `health read without health permission expected 403, got ${response.status}`);
      response = await upload(operationalA as typeof adminA, { entityType: 'HealthAndEmergency', entityId: 'i4a-drv-a1' });
      assert(response.status === 403, `health write without health permission expected 403, got ${response.status}`);

      response = await request('/api/attachments/i4a-legacy-a1/content', {}, adminA);
      assert(response.status === 404, `legacy browser content expected explicit 404, got ${response.status}`);

      const filesBeforeArchive = await fileCount(storageRoot, companyA);
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/archive`, { method: 'POST' }, adminA);
      assert(response.status === 200 && (await json(response)).item.isArchived === true, 'archive soft-state failed');
      assert(await fileCount(storageRoot, companyA) === filesBeforeArchive, 'archive physically deleted bytes');
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/content`, {}, adminA);
      assert(response.status === 404, `archived content expected 404, got ${response.status}`);
      response = await request(`/api/attachments/${encodeURIComponent(created.id)}/restore`, { method: 'POST' }, adminA);
      assert(response.status === 200 && (await json(response)).item.isArchived === false, 'restore failed');

      const deleteUploadResponse = await upload(adminA, { fileName: 'delete-me.pdf' });
      assert(deleteUploadResponse.status === 201, 'permanent-delete fixture upload failed');
      const deleteCandidate = (await json(deleteUploadResponse)).item;
      await db.execute(sql`
        INSERT INTO document_ai_extractions (
          id, company_id, attachment_id, attachment_checksum, idempotency_key, status,
          requested_by, attempt_count, created_at, updated_at
        ) VALUES (
          'i4a-delete-failed-extraction', ${companyA}, ${deleteCandidate.id}, ${deleteCandidate.checksum},
          'i4a-delete-failed-extraction-key', 'FAILED', ${adminAId}, 1, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET attachment_id=EXCLUDED.attachment_id, attachment_checksum=EXCLUDED.attachment_checksum, status='FAILED'
      `);
      response = await request(`/api/attachments/${encodeURIComponent(deleteCandidate.id)}`, { method: 'DELETE' }, readonlyA);
      assert(response.status === 403, `READONLY permanent delete expected 403, got ${response.status}`);
      response = await request(`/api/attachments/${encodeURIComponent(deleteCandidate.id)}`, { method: 'DELETE' }, adminB);
      assert(response.status === 404, `cross-tenant permanent delete expected 404, got ${response.status}`);
      const filesBeforePermanentDelete = await fileCount(storageRoot, companyA);
      response = await request(`/api/attachments/${encodeURIComponent(deleteCandidate.id)}`, { method: 'DELETE' }, adminA);
      const permanentDeleteResult = await json(response);
      assert(response.status === 200 && permanentDeleteResult.deleted === true && permanentDeleteResult.storageRemoved === true, 'ADMIN permanent delete failed');
      assert(Number((await scalar(sql`SELECT count(*)::int AS count FROM file_attachments WHERE company_id=${companyA} AND id=${deleteCandidate.id}`))?.count || 0) === 0, 'permanent delete left attachment metadata');
      assert(Number((await scalar(sql`SELECT count(*)::int AS count FROM document_ai_extractions WHERE company_id=${companyA} AND attachment_id=${deleteCandidate.id}`))?.count || 0) === 0, 'permanent delete left disposable failed extraction');
      assert(await fileCount(storageRoot, companyA) === filesBeforePermanentDelete - 1, 'permanent delete did not remove stored bytes');

      await db.execute(sql`
        INSERT INTO driver_document_intakes (
          id, company_id, created_by, status, idempotency_key, expires_at, created_at, updated_at
        ) VALUES (
          'i4a-disposable-driver-intake', ${companyA}, ${adminAId}, 'DRAFT',
          'i4a-disposable-driver-intake-key', NOW() + INTERVAL '1 day', NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          created_by=EXCLUDED.created_by,status='DRAFT',attachment_id=NULL,approved_extraction_id=NULL,
          driver_id=NULL,consumed_at=NULL,archived_at=NULL,expires_at=EXCLUDED.expires_at,updated_at=NOW()
      `);
      const intakeUploadResponse = await upload(adminA, {
        entityType: 'DriverDocumentIntake',
        entityId: 'i4a-disposable-driver-intake',
        documentType: 'CNH',
        fileName: 'failed-unused-cnh.pdf',
      });
      assert(intakeUploadResponse.status === 201, `driver intake upload expected 201, got ${intakeUploadResponse.status}`);
      const intakeAttachment = (await json(intakeUploadResponse)).item;
      await db.execute(sql`
        UPDATE driver_document_intakes
        SET status='FAILED',updated_at=NOW()
        WHERE company_id=${companyA} AND id='i4a-disposable-driver-intake'
      `);
      await db.execute(sql`
        INSERT INTO document_ai_extractions (
          id, company_id, attachment_id, attachment_checksum, idempotency_key, status,
          requested_by, attempt_count, proposed_fields, corrections, created_at, updated_at
        ) VALUES (
          'i4a-disposable-driver-extraction', ${companyA}, ${intakeAttachment.id}, ${intakeAttachment.checksum},
          'i4a-disposable-driver-extraction-key', 'FAILED', ${adminAId}, 1, '{}'::jsonb, '{}'::jsonb, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          attachment_id=EXCLUDED.attachment_id,attachment_checksum=EXCLUDED.attachment_checksum,status='FAILED',
          proposed_fields='{}'::jsonb,corrections='{}'::jsonb,approved_at=NULL,updated_at=NOW()
      `);
      response = await request(`/api/attachments/${encodeURIComponent(intakeAttachment.id)}`, { method: 'DELETE' }, adminA);
      assert(response.status === 200, `unused failed intake permanent delete expected 200, got ${response.status}`);
      assert(Number((await scalar(sql`SELECT count(*)::int AS count FROM driver_document_intakes WHERE company_id=${companyA} AND id='i4a-disposable-driver-intake'`))?.count || 0) === 0, 'unused failed driver intake survived permanent delete');
      assert(Number((await scalar(sql`SELECT count(*)::int AS count FROM document_ai_extractions WHERE company_id=${companyA} AND id='i4a-disposable-driver-extraction'`))?.count || 0) === 0, 'unused failed extraction survived permanent delete');
      assert(Number((await scalar(sql`SELECT count(*)::int AS count FROM file_attachments WHERE company_id=${companyA} AND id=${intakeAttachment.id}`))?.count || 0) === 0, 'unused failed intake attachment survived permanent delete');

      const linkedUploadResponse = await upload(adminA, { fileName: 'linked-document.pdf' });
      assert(linkedUploadResponse.status === 201, 'linked delete fixture upload failed');
      const linkedAttachment = (await json(linkedUploadResponse)).item;
      await db.execute(sql`
        INSERT INTO documents (
          id, company_id, subject_type, subject_id, document_type, attachment_id,
          version_number, is_current, is_archived, cost, created_by, created_at, updated_at
        ) VALUES (
          'i4a-linked-delete-doc', ${companyA}, 'VEHICLE', 'i4a-veh-a1', 'CRLV', ${linkedAttachment.id},
          1, true, false, 0, ${adminAId}, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET attachment_id=EXCLUDED.attachment_id, is_archived=false
      `);
      response = await request(`/api/attachments/${encodeURIComponent(linkedAttachment.id)}`, { method: 'DELETE' }, adminA);
      assert(response.status === 409, `linked permanent delete expected 409, got ${response.status}`);
      assert(Number((await scalar(sql`SELECT count(*)::int AS count FROM file_attachments WHERE company_id=${companyA} AND id=${linkedAttachment.id}`))?.count || 0) === 1, 'linked attachment was permanently deleted');
      await db.execute(sql`DELETE FROM documents WHERE company_id=${companyA} AND id='i4a-linked-delete-doc'`);
      response = await request(`/api/attachments/${encodeURIComponent(linkedAttachment.id)}`, { method: 'DELETE' }, adminA);
      assert(response.status === 200, 'unlinked attachment did not become permanently deletable');

      const beforeCount = Number((await scalar(sql`SELECT count(*)::int AS count FROM file_attachments WHERE company_id=${companyA}`))?.count || 0);
      const beforeFiles = await fileCount(storageRoot, companyA);
      const originalAuditCreate = PostgresAuditLogRepository.prototype.create;
      PostgresAuditLogRepository.prototype.create = async function forcedAttachmentAuditFailure(): Promise<any> {
        throw new Error('FORCED_ATTACHMENT_AUDIT_FAILURE');
      };
      try {
        response = await upload(adminA, { fileName: 'rollback.pdf' });
        assert(response.status === 500, `forced audit failure expected 500, got ${response.status}`);
      } finally {
        PostgresAuditLogRepository.prototype.create = originalAuditCreate;
      }
      const afterCount = Number((await scalar(sql`SELECT count(*)::int AS count FROM file_attachments WHERE company_id=${companyA}`))?.count || 0);
      const afterFiles = await fileCount(storageRoot, companyA);
      assert(afterCount === beforeCount, 'metadata survived forced audit rollback');
      assert(afterFiles === beforeFiles, 'blob survived forced audit compensation');

      const configured = process.env.ATTACHMENT_STORAGE_DIR;
      delete process.env.ATTACHMENT_STORAGE_DIR;
      try {
        response = await upload(adminA, { fileName: 'storage-unavailable.pdf' });
        assert(response.status === 503, `unconfigured storage expected 503, got ${response.status}`);
      } finally {
        if (configured) process.env.ATTACHMENT_STORAGE_DIR = configured;
      }

      process.env.ATTACHMENT_STORAGE_DURABLE = 'true';
      response = await request('/api/attachments/storage/status', {}, adminA);
      const unsafeDurableStatus = (await json(response)).storage;
      assert(unsafeDurableStatus.durableRequested === true && unsafeDurableStatus.durable === false, 'ephemeral path accepted a durable attestation');

      response = await upload(adminA, { fileName: 'unsafe-durable-path.pdf' });
      assert(response.status === 503, `durable storage on /tmp expected 503, got ${response.status}`);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (previousStorage === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
      else process.env.ATTACHMENT_STORAGE_DIR = previousStorage;
      if (previousDurable === undefined) delete process.env.ATTACHMENT_STORAGE_DURABLE;
      else process.env.ATTACHMENT_STORAGE_DURABLE = previousDurable;
      await rm(storageRoot, { recursive: true, force: true });
    }
  }
}

if (process.argv[1]?.includes('attachmentAuthorityIntegration')) {
  AttachmentAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Attachment authority integration PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
