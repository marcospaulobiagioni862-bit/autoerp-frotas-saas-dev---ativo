import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { registerDocumentRoutes } from '../documentRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { PostgresAuditLogRepository } from '../../db/repositories/postgresRepositories';

const companyA = 'security-2i4b-company-a';
const companyB = 'security-2i4b-company-b';
const adminAId = 'security-2i4b-admin-a';
const adminBId = 'security-2i4b-admin-b';
const readonlyAId = 'security-2i4b-readonly-a';

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

export class DocumentAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
        (${companyA}, 'I4B Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'I4B Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
        (${adminAId}, ${companyA}, 'I4B Admin A', 'i4b-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
        (${adminBId}, ${companyB}, 'I4B Admin B', 'i4b-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
        (${readonlyAId}, ${companyA}, 'I4B Readonly A', 'i4b-readonly-a@example.test', 'READONLY', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO vehicles (
        id, company_id, plate, renavam, status, is_archived, created_at, updated_at
      ) VALUES
        ('i4b-veh-a1', ${companyA}, 'I4A1A11', 'I4B-RENAVAM-A1', 'AVAILABLE', false, NOW(), NOW()),
        ('i4b-veh-a2', ${companyA}, 'I4A2A22', 'I4B-RENAVAM-A2', 'AVAILABLE', false, NOW(), NOW()),
        ('i4b-veh-b1', ${companyB}, 'I4B1B11', 'I4B-RENAVAM-B1', 'AVAILABLE', false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, cpf, cnh, cnh_category, cnh_expiration, cnh_status,
        active, status, app_platforms, is_archived, created_at, updated_at
      ) VALUES
        ('i4b-drv-a1', ${companyA}, 'Driver I4B A1', '52998224725', '12345678900', 'AB', '2027-12-31', 'VALID', true, 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW()),
        ('i4b-drv-b1', ${companyB}, 'Driver I4B B1', '11144477735', '02650306461', 'B', '2027-12-31', 'VALID', true, 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO file_attachments (
        id, company_id, entity_type, entity_name, entity_id, document_type, file_name, mime_type, url,
        size, file_size, storage_provider, storage_key, checksum, created_by, is_archived, content_state, created_at
      ) VALUES
        ('i4b-att-veh-a1-v1', ${companyA}, 'Vehicle', 'Vehicle', 'i4b-veh-a1', 'CRLV', 'crlv-v1.pdf', 'application/pdf', 'attachment://a1', 10, 10, 'SERVER_FS', 'a/v1', repeat('a',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i4b-att-veh-a1-v2', ${companyA}, 'Vehicle', 'Vehicle', 'i4b-veh-a1', 'CRLV', 'crlv-v2.pdf', 'application/pdf', 'attachment://a2', 11, 11, 'SERVER_FS', 'a/v2', repeat('b',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i4b-att-veh-a2', ${companyA}, 'Vehicle', 'Vehicle', 'i4b-veh-a2', 'CRLV', 'crlv-other.pdf', 'application/pdf', 'attachment://a3', 12, 12, 'SERVER_FS', 'a/v3', repeat('c',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i4b-att-drv-a1', ${companyA}, 'Driver', 'Driver', 'i4b-drv-a1', 'CNH', 'cnh.pdf', 'application/pdf', 'attachment://a4', 13, 13, 'SERVER_FS', 'a/v4', repeat('d',64), ${adminAId}, false, 'AVAILABLE', NOW()),
        ('i4b-att-veh-b1', ${companyB}, 'Vehicle', 'Vehicle', 'i4b-veh-b1', 'CRLV', 'other-tenant.pdf', 'application/pdf', 'attachment://b1', 14, 14, 'SERVER_FS', 'b/v1', repeat('e',64), ${adminBId}, false, 'AVAILABLE', NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
      const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
      const role = typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : '';
      const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
      if (companyId && role && userId) {
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
          companyId,
          userId,
          name: `${role} Document Integration`,
          role,
          permissions: [],
        };
      }
      next();
    });
    registerDocumentRoutes(app);

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
      if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      return await fetch(`${base}${route}`, { ...options, headers });
    };

    const adminA = { companyId: companyA, role: 'ADMIN', userId: adminAId };
    const adminB = { companyId: companyB, role: 'ADMIN', userId: adminBId };
    const readonlyA = { companyId: companyA, role: 'READONLY', userId: readonlyAId };

    const postJson = async (route: string, body: any, principal = adminA) =>
      await request(route, { method: 'POST', body: JSON.stringify(body) }, principal);

    try {
      let response = await request('/api/documents');
      assert(response.status === 401, `no-session expected 401, got ${response.status}`);

      response = await request('/api/documents', {}, readonlyA);
      assert(response.status === 200, `READONLY list expected 200, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a1', documentType: 'CRLV', referenceYear: 2026,
        attachmentId: 'i4b-att-veh-a1-v1', expirationDate: '2026-12-31',
      }, readonlyA);
      assert(response.status === 403, `READONLY create expected 403, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a1', documentType: 'CRLV',
        attachmentId: 'i4b-att-veh-a1-v1', expirationDate: '2026-12-31',
      });
      assert(response.status === 400, `annual doc without referenceYear expected 400, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-b1', documentType: 'CRLV', referenceYear: 2026,
        attachmentId: 'i4b-att-veh-b1', expirationDate: '2026-12-31',
      });
      assert(response.status === 404, `cross-tenant subject expected 404, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a1', documentType: 'CRLV', referenceYear: 2026,
        attachmentId: 'i4b-att-veh-b1', expirationDate: '2026-12-31',
      });
      assert(response.status === 404, `cross-tenant attachment expected 404, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a1', documentType: 'CRLV', referenceYear: 2026,
        attachmentId: 'i4b-att-veh-a2', expirationDate: '2026-12-31',
      });
      assert(response.status === 404, `wrong-subject attachment expected 404, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a1', documentType: 'CRLV', referenceYear: 2026,
        documentNumber: 'CRLV-A1', attachmentId: 'i4b-att-veh-a1-v1', expirationDate: '2026-12-31', cost: 100,
        companyId: companyB, userId: adminBId, versionNumber: 77, isCurrent: false, payableId: 'forged-payable',
        complianceStatus: 'EXPIRED', alertStage: 'POST_DUE',
      });
      assert(response.status === 201, `initial document expected 201, got ${response.status}`);
      const v1 = (await json(response)).item;
      assert(v1.companyId === companyA, 'forged company became authoritative');
      assert(v1.createdBy === adminAId, 'forged user became authoritative');
      assert(v1.versionNumber === 1 && v1.isCurrent === true, 'forged version/current became authoritative');
      assert(v1.payableId === undefined, 'forged payable became authoritative');
      assert(v1.complianceStatus !== 'EXPIRED', 'forged status became authoritative');

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a1', documentType: 'CRLV', referenceYear: 2026,
        attachmentId: 'i4b-att-veh-a1-v1', expirationDate: '2026-12-31',
      });
      assert(response.status === 409, `duplicate current semantic key expected 409, got ${response.status}`);

      response = await postJson(`/api/documents/${encodeURIComponent(v1.id)}/versions`, {
        documentNumber: 'CRLV-A1-V2', attachmentId: 'i4b-att-veh-a1-v2', expirationDate: '2027-12-31', cost: 120,
      });
      assert(response.status === 201, `version expected 201, got ${response.status}`);
      const v2 = (await json(response)).item;
      assert(v2.versionNumber === 2 && v2.supersedesDocumentId === v1.id && v2.isCurrent === true, 'version linkage failed');

      response = await request(`/api/documents/${encodeURIComponent(v1.id)}/versions`, {}, adminA);
      assert(response.status === 200, 'version history read failed');
      const versions = (await json(response)).items;
      assert(versions.length === 2 && versions[0].versionNumber === 2 && versions[1].versionNumber === 1, 'version history not preserved');
      assert(versions[1].isCurrent === false, 'previous version remained current');

      response = await postJson(`/api/documents/${encodeURIComponent(v1.id)}/versions`, { attachmentId: 'i4b-att-veh-a1-v2' });
      assert(response.status === 409, `stale version endpoint expected 409, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'DRIVER', subjectId: 'i4b-drv-a1', documentType: 'CNH',
        documentNumber: '99999999999', expirationDate: '2028-01-01', attachmentId: 'i4b-att-drv-a1',
      });
      assert(response.status === 400, `divergent CNH expected 400, got ${response.status}`);

      response = await postJson('/api/documents', {
        subjectType: 'DRIVER', subjectId: 'i4b-drv-a1', documentType: 'CNH', attachmentId: 'i4b-att-drv-a1',
      });
      assert(response.status === 201, `CNH evidence expected 201, got ${response.status}`);
      const cnh = (await json(response)).item;
      assert(cnh.documentNumber === '12345678900' && cnh.expirationDate === '2027-12-31', 'CNH not derived from Driver core');

      response = await postJson('/api/documents', {
        subjectType: 'VEHICLE', subjectId: 'i4b-veh-a2', documentType: 'LICENCIAMENTO', referenceYear: 2027,
        documentNumber: 'LIC-2027', attachmentId: 'i4b-att-veh-a2', expirationDate: '2027-12-31',
        cost: 250, generatePayable: true, categoryId: 'cat-doc-default',
      });
      assert(response.status === 201, `document payable create expected 201, got ${response.status}`);
      const payableDoc = (await json(response)).item;
      assert(typeof payableDoc.payableId === 'string' && payableDoc.payableId.length > 0, 'document payable linkage missing');
      const payableCount = Number((await scalar(sql`
        SELECT count(*)::int AS count FROM accounts_payable
        WHERE company_id=${companyA} AND origin_type='DOCUMENTATION' AND origin_id=${payableDoc.id}
      `))?.count || 0);
      assert(payableCount === 1, `document payable expected exactly 1, got ${payableCount}`);

      response = await postJson(`/api/documents/${encodeURIComponent(v2.id)}/archive`, {});
      assert(response.status === 200 && (await json(response)).item.isArchived === true, 'archive failed');
      const attachmentAfterArchive = await scalar(sql`SELECT is_archived FROM file_attachments WHERE id='i4b-att-veh-a1-v2'`);
      assert(attachmentAfterArchive?.is_archived === false, 'document archive archived attachment bytes');

      response = await postJson(`/api/documents/${encodeURIComponent(v2.id)}/restore`, {});
      assert(response.status === 200 && (await json(response)).item.isCurrent === true, 'restore failed');

      response = await request(`/api/documents/${encodeURIComponent(v2.id)}`, {}, adminB);
      assert(response.status === 404, `cross-tenant document get expected 404, got ${response.status}`);

      const beforeRollback = Number((await scalar(sql`SELECT count(*)::int AS count FROM documents WHERE company_id=${companyA}`))?.count || 0);
      const originalAuditCreate = PostgresAuditLogRepository.prototype.create;
      PostgresAuditLogRepository.prototype.create = async function forcedDocumentAuditFailure(): Promise<any> {
        throw new Error('FORCED_DOCUMENT_AUDIT_FAILURE');
      };
      try {
        response = await postJson('/api/documents', {
          subjectType: 'VEHICLE', subjectId: 'i4b-veh-a2', documentType: 'VISTORIA',
          documentNumber: 'VIST-ROLLBACK', attachmentId: 'i4b-att-veh-a2', expirationDate: '2027-10-01',
        });
        assert(response.status === 500, `forced audit failure expected 500, got ${response.status}`);
      } finally {
        PostgresAuditLogRepository.prototype.create = originalAuditCreate;
      }
      const afterRollback = Number((await scalar(sql`SELECT count(*)::int AS count FROM documents WHERE company_id=${companyA}`))?.count || 0);
      assert(afterRollback === beforeRollback, 'document survived forced audit rollback');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

if (process.argv[1]?.includes('documentAuthorityIntegration')) {
  DocumentAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('Document authority integration PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
