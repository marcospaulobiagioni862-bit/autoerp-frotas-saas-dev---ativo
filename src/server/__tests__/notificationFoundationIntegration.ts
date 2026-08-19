import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import type { PersistentNotification } from '../../types/entities';

const companyA = 'security-2i5a-company-a';
const companyB = 'security-2i5a-company-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function notification(overrides: Partial<PersistentNotification> = {}): PersistentNotification {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    companyId: companyA,
    sourceType: 'DOCUMENT',
    sourceId: 'i5a-doc-a1',
    sourceVersion: 'v1',
    alertStage: 'D30',
    title: 'Documento vence em até 30 dias',
    message: 'Documento de teste I5A próximo do vencimento.',
    severity: 'WARNING',
    dueDate: '2026-09-18',
    destinationTab: 'compliance',
    idempotencyKey: 'DOCUMENT:i5a-doc-a1:v1:D30',
    status: 'UNREAD',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export class NotificationFoundationIntegrationRunner {
  static async runAllTests(): Promise<void> {
    await db.execute(sql`
      INSERT INTO companies (id, document, name, status, created_at, updated_at) VALUES
        (${companyA}, 'I5A-COMP-A', 'I5A Company A', 'ACTIVE', NOW(), NOW()),
        (${companyB}, 'I5A-COMP-B', 'I5A Company B', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    const first = notification();
    const created = await UnitOfWork.run(companyA, async (tx) =>
      await tx.getNotificationRepo().create(first)
    );
    assert(created.companyId === companyA, 'notification company mismatch');
    assert(created.status === 'UNREAD', 'notification must start unread');

    const unreadBefore = await UnitOfWork.run(companyA, async (tx) =>
      await tx.getNotificationRepo().countUnread(companyA)
    );
    assert(unreadBefore === 1, `expected one unread notification, got ${unreadBefore}`);

    const otherTenantRead = await UnitOfWork.run(companyB, async (tx) =>
      await tx.getNotificationRepo().findByIdForCompany(companyB, first.id)
    );
    assert(otherTenantRead === null, 'cross-tenant notification leaked');

    const readAt = new Date().toISOString();
    const markedRead = await UnitOfWork.run(companyA, async (tx) =>
      await tx.getNotificationRepo().updateStatusForCompany(companyA, first.id, 'READ', readAt)
    );
    assert(markedRead?.status === 'READ', 'notification was not marked read');
    assert(Boolean(markedRead?.readAt), 'read timestamp missing');

    const second = notification({
      id: randomUUID(),
      sourceId: 'i5a-doc-a2',
      idempotencyKey: 'DOCUMENT:i5a-doc-a2:v1:D7',
      alertStage: 'D7',
    });
    await UnitOfWork.run(companyA, async (tx) => tx.getNotificationRepo().create(second));

    const changed = await UnitOfWork.run(companyA, async (tx) =>
      await tx.getNotificationRepo().markAllRead(companyA, undefined, new Date().toISOString())
    );
    assert(changed === 1, `markAllRead expected one changed row, got ${changed}`);

    const unreadAfter = await UnitOfWork.run(companyA, async (tx) =>
      await tx.getNotificationRepo().countUnread(companyA)
    );
    assert(unreadAfter === 0, `expected zero unread notifications, got ${unreadAfter}`);

    let duplicateRejected = false;
    try {
      await UnitOfWork.run(companyA, async (tx) =>
        await tx.getNotificationRepo().create(notification({ id: randomUUID() }))
      );
    } catch (error: any) {
      let current: any = error;
      for (let depth = 0; depth < 6 && current; depth += 1) {
        if (current.code === '23505') duplicateRejected = true;
        current = current.cause;
      }
    }
    assert(duplicateRejected, 'notification idempotency unique constraint did not reject duplicate');

    console.log('SECURITY-2I5A notification foundation integration PASS');
  }
}
