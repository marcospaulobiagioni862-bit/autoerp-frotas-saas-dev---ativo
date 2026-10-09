import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  AdminUserAuthority,
  AdminUserConflictError,
  AdminUserForbiddenError,
  AdminUserNotFoundError,
  type AdminUserActor,
} from './adminUserAuthority';

class AdminUserValidationError extends Error {}

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const item = principal(req);
  if (!item) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(item.role || '').toUpperCase();
  const permissions = Array.isArray(item.permissions) ? item.permissions : [];
  if (role !== 'ADMIN' && !permissions.includes('*') && !permissions.includes('MANAGE_USERS')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return item;
}

function actorFrom(item: AuthenticatedPrincipal): AdminUserActor {
  return {
    companyId: item.companyId,
    userId: item.userId,
    name: item.name,
    role: item.role,
    permissions: Array.isArray(item.permissions) ? item.permissions : [],
  };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminUserValidationError();
  return value as Record<string, unknown>;
}

function parseActiveBody(value: unknown): boolean {
  const body = objectBody(value);
  if (Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'active')) {
    throw new AdminUserValidationError();
  }
  if (typeof body.active !== 'boolean') throw new AdminUserValidationError();
  return body.active;
}

function parsePermissionsBody(value: unknown): { role: string; permissions: string[] } {
  const body = objectBody(value);
  if (typeof body.role !== 'string' || body.role.trim() === '') throw new AdminUserValidationError();
  if (!Array.isArray(body.permissions) || !body.permissions.every((item) => typeof item === 'string')) {
    throw new AdminUserValidationError();
  }
  return { role: body.role.trim(), permissions: body.permissions as string[] };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof AdminUserValidationError) {
    res.status(400).json({ error: 'Invalid user administration request' });
    return;
  }
  if (error instanceof AdminUserForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof AdminUserNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof AdminUserConflictError) {
    res.status(409).json({ error: 'User administration conflict' });
    return;
  }
  console.error('AUTOERP_ADMIN_USER_API_FAILURE', error);
  res.status(500).json({ error: 'User administration operation failed' });
}

export function registerAdminUserRoutes(app: Express): void {
  app.get('/api/admin/users', async (req, res) => {
    const p = requirePrincipal(req, res);
    if (!p) return;
    try {
      res.json({ items: await AdminUserAuthority.list(actorFrom(p)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/admin/users/:id/status', async (req, res) => {
    const p = requirePrincipal(req, res);
    if (!p) return;
    try {
      const active = parseActiveBody(req.body);
      res.json({ item: await AdminUserAuthority.setActive(actorFrom(p), req.params.id, active) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/admin/users/:id/permissions', async (req, res) => {
    const p = requirePrincipal(req, res);
    if (!p) return;
    try {
      const { role, permissions } = parsePermissionsBody(req.body);
      res.json({ item: await AdminUserAuthority.setPermissions(actorFrom(p), req.params.id, role, permissions) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/admin/users', async (req, res) => {
    const p = requirePrincipal(req, res);
    if (!p) return;
    try {
      const { name, email, role, permissions, companyId } = req.body || {};
      if (!name || !email || !role) {
        res.status(400).json({ error: 'Nome, email e papel são obrigatórios' });
        return;
      }
      res.status(201).json({
        item: await AdminUserAuthority.provisionUser(actorFrom(p), {
          name,
          email,
          role,
          permissions,
          companyId: typeof companyId === 'string' ? companyId : undefined,
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}
