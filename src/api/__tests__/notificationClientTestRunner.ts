import { NotificationApiError, NotificationClient } from '../notificationClient';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VALID_ITEM = {
  id: 'notification-1',
  companyId: 'company-a',
  sourceType: 'DOCUMENT',
  sourceId: 'doc-1',
  sourceVersion: 'v1',
  alertStage: 'D7',
  title: 'Documento vence em até 7 dias',
  message: 'Mensagem',
  severity: 'WARNING',
  dueDate: '2026-08-26',
  destinationTab: 'compliance',
  idempotencyKey: 'DOCUMENT:doc-1:v1:D7',
  status: 'UNREAD',
  createdAt: '2026-08-19T12:00:00.000Z',
  updatedAt: '2026-08-19T12:00:00.000Z',
};

export class NotificationClientTestRunner {
  static async runAllTests(): Promise<void> {
    const originalFetch = globalThis.fetch;
    try {
      let seenUrl = '';
      let seenInit: RequestInit | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        seenUrl = String(input);
        seenInit = init;
        return new Response(JSON.stringify({ items: [VALID_ITEM] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const items = await NotificationClient.list({ status: 'UNREAD', limit: 10 });
      assert(items.length === 1 && items[0].id === 'notification-1', 'notification list validation failed');
      assert(seenUrl === '/api/notifications?status=UNREAD&limit=10', `unexpected list URL ${seenUrl}`);
      assert(seenInit?.credentials === 'include', 'notification list must include credentials');
      assert(!seenUrl.includes('companyId') && !seenUrl.includes('userId'), 'client must not send browser identity authority');

      globalThis.fetch = (async () => new Response(JSON.stringify({ count: 3 }), { status: 200 })) as typeof fetch;
      assert(await NotificationClient.unreadCount() === 3, 'unread count mismatch');

      let actionUrl = '';
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        actionUrl = String(input);
        assert(init?.method === 'POST', 'notification action must be POST');
        return new Response(JSON.stringify({ item: { ...VALID_ITEM, status: 'READ', readAt: '2026-08-19T12:01:00.000Z' } }), { status: 200 });
      }) as typeof fetch;
      assert((await NotificationClient.markRead('notification 1')).status === 'READ', 'markRead response mismatch');
      assert(actionUrl === '/api/notifications/notification%201/read', `markRead URL mismatch ${actionUrl}`);

      globalThis.fetch = (async () => new Response(JSON.stringify({ item: { ...VALID_ITEM, status: 'DISMISSED', dismissedAt: '2026-08-19T12:02:00.000Z' } }), { status: 200 })) as typeof fetch;
      assert((await NotificationClient.dismiss('notification-1')).status === 'DISMISSED', 'dismiss response mismatch');

      globalThis.fetch = (async () => new Response(JSON.stringify({ updated: 4 }), { status: 200 })) as typeof fetch;
      assert(await NotificationClient.markAllRead() === 4, 'read-all response mismatch');

      globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
      let failedClosed = false;
      try {
        await NotificationClient.list();
      } catch (error) {
        failedClosed = error instanceof NotificationApiError && error.status === 403;
      }
      assert(failedClosed, 'client did not fail closed on API rejection');

      globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ ...VALID_ITEM, status: 'BROKEN' }] }), { status: 200 })) as typeof fetch;
      let malformedRejected = false;
      try {
        await NotificationClient.list();
      } catch {
        malformedRejected = true;
      }
      assert(malformedRejected, 'malformed notification payload was accepted');

      console.log('SECURITY-2I5A notification client PASS');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}
