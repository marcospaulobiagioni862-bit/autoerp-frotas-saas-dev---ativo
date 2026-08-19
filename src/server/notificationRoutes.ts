import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';
import type { NotificationStatus } from '../types/entities';

const READABLE_STATUSES = new Set<NotificationStatus>(['UNREAD', 'READ', 'DISMISSED', 'ARCHIVED']);

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal?.companyId || !principal.userId) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  return principal;
}

function notificationVisibleToUser(recipientUserId: string | undefined, userId: string): boolean {
  return !recipientUserId || recipientUserId === userId;
}

function parseLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) return undefined;
  return parsed;
}

export function registerNotificationRoutes(app: Express): void {
  app.get('/api/notifications', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;

    const rawStatus = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    if (rawStatus && !READABLE_STATUSES.has(rawStatus as NotificationStatus)) {
      res.status(400).json({ error: 'Invalid notification status' });
      return;
    }
    const rawLimit = req.query.limit;
    const limit = parseLimit(rawLimit);
    if (rawLimit !== undefined && limit === undefined) {
      res.status(400).json({ error: 'Invalid notification limit' });
      return;
    }

    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getNotificationRepo().findAllByCompany(principal.companyId, {
          status: rawStatus as NotificationStatus | undefined,
          limit,
          recipientUserId: principal.userId,
        })
      );
      res.json({ items });
    } catch (error) {
      console.error('AUTOERP_NOTIFICATION_LIST_FAILURE', error);
      res.status(500).json({ error: 'Notification list failed' });
    }
  });

  app.get('/api/notifications/unread-count', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const count = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getNotificationRepo().countUnread(principal.companyId, principal.userId)
      );
      res.json({ count });
    } catch (error) {
      console.error('AUTOERP_NOTIFICATION_COUNT_FAILURE', error);
      res.status(500).json({ error: 'Notification count failed' });
    }
  });

  app.post('/api/notifications/:id/read', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const existing = await tx.getNotificationRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!existing || !notificationVisibleToUser(existing.recipientUserId, principal.userId)) return null;
        return await tx.getNotificationRepo().updateStatusForCompany(
          principal.companyId,
          existing.id,
          'READ',
          new Date().toISOString()
        );
      });
      if (!item) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ item });
    } catch (error) {
      console.error('AUTOERP_NOTIFICATION_READ_FAILURE', error);
      res.status(500).json({ error: 'Notification update failed' });
    }
  });

  app.post('/api/notifications/:id/dismiss', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const existing = await tx.getNotificationRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!existing || !notificationVisibleToUser(existing.recipientUserId, principal.userId)) return null;
        return await tx.getNotificationRepo().updateStatusForCompany(
          principal.companyId,
          existing.id,
          'DISMISSED',
          new Date().toISOString()
        );
      });
      if (!item) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ item });
    } catch (error) {
      console.error('AUTOERP_NOTIFICATION_DISMISS_FAILURE', error);
      res.status(500).json({ error: 'Notification update failed' });
    }
  });

  app.post('/api/notifications/read-all', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res);
    if (!principal) return;
    try {
      const updated = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getNotificationRepo().markAllRead(
          principal.companyId,
          principal.userId,
          new Date().toISOString()
        )
      );
      res.json({ updated });
    } catch (error) {
      console.error('AUTOERP_NOTIFICATION_READ_ALL_FAILURE', error);
      res.status(500).json({ error: 'Notification update failed' });
    }
  });
}
