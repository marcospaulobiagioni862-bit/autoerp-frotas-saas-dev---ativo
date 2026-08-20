import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  MaintenanceAuthorityService,
  MaintenanceConflictError,
  MaintenanceNotFoundError,
  MaintenanceValidationError,
  type CreatePartInput,
  type CreateSupplierInput,
  type CreateWorkOrderInput,
  type UpdatePartInput,
  type UpdateSupplierInput,
} from './maintenanceAuthority';

type MaintenanceAction = 'VIEW_MAINTENANCE' | 'MUTATE_MAINTENANCE';
const READ_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL']);
const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  'companyId', 'userId', 'userName', 'role', 'status', 'total', 'subtotalParts', 'subtotalServices',
  'subtotalLabor', 'accountPayableId', 'createdBy', 'createdAt', 'updatedAt', 'openedAt', 'startedAt',
  'completedAt', 'cancelledAt',
]);

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response, action: MaintenanceAction): AuthenticatedPrincipal | null {
  const actor = principal(req);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(actor.role || '').toUpperCase();
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  const explicit = permissions.includes('*') || permissions.includes(action);
  const roleAllowed = action === 'VIEW_MAINTENANCE' ? READ_ROLES.has(role) : WRITE_ROLES.has(role);
  if (!explicit && !roleAllowed) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return actor;
}

function rejectAuthorityFields(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MaintenanceValidationError('Invalid payload');
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (FORBIDDEN_AUTHORITY_FIELDS.has(key)) throw new MaintenanceValidationError(`Protected field: ${key}`);
  }
}

function requiredText(value: unknown, max = 1000): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new MaintenanceValidationError('Invalid text');
  return text;
}
function optionalText(value: unknown, max = 1000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!text || text.length > max) throw new MaintenanceValidationError('Invalid text');
  return text;
}
function nonNegative(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new MaintenanceValidationError('Invalid number');
  return n;
}
function positive(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new MaintenanceValidationError('Invalid number');
  return n;
}
function optionalNullableText(value: unknown, max = 1000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return optionalText(value, max)!;
}
function parseStatus(value: unknown): 'ACTIVE' | 'INACTIVE' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'ACTIVE' && value !== 'INACTIVE') throw new MaintenanceValidationError('Invalid status');
  return value;
}
function parseItems(value: unknown, kind: 'parts' | 'services' | 'labor'): any[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw new MaintenanceValidationError('Invalid work order items');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MaintenanceValidationError('Invalid item');
    const item = raw as Record<string, unknown>;
    if (kind === 'parts') {
      return {
        partId: optionalText(item.partId, 200),
        description: optionalText(item.description, 500),
        quantity: positive(item.quantity),
        unitCost: item.unitCost === undefined ? undefined : nonNegative(item.unitCost),
      };
    }
    if (kind === 'services') {
      return {
        serviceId: optionalText(item.serviceId, 200),
        description: requiredText(item.description, 500),
        quantity: positive(item.quantity),
        unitCost: nonNegative(item.unitCost),
      };
    }
    return {
      description: requiredText(item.description, 500),
      hours: positive(item.hours),
      hourlyRate: nonNegative(item.hourlyRate),
    };
  });
}
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}
function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof MaintenanceValidationError) { res.status(400).json({ error: 'Invalid maintenance request' }); return; }
  if (error instanceof MaintenanceNotFoundError || message.includes('não encontrado') || message.includes('não encontrada')) {
    res.status(404).json({ error: 'Not found' }); return;
  }
  if (error instanceof MaintenanceConflictError || isUniqueViolation(error) || message.includes('período financeiro') || message.includes('Período')) {
    res.status(409).json({ error: 'Maintenance command conflict' }); return;
  }
  if (message.startsWith('Acesso negado:')) { res.status(403).json({ error: 'Forbidden' }); return; }
  console.error('AUTOERP_MAINTENANCE_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Maintenance operation failed' });
}

