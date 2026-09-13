import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { MaintenanceArchiveAuthority } from './maintenanceArchiveAuthority';
import { MaintenanceConflictError, MaintenanceNotFoundError, MaintenanceValidationError } from './maintenanceAuthority';

type MutableRequest = Request & { principal?: AuthenticatedPrincipal };
const WRITE = new Set(['ADMIN','MANAGER','OPERATIONAL']);

function actor(req: Request, res: Response): AuthenticatedPrincipal | null {
  const principal = (req as MutableRequest).principal;
  if (!principal) { res.status(401).json({ error: 'Unauthorized: Authentication required' }); return null; }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (!(permissions.includes('*') || permissions.includes('MUTATE_MAINTENANCE') || WRITE.has(role))) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function send(res: Response, error: unknown): void {
  if (error instanceof MaintenanceValidationError) { res.status(400).json({ error: 'Invalid maintenance request' }); return; }
  if (error instanceof MaintenanceNotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
  if (error instanceof MaintenanceConflictError) { res.status(409).json({ error: 'Maintenance command conflict' }); return; }
  console.error('AUTOERP_MAINTENANCE_ARCHIVE_FAILURE', error);
  res.status(500).json({ error: 'Maintenance operation failed' });
}

export function registerMaintenanceArchiveRoutes(app: Express): void {
  app.post('/api/maintenance/work-orders/:id/archive', async (req, res) => {
    const principal = actor(req, res);
    if (!principal) return;
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
      const unexpected = Object.keys(body).filter((key) => key !== 'reason');
      if (unexpected.length) throw new MaintenanceValidationError('Invalid archive payload');
      res.json({ item: await MaintenanceArchiveAuthority.archiveWorkOrder(principal, req.params.id, body.reason) });
    } catch (error) {
      send(res, error);
    }
  });
}
