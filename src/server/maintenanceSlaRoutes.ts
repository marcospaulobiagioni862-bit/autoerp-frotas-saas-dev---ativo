import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  MaintenanceConflictError,
  MaintenanceNotFoundError,
  MaintenanceValidationError,
} from './maintenanceAuthority';
import { MaintenanceSlaAuthorityService } from './maintenanceSlaAuthority';

type Action = 'VIEW_MAINTENANCE' | 'MUTATE_MAINTENANCE';
const READ = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER', 'OPERATIONAL', 'READONLY']);
const WRITE = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL']);
const PROTECTED = new Set([
  'companyId', 'company_id', 'userId', 'user_id', 'actorUserId', 'actor_user_id',
  'actorName', 'actor_name', 'occurredAt', 'occurred_at', 'createdAt', 'created_at',
  'workOrderId', 'work_order_id', 'status', 'elapsedMinutes', 'differenceMinutes', 'progressRatio',
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

function send(res: Response, error: unknown): void {
  if (error instanceof MaintenanceValidationError) {
    res.status(400).json({ error: 'Invalid maintenance SLA request' });
    return;
  }
  if (error instanceof MaintenanceNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof MaintenanceConflictError) {
    res.status(409).json({ error: 'Maintenance SLA conflict' });
    return;
  }
  console.error('AUTOERP_MAINTENANCE_SLA_FAILURE', error);
  res.status(500).json({ error: 'Maintenance SLA operation failed' });
}

export function registerMaintenanceSlaRoutes(app: Express): void {
  app.get('/api/maintenance/work-orders/:id/sla', async (req, res) => {
    const principal = actor(req, res, 'VIEW_MAINTENANCE');
    if (!principal) return;
    try {
      res.json(await MaintenanceSlaAuthorityService.get(principal.companyId, req.params.id));
    } catch (error) {
      send(res, error);
    }
  });

  app.put('/api/maintenance/work-orders/:id/sla', async (req, res) => {
    const principal = actor(req, res, 'MUTATE_MAINTENANCE');
    if (!principal) return;
    try {
      rejectProtected(req.body);
      const allowed = new Set(['expectedDurationMinutes']);
      for (const key of Object.keys(req.body as Record<string, unknown>)) {
        if (!allowed.has(key)) throw new MaintenanceValidationError(`Unexpected field: ${key}`);
      }
      if (!Object.prototype.hasOwnProperty.call(req.body, 'expectedDurationMinutes')) {
        throw new MaintenanceValidationError('Missing expectedDurationMinutes');
      }
      res.json(await MaintenanceSlaAuthorityService.setExpectedDuration(
        principal,
        req.params.id,
        req.body.expectedDurationMinutes,
      ));
    } catch (error) {
      send(res, error);
    }
  });

  app.post('/api/maintenance/work-orders/:id/sla/delay-reasons', async (req, res) => {
    const principal = actor(req, res, 'MUTATE_MAINTENANCE');
    if (!principal) return;
    try {
      rejectProtected(req.body);
      const allowed = new Set(['reason']);
      for (const key of Object.keys(req.body as Record<string, unknown>)) {
        if (!allowed.has(key)) throw new MaintenanceValidationError(`Unexpected field: ${key}`);
      }
      const result = await MaintenanceSlaAuthorityService.addDelayReason(principal, req.params.id, req.body.reason);
      res.status(201).json(result);
    } catch (error) {
      send(res, error);
    }
  });
}