export function registerMaintenanceRoutes(app: Express): void {
  app.get('/api/maintenance/work-orders', async (req, res) => {
    const actor = requirePrincipal(req, res, 'VIEW_MAINTENANCE'); if (!actor) return;
    try {
      const vehicleId = typeof req.query.vehicleId === 'string' && req.query.vehicleId.trim() ? req.query.vehicleId.trim() : undefined;
      res.json({ items: await MaintenanceAuthorityService.listWorkOrders(actor.companyId, vehicleId) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/maintenance/work-orders/:id', async (req, res) => {
    const actor = requirePrincipal(req, res, 'VIEW_MAINTENANCE'); if (!actor) return;
    try {
      const item = await MaintenanceAuthorityService.getWorkOrder(actor.companyId, req.params.id);
      if (!item) throw new MaintenanceNotFoundError('Ordem de serviço não encontrada');
      res.json({ item });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/maintenance/work-orders', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      const input: CreateWorkOrderInput = {
        number: requiredText(req.body?.number, 80),
        vehicleId: requiredText(req.body?.vehicleId, 200),
        supplierId: optionalText(req.body?.supplierId, 200),
        entryKm: nonNegative(req.body?.entryKm),
        description: requiredText(req.body?.description, 1000),
        diagnosis: optionalText(req.body?.diagnosis, 1000),
        notes: optionalText(req.body?.notes, 2000),
        parts: parseItems(req.body?.parts, 'parts'),
        services: parseItems(req.body?.services, 'services'),
        laborItems: parseItems(req.body?.laborItems, 'labor'),
        discount: req.body?.discount === undefined ? undefined : nonNegative(req.body.discount),
      };
      res.status(201).json({ item: await MaintenanceAuthorityService.createWorkOrder(actor, input) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/maintenance/work-orders/:id/start', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try { rejectAuthorityFields(req.body || {}); res.json({ item: await MaintenanceAuthorityService.startWorkOrder(actor, req.params.id) }); }
    catch (error) { sendError(res, error); }
  });

  app.post('/api/maintenance/work-orders/:id/complete', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      res.json({ item: await MaintenanceAuthorityService.completeWorkOrder(actor, req.params.id, {
        exitKm: nonNegative(req.body?.exitKm),
        categoryId: requiredText(req.body?.categoryId, 200),
        dueDate: requiredText(req.body?.dueDate, 10),
        installmentsCount: req.body?.installmentsCount === undefined ? undefined : Number(req.body.installmentsCount),
      }) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/maintenance/work-orders/:id/cancel', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      res.json({ item: await MaintenanceAuthorityService.cancelWorkOrder(actor, req.params.id, requiredText(req.body?.reason, 500)) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/maintenance/suppliers', async (req, res) => {
    const actor = requirePrincipal(req, res, 'VIEW_MAINTENANCE'); if (!actor) return;
    try { res.json({ items: await MaintenanceAuthorityService.listSuppliers(actor.companyId) }); }
    catch (error) { sendError(res, error); }
  });

  app.post('/api/maintenance/suppliers', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      const input: CreateSupplierInput = {
        name: requiredText(req.body?.name, 200), document: requiredText(req.body?.document, 64),
        tradeName: optionalText(req.body?.tradeName, 200), phone: optionalText(req.body?.phone, 80),
        email: optionalText(req.body?.email, 200), address: optionalText(req.body?.address, 500),
        category: requiredText(req.body?.category, 120), notes: optionalText(req.body?.notes, 1000),
      };
      res.status(201).json({ item: await MaintenanceAuthorityService.createSupplier(actor, input) });
    } catch (error) { sendError(res, error); }
  });

  app.patch('/api/maintenance/suppliers/:id', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      const input: UpdateSupplierInput = {
        name: req.body?.name === undefined ? undefined : requiredText(req.body.name, 200),
        document: req.body?.document === undefined ? undefined : requiredText(req.body.document, 64),
        tradeName: optionalNullableText(req.body?.tradeName, 200), phone: optionalNullableText(req.body?.phone, 80),
        email: optionalNullableText(req.body?.email, 200), address: optionalNullableText(req.body?.address, 500),
        category: req.body?.category === undefined ? undefined : requiredText(req.body.category, 120),
        status: parseStatus(req.body?.status), notes: optionalNullableText(req.body?.notes, 1000),
      };
      if (Object.values(input).every((value) => value === undefined)) throw new MaintenanceValidationError('No changes');
      res.json({ item: await MaintenanceAuthorityService.updateSupplier(actor, req.params.id, input) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/maintenance/parts', async (req, res) => {
    const actor = requirePrincipal(req, res, 'VIEW_MAINTENANCE'); if (!actor) return;
    try { res.json({ items: await MaintenanceAuthorityService.listParts(actor.companyId) }); }
    catch (error) { sendError(res, error); }
  });

  app.post('/api/maintenance/parts', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      const input: CreatePartInput = {
        code: requiredText(req.body?.code, 80), name: requiredText(req.body?.name, 200),
        description: optionalText(req.body?.description, 500), manufacturer: optionalText(req.body?.manufacturer, 200),
        category: requiredText(req.body?.category, 120), unit: requiredText(req.body?.unit, 30),
        currentCost: nonNegative(req.body?.currentCost), minimumStock: nonNegative(req.body?.minimumStock),
        currentStock: nonNegative(req.body?.currentStock),
      };
      res.status(201).json({ item: await MaintenanceAuthorityService.createPart(actor, input) });
    } catch (error) { sendError(res, error); }
  });

  app.patch('/api/maintenance/parts/:id', async (req, res) => {
    const actor = requirePrincipal(req, res, 'MUTATE_MAINTENANCE'); if (!actor) return;
    try {
      rejectAuthorityFields(req.body);
      const input: UpdatePartInput = {
        code: req.body?.code === undefined ? undefined : requiredText(req.body.code, 80),
        name: req.body?.name === undefined ? undefined : requiredText(req.body.name, 200),
        description: optionalNullableText(req.body?.description, 500), manufacturer: optionalNullableText(req.body?.manufacturer, 200),
        category: req.body?.category === undefined ? undefined : requiredText(req.body.category, 120),
        unit: req.body?.unit === undefined ? undefined : requiredText(req.body.unit, 30),
        currentCost: req.body?.currentCost === undefined ? undefined : nonNegative(req.body.currentCost),
        minimumStock: req.body?.minimumStock === undefined ? undefined : nonNegative(req.body.minimumStock),
        currentStock: req.body?.currentStock === undefined ? undefined : nonNegative(req.body.currentStock),
        status: parseStatus(req.body?.status),
      };
      if (Object.values(input).every((value) => value === undefined)) throw new MaintenanceValidationError('No changes');
      res.json({ item: await MaintenanceAuthorityService.updatePart(actor, req.params.id, input) });
    } catch (error) { sendError(res, error); }
  });
}
