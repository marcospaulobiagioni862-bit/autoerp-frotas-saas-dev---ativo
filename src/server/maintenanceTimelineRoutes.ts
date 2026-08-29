import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  MaintenanceConflictError,
  MaintenanceNotFoundError,
  MaintenanceValidationError,
} from './maintenanceAuthority';
import { registerMaintenanceSlaRoutes } from './maintenanceSlaRoutes';
import {
  MaintenanceTimelineAuthorityService,
  type MaintenanceTimelineEventType,
} from './maintenanceTimelineAuthority';

type Action = 'VIEW_MAINTENANCE' | 'MUTATE_MAINTENANCE';
const READ = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER', 'OPERATIONAL', 'READONLY']);
const WRITE = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL']);
const PROTECTED = new Set([
  'companyId', 'company_id', 'userId', 'actorUserId', 'actor_user_id', 'actorName', 'actor_name',
  'occurredAt', 'occurred_at', 'createdAt', 'created_at', 'workOrderId', 'work_order_id',
]);

function actor(req: Request, res: Response, action: Action): AuthenticatedPrincipal | null {
  const principal = (req as Request & { principal?: AuthenticatedPrincipal }).principal;
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  const ok = permissions.includes('*') || permissions.includes(action) ||
    (action === 'VIEW_MAINTENANCE' ? READ.has(role) : WRITE.has(role));
  if (!ok) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function rejectProtected(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MaintenanceValidationError('Invalid payload');
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (PROTECTED.has(key)) throw new MaintenanceValidationError(`Protected field: ${key}`);
  }
}

function requiredText(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new MaintenanceValidationError('Invalid text');
  return text;
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredText(String(value), max);
}

function send(res: Response, error: unknown): void {
  if (error instanceof MaintenanceValidationError) {
    res.status(400).json({ error: 'Invalid maintenance timeline request' });
    return;
  }
  if (error instanceof MaintenanceNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof MaintenanceConflictError) {
    res.status(409).json({ error: 'Maintenance timeline conflict' });
    return;
  }
  console.error('AUTOERP_MAINTENANCE_TIMELINE_FAILURE', error);
  res.status(500).json({ error: 'Maintenance timeline operation failed' });
}

export function registerMaintenanceTimelineRoutes(app: Express): void {
  registerMaintenanceSlaRoutes(app);

  app.get('/api/maintenance/work-orders/:id/timeline', async (req, res) => {
    const principal = actor(req, res, 'VIEW_MAINTENANCE');
    if (!principal) return;
    try {
      res.json(await MaintenanceTimelineAuthorityService.list(principal.companyId, req.params.id));
    } catch (error) {
      send(res, error);
    }
  });

  app.post('/api/maintenance/work-orders/:id/timeline/events', async (req, res) => {
    const principal = actor(req, res, 'MUTATE_MAINTENANCE');
    if (!principal) return;
    try {
      rejectProtected(req.body);
      const result = await MaintenanceTimelineAuthorityService.register(principal, req.params.id, {
        eventType: requiredText(req.body?.eventType, 80).toUpperCase() as MaintenanceTimelineEventType,
        idempotencyKey: requiredText(req.body?.idempotencyKey, 200),
        note: optionalText(req.body?.note, 2000),
      });
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      send(res, error);
    }
  });
}
