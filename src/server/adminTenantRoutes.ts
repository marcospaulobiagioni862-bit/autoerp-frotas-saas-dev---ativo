import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  AdminTenantAuthority,
  AdminTenantForbiddenError,
  AdminTenantNotFoundError,
  AdminTenantValidationError,
  type AdminTenantActor,
  type AdminTenantProfilePatch,
} from './adminTenantAuthority';

const ALLOWED_PATCH_KEYS = new Set([
  'companyName',
  'timezone',
  'currency',
  'maxVehiclesLimit',
  'maxDriversLimit',
]);

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requireAdmin(req: Request, res: Response): AuthenticatedPrincipal | null {
  const item = principal(req);
  if (!item) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (String(item.role || '').toUpperCase() !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return item;
}

function actorFrom(item: AuthenticatedPrincipal): AdminTenantActor {
  return {
    companyId: item.companyId,
    userId: item.userId,
    name: item.name,
    role: item.role,
  };
}

function parsePatch(value: unknown): AdminTenantProfilePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminTenantValidationError('Payload inválido');
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !ALLOWED_PATCH_KEYS.has(key))) {
    throw new AdminTenantValidationError('Campos administrativos não permitidos');
  }
  return body as AdminTenantProfilePatch;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof AdminTenantForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof AdminTenantNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof AdminTenantValidationError) {
    res.status(400).json({ error: 'Invalid tenant profile request' });
    return;
  }
  console.error('AUTOERP_ADMIN_TENANT_API_FAILURE', error);
  res.status(500).json({ error: 'Tenant profile operation failed' });
}

export function registerAdminTenantRoutes(app: Express): void {
  app.get('/api/admin/tenant-profile', async (req, res) => {
    const p = requireAdmin(req, res);
    if (!p) return;
    try {
      res.json({ profile: await AdminTenantAuthority.get(actorFrom(p)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/admin/tenant-profile', async (req, res) => {
    const p = requireAdmin(req, res);
    if (!p) return;
    try {
      const patch = parsePatch(req.body);
      res.json({ profile: await AdminTenantAuthority.update(actorFrom(p), patch) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
