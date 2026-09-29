import assert from 'node:assert/strict';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import type { AuthenticatedPrincipal } from '../auth';
import { registerWhatsappRoutes } from '../whatsappRoutes';

const companyA = 'whatsapp-company-a';
const companyB = 'whatsapp-company-b';
const adminAId = 'whatsapp-admin-a';
const adminBId = 'whatsapp-admin-b';
const readonlyAId = 'whatsapp-readonly-a';
const driverAId = 'whatsapp-driver-a';
const driverBId = 'whatsapp-driver-b';

function resultRows(result: any): Record<string, any>[] {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function responseJson(response: globalThis.Response): Promise<any> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export class WhatsappAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
        (${companyA}, 'WhatsApp Synthetic Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'WhatsApp Synthetic Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
        (${adminAId}, ${companyA}, 'WhatsApp Admin A', 'whatsapp-admin-a@example.test', 'ADMIN', true, NOW(), NOW()),
        (${adminBId}, ${companyB}, 'WhatsApp Admin B', 'whatsapp-admin-b@example.test', 'ADMIN', true, NOW(), NOW()),
        (${readonlyAId}, ${companyA}, 'WhatsApp Readonly A', 'whatsapp-readonly-a@example.test', 'READONLY', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO drivers (
        id, company_id, name, cpf, cnh, active, birth_date, phone, whatsapp, email,
        address_street, address_number, address_neighborhood, address_city, address_state,
        address_zip_code, cnh_category, cnh_expiration, app_platforms, status,
        is_archived, created_at, updated_at
      ) VALUES
      (
        ${driverAId}, ${companyA}, 'Motorista WhatsApp Sintético A', '52998224725', '12345678900',
        true, '1990-01-01', '11987654321', '11987654321', 'whatsapp-driver-a@example.test',
        'Rua Sintética', '1', 'Centro', 'São Paulo', 'SP', '01001000', 'B', '2035-01-15',
        ARRAY['synthetic'], 'ACTIVE', false, '2026-08-24T20:00:00.000Z', '2026-08-24T20:00:00.000Z'
      ),
      (
        ${driverBId}, ${companyB}, 'Motorista WhatsApp Sintético B', '11144477735', '98765432100',
        true, '1991-01-01', '21987654321', '21987654321', 'whatsapp-driver-b@example.test',
        'Rua Sintética', '2', 'Centro', 'Rio de Janeiro', 'RJ', '20040002', 'B', '2035-02-15',
        ARRAY['synthetic'], 'ACTIVE', false, '2026-08-24T20:00:00.000Z', '2026-08-24T20:00:00.000Z'
      )
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
          name: `${role} WhatsApp Integration`,
          role,
          permissions: [],
        };
      }
      next();
    });
    registerWhatsappRoutes(app);

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const request = async (
      route: string,
      options: RequestInit = {},
      principal?: { companyId: string; role: string; userId: string },
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

    try {
      let response = await request(`/api/whatsapp/consents/${driverAId}`);
      assert.equal(response.status, 401);

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'GRANT' }),
      }, readonlyA);
      assert.equal(response.status, 403);

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'GRANT', companyId: companyB }),
      }, adminA);
      assert.equal(response.status, 400, 'browser tenant authority must be rejected');

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'GRANT' }),
      }, adminB);
      assert.equal(response.status, 404, 'cross-tenant driver must look absent');

      response = await request('/api/whatsapp/outbox', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }),
      }, adminA);
      assert.equal(response.status, 201, 'outbox must not require ERP consent');
      const directWithoutConsent = await responseJson(response);
      assert.equal(directWithoutConsent.created, true);
      await UnitOfWork.run(companyA, async (context: any) => {
        const tx = context.getRawTransaction();
        await tx.execute(sql`DELETE FROM whatsapp_outbox WHERE company_id=${companyA} AND id=${directWithoutConsent.item.id}`);
        await tx.execute(sql`DELETE FROM audit_logs WHERE company_id=${companyA} AND entity_type='WhatsappOutbox' AND entity_id=${directWithoutConsent.item.id}`);
      });

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'GRANT' }),
      }, adminA);
      assert.equal(response.status, 200);
      const granted = await responseJson(response);
      assert.equal(granted.item.status, 'GRANTED');
      assert.equal(granted.item.driverId, driverAId);
      assert.equal(granted.item.phoneMasked.endsWith('4321'), true);
      assert.equal(JSON.stringify(granted).includes('+5511987654321'), false, 'raw phone must not be returned');

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'GRANT' }),
      }, adminA);
      assert.equal(response.status, 200);
      assert.equal((await responseJson(response)).changed, false, 'identical consent grant must be idempotent');

      response = await request('/api/whatsapp/outbox', {
        method: 'POST',
        body: JSON.stringify({
          driverId: driverAId,
          templateKey: 'DRIVER_CNH_EXPIRY',
          phone: '+5521999999999',
        }),
      }, adminA);
      assert.equal(response.status, 400, 'browser phone authority must be rejected');

      response = await request('/api/whatsapp/outbox', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }),
      }, adminB);
      assert.equal(response.status, 404, 'cross-tenant outbox request must look absent');

      const concurrentOutbox = await Promise.all([
        request('/api/whatsapp/outbox', {
          method: 'POST',
          body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }),
        }, adminA),
        request('/api/whatsapp/outbox', {
          method: 'POST',
          body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }),
        }, adminA),
      ]);
      assert.deepEqual(
        concurrentOutbox.map((item) => item.status).sort(),
        [200, 201],
        'concurrent outbox requests must create once and replay once',
      );
      const concurrentPayloads = await Promise.all(concurrentOutbox.map(responseJson));
      const created = concurrentPayloads.find((item) => item.created === true);
      const replay = concurrentPayloads.find((item) => item.created === false);
      assert.ok(created && replay);
      assert.equal(created.item.status, 'HELD_PROVIDER_DISABLED');
      assert.equal(created.item.templateVersion, 1, 'outbox must persist selected template version');
      const autoSeeded = await UnitOfWork.run(companyA, async (context: any) => resultRows(await context.getRawTransaction().execute(sql`SELECT version FROM whatsapp_template_catalog WHERE company_id=${companyA} AND template_key='DRIVER_CNH_EXPIRY'`)));
      assert.equal(autoSeeded.length, 1, 'new tenant must receive one canonical template without browser authority');
      assert.equal(created.item.providerCallApplied, false);
      assert.equal(created.item.templateParameters.driverName, 'Motorista WhatsApp Sintético A');
      assert.equal(created.item.templateParameters.cnhExpiration, '2035-01-15');
      assert.equal(JSON.stringify(created).includes('+5511987654321'), false);
      assert.equal(replay.item.id, created.item.id, 'concurrent outbox replay must be idempotent');

      response = await request('/api/whatsapp/outbox', {}, adminA);
      assert.equal(response.status, 200);
      const listA = (await responseJson(response)).items;
      assert.equal(listA.length, 1);
      assert.equal(listA[0].id, created.item.id);

      response = await request(`/api/whatsapp/outbox/${created.item.id}`, {}, adminB);
      assert.equal(response.status, 404, 'cross-tenant outbox item must look absent');

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'REVOKE' }),
      }, adminA);
      assert.equal(response.status, 200);
      const revoked = await responseJson(response);
      assert.equal(revoked.item.status, 'REVOKED');
      assert.equal(revoked.cancelledHeldItems, 0, 'consent is informational and must not cancel held outbox');

      response = await request(`/api/whatsapp/outbox/${created.item.id}`, {}, adminA);
      assert.equal(response.status, 200);
      assert.equal((await responseJson(response)).item.status, 'HELD_PROVIDER_DISABLED');

      response = await request('/api/whatsapp/outbox', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }),
      }, adminA);
      assert.equal(response.status, 200, 'revoked ERP consent must not block outbox replay');
      assert.equal((await responseJson(response)).created, false);

      const auditRows = await UnitOfWork.run(companyA, async (context: any) => {
        const tx = context.getRawTransaction();
        return resultRows(await tx.execute(sql`
          SELECT action, changes FROM audit_logs
          WHERE company_id = ${companyA}
            AND entity_type IN ('WhatsappConsent', 'WhatsappOutbox')
        `));
      });
      assert.equal(auditRows.length, 3, 'grant, held outbox, and revoke must each emit one audit event');
      for (const row of auditRows) {
        const changes = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes;
        const next = typeof changes.newState === 'string' ? JSON.parse(changes.newState) : changes.newState;
        assert.equal(next.providerCallApplied, false);
      }

      const stored = await UnitOfWork.run(companyA, async (context: any) => {
        const tx = context.getRawTransaction();
        return resultRows(await tx.execute(sql`
          SELECT status, requested_by, cancelled_by, cancellation_reason
          FROM whatsapp_outbox
          WHERE company_id = ${companyA} AND id = ${created.item.id}
        `))[0];
      });
      assert.equal(stored.status, 'HELD_PROVIDER_DISABLED');
      assert.equal(stored.requested_by, adminAId);
      assert.equal(stored.cancelled_by, null);
      assert.equal(stored.cancellation_reason, null);

      response = await request(`/api/whatsapp/consents/${driverAId}`, {
        method: 'PUT',
        body: JSON.stringify({ decision: 'GRANT' }),
      }, adminA);
      assert.equal(response.status, 200);
      response = await request('/api/whatsapp/outbox', {
        method: 'POST',
        body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }),
      }, adminA);
      assert.equal(response.status, 200, 'consent changes must not alter outbox idempotency');
      const afterRegrant = await responseJson(response);
      assert.equal(afterRegrant.item.id, created.item.id, 'consent state must not fork the ERP outbox identity');
      assert.equal(afterRegrant.item.templateVersion, 1);

      let immutableRejected = false;
      try {
        await UnitOfWork.run(companyA, async (context: any) => {
          await context.getRawTransaction().execute(sql`
            UPDATE whatsapp_template_catalog
            SET body_text = 'conteúdo adulterado'
            WHERE company_id = ${companyA} AND template_key = 'DRIVER_CNH_EXPIRY' AND version = 1
          `);
        });
      } catch { immutableRejected = true; }
      assert.equal(immutableRejected, true, 'published template content must be immutable');

      await UnitOfWork.run(companyA, async (context: any) => {
        const tx = context.getRawTransaction();
        await tx.execute(sql`UPDATE whatsapp_template_catalog SET status='INACTIVE',updated_at=NOW() WHERE company_id=${companyA} AND template_key='DRIVER_CNH_EXPIRY' AND version=1`);
      });
      response = await request('/api/whatsapp/outbox', { method: 'POST', body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }) }, adminA);
      assert.equal(response.status, 400, 'inactive template must fail closed');

      await UnitOfWork.run(companyA, async (context: any) => {
        await context.getRawTransaction().execute(sql`
          INSERT INTO whatsapp_template_catalog(company_id,template_key,version,status,body_text,parameter_keys)
          VALUES(${companyA},'DRIVER_CNH_EXPIRY',2,'ACTIVE','Versão 2: {{driverName}} / {{cnhExpiration}}','["driverName","cnhExpiration"]'::jsonb)
        `);
      });
      response = await request('/api/whatsapp/outbox', { method: 'POST', body: JSON.stringify({ driverId: driverAId, templateKey: 'DRIVER_CNH_EXPIRY' }) }, adminA);
      assert.equal(response.status, 201, 'new active version must create a distinct held item');
      const versionTwo = await responseJson(response);
      assert.equal(versionTwo.item.templateVersion, 2);
      const versions = await UnitOfWork.run(companyA, async (context: any) => resultRows(await context.getRawTransaction().execute(sql`SELECT template_version FROM whatsapp_outbox WHERE company_id=${companyA} ORDER BY template_version`)));
      assert.ok(versions.some((row) => Number(row.template_version) === 1) && versions.some((row) => Number(row.template_version) === 2), 'catalog evolution rewrote prior outbox version');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()),
      );
    }
  }
}

if (process.argv[1]?.includes('whatsappAuthorityIntegration')) {
  WhatsappAuthorityIntegrationRunner.runAllTests()
    .then(() => console.log('WhatsApp outbox authority integration without internal consent gate PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
