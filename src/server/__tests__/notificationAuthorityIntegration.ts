import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import type { AuthenticatedPrincipal } from '../auth';
import type { PersistentNotification } from '../../types/entities';
import { registerNotificationRoutes } from '../notificationRoutes';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const COMPANY_A = 'i5a-api-company-a';
const COMPANY_B = 'i5a-api-company-b';
const USER_A = 'i5a-api-user-a';
const USER_OTHER = 'i5a-api-user-other';

function item(companyId: string, id: string, overrides: Partial<PersistentNotification> = {}): PersistentNotification {
  const now = '2026-08-19T12:00:00.000Z';
  return {
    id,
    companyId,
    sourceType: 'DOCUMENT',
    sourceId: `source-${id}`,
    sourceVersion: 'v1',
    alertStage: 'D7',
    title: `Notification ${id}`,
    message: `Message ${id}`,
    severity: 'WARNING',
    dueDate: '2026-08-26',
    destinationTab: 'compliance',
    idempotencyKey: `KEY:${companyId}:${id}`,
    status: 'UNREAD',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function jsonRequest(base: string, path: string, init: RequestInit = {}, identity?: { companyId: string; userId: string; role?: string }) {
  const headers = new Headers(init.headers);
  if (identity) {
    headers.set('x-test-company-id', identity.companyId);
    headers.set('x-test-user-id', identity.userId);
    headers.set('x-test-role', identity.role || 'READONLY');
  }
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

export class NotificationAuthorityIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, document, name, status, created_at, updated_at) VALUES
        (${COMPANY_A}, 'I5A-API-A', 'I5A API A', 'ACTIVE', NOW(), NOW()),
        (${COMPANY_B}, 'I5A-API-B', 'I5A API B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET status='ACTIVE', updated_at=NOW()
    `);

    const globalA = item(COMPANY_A, 'api-global-a');
    const secondA = item(COMPANY_A, 'api-second-a');
    const privateOther = item(COMPANY_A, 'api-private-other', { recipientUserId: USER_OTHER });
    const companyB = item(COMPANY_B, 'api-company-b');
    await UnitOfWork.run(COMPANY_A, async (tx) => {
      await tx.getNotificationRepo().create(globalA);
      await tx.getNotificationRepo().create(secondA);
      await tx.getNotificationRepo().create(privateOther);
    });
    await UnitOfWork.run(COMPANY_B, async (tx) => tx.getNotificationRepo().create(companyB));

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const companyId = req.headers['x-test-company-id'];
      const userId = req.headers['x-test-user-id'];
      if (typeof companyId === 'string' && typeof userId === 'string') {
        const principal: AuthenticatedPrincipal = {
          companyId,
          userId,
          name: 'Notification API Test User',
          role: typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : 'READONLY',
          permissions: [],
        };
        (req as Request & { principal?: AuthenticatedPrincipal }).principal = principal;
      }
      next();
    });
    registerNotificationRoutes(app);

    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    assert(address && typeof address === 'object', 'notification integration server address unavailable');
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const unauth = await jsonRequest(base, '/api/notifications');
      assert(unauth.response.status === 401, `unauthenticated list status ${unauth.response.status}`);

      const list = await jsonRequest(base, '/api/notifications?status=UNREAD&limit=20', {}, { companyId: COMPANY_A, userId: USER_A });
      assert(list.response.status === 200, `notification list status ${list.response.status}`);
      const ids = list.body.items.map((entry: PersistentNotification) => entry.id).sort();
      assert(ids.join(',') === ['api-global-a', 'api-second-a'].sort().join(','), `recipient/tenant list leak: ${ids.join(',')}`);
      assert(!list.body.items.some((entry: PersistentNotification) => entry.companyId === COMPANY_B), 'cross-tenant list leaked company B');

      const count = await jsonRequest(base, '/api/notifications/unread-count', {}, { companyId: COMPANY_A, userId: USER_A });
      assert(count.response.status === 200 && count.body.count === 2, `unread count mismatch ${JSON.stringify(count.body)}`);

      const invalidStatus = await jsonRequest(base, '/api/notifications?status=BROKEN', {}, { companyId: COMPANY_A, userId: USER_A });
      assert(invalidStatus.response.status === 400, 'invalid status was not rejected');
      const invalidLimit = await jsonRequest(base, '/api/notifications?limit=999', {}, { companyId: COMPANY_A, userId: USER_A });
      assert(invalidLimit.response.status === 400, 'invalid limit was not rejected');

      const read = await jsonRequest(base, '/api/notifications/api-global-a/read', { method: 'POST' }, { companyId: COMPANY_A, userId: USER_A, role: 'READONLY' });
      assert(read.response.status === 200 && read.body.item.status === 'READ', 'READONLY user could not mark visible notification read');

      const privateDenied = await jsonRequest(base, '/api/notifications/api-private-other/read', { method: 'POST' }, { companyId: COMPANY_A, userId: USER_A });
      assert(privateDenied.response.status === 404, `other-recipient notification leaked: ${privateDenied.response.status}`);

      const crossTenantDenied = await jsonRequest(base, '/api/notifications/api-company-b/read', { method: 'POST' }, { companyId: COMPANY_A, userId: USER_A });
      assert(crossTenantDenied.response.status === 404, `cross-tenant notification leaked: ${crossTenantDenied.response.status}`);

      const dismiss = await jsonRequest(base, '/api/notifications/api-second-a/dismiss', { method: 'POST' }, { companyId: COMPANY_A, userId: USER_A });
      assert(dismiss.response.status === 200 && dismiss.body.item.status === 'DISMISSED', 'dismiss failed');

      const newA = item(COMPANY_A, randomUUID(), { idempotencyKey: `KEY:${COMPANY_A}:read-all` });
      await UnitOfWork.run(COMPANY_A, async (tx) => tx.getNotificationRepo().create(newA));
      const readAll = await jsonRequest(base, '/api/notifications/read-all', { method: 'POST' }, { companyId: COMPANY_A, userId: USER_A, role: 'READONLY' });
      assert(readAll.response.status === 200 && readAll.body.updated === 1, `read-all mismatch ${JSON.stringify(readAll.body)}`);

      const finalCount = await jsonRequest(base, '/api/notifications/unread-count', {}, { companyId: COMPANY_A, userId: USER_A });
      assert(finalCount.response.status === 200 && finalCount.body.count === 0, `final unread count mismatch ${JSON.stringify(finalCount.body)}`);

      console.log('SECURITY-2I5A notification API authority PASS');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}
