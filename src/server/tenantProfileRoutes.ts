import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  TenantProfileAuthority,
  TenantProfileForbiddenError,
  TenantProfileNotFoundError,
  TenantProfileValidationError,
  type TenantProfileActor,
} from './tenantProfileAuthority';

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requireAdmin(req: Request, res: Response): AuthenticatedPrincipal | null {
  const item = principal(req);
  if (!item) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(item.role || '').toUpperCase();
  const permissions = Array.isArray(item.permissions) ? item.permissions : [];
  if (role !== 'ADMIN' && !permissions.includes('*') && !permissions.includes('MANAGE_TENANT')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return item;
}

function actor(item: AuthenticatedPrincipal): TenantProfileActor {
  return {
    companyId: item.companyId,
    userId: item.userId,
    name: item.name,
    role: item.role,
    permissions: Array.isArray(item.permissions) ? item.permissions : [],
  };
}

function updateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TenantProfileValidationError();
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set(['companyName', 'timezone', 'currency', 'maxVehiclesLimit', 'maxDriversLimit', 'logoUrl']);
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => allowed.has(key))) {
    throw new TenantProfileValidationError();
  }
  return body;
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof TenantProfileValidationError) {
    res.status(400).json({ error: 'Invalid tenant profile request' });
    return;
  }
  if (error instanceof TenantProfileForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof TenantProfileNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  console.error('AUTOERP_TENANT_PROFILE_API_FAILURE', error);
  res.status(500).json({ error: 'Tenant profile operation failed' });
}

export function registerTenantProfileRoutes(app: Express): void {
  app.get('/api/tenant/branding', async (req, res) => {
    const item = principal(req);
    if (!item) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }
    try {
      res.json({ item: await TenantProfileAuthority.getBranding(item.companyId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/admin/tenant-profile', async (req, res) => {
    const item = requireAdmin(req, res);
    if (!item) return;
    try {
      res.json({ item: await TenantProfileAuthority.get(actor(item)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/admin/tenant-profile', async (req, res) => {
    const item = requireAdmin(req, res);
    if (!item) return;
    try {
      res.json({ item: await TenantProfileAuthority.update(actor(item), updateBody(req.body)) });
    } catch (error) {
      sendError(res, error);
    }
  });
}

