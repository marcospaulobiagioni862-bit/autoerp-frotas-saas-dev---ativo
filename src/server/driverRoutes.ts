import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';
import type { Driver } from '../types/entities';
import { AuditAction, DocumentStatus, DriverStatus } from '../types/enums';
import { hasDriverHealthPermission } from '../shared/security/driverHealthAuthorization';

type DriverAction = 'VIEW_DRIVER' | 'CREATE_DRIVER' | 'EDIT_DRIVER' | 'CHANGE_DRIVER_STATUS' | 'ARCHIVE_DRIVER';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const STATUS_VALUES = new Set(Object.values(DriverStatus));
const MUTABLE_STATUS_VALUES = new Set([
  DriverStatus.ACTIVE,
  DriverStatus.INACTIVE,
  DriverStatus.PENDING,
  DriverStatus.PENDING_DOCS,
  DriverStatus.BLOCKED,
]);

class DriverValidationError extends Error {}
class DriverConflictError extends Error {}
class DriverNotFoundError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasDriverPermission(principal: AuthenticatedPrincipal, action: DriverAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  if (action === 'VIEW_DRIVER') return true;
  return DEFAULT_WRITE_ROLES.has(role);
}

function requireDriverPrincipal(req: Request, res: Response, action: DriverAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasDriverPermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function requiredText(value: unknown, field: string, minLength = 1): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean.length < minLength) throw new DriverValidationError(`Invalid ${field}`);
  return clean;
}

function normalizePhone(value: unknown, field: string, required = true): string | undefined {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!digits) {
    if (required) throw new DriverValidationError(`Invalid ${field}`);
    return undefined;
  }
  const localLength = digits.length === 10 || digits.length === 11;
  const countryLength = (digits.length === 12 || digits.length === 13) && digits.startsWith('55');
  if ((!localLength && !countryLength) || /^(\d)\1+$/.test(digits)) {
    throw new DriverValidationError(`Invalid ${field}`);
  }
  return digits;
}

function normalizeCpf(value: unknown): string {
  const cpf = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) throw new DriverValidationError('Invalid cpf');
  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  if (digit(9) !== Number(cpf[9]) || digit(10) !== Number(cpf[10])) throw new DriverValidationError('Invalid cpf');
  return cpf;
}

function normalizeCnh(value: unknown): string {
  const cnh = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!/^\d{11}$/.test(cnh) || /^(\d)\1{10}$/.test(cnh)) throw new DriverValidationError('Invalid cnh');
  const digits = [...cnh].map(Number);

  let firstSum = 0;
  for (let i = 0; i < 9; i++) firstSum += digits[i] * (9 - i);
  let firstDigit = firstSum % 11;
  let discount = 0;
  if (firstDigit === 10) {
    firstDigit = 0;
    discount = 2;
  }

  let secondSum = 0;
  for (let i = 0; i < 9; i++) secondSum += digits[i] * (i + 1);
  let secondDigit = (secondSum % 11) - discount;
  if (secondDigit < 0) secondDigit += 11;
  if (secondDigit >= 10) secondDigit = 0;

  if (digits[9] !== firstDigit || digits[10] !== secondDigit) {
    throw new DriverValidationError('Invalid cnh');
  }
  return cnh;
}

function normalizeIsoDate(value: unknown, field: string, allowFuture: boolean): string {
  const date = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DriverValidationError(`Invalid ${field}`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DriverValidationError(`Invalid ${field}`);
  }
  if (!allowFuture) {
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) throw new DriverValidationError(`Invalid ${field}`);
  }
  return date;
}

function evaluateCnhStatus(expiration: string): DocumentStatus {
  const end = new Date(`${expiration}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.ceil((end - today) / 86_400_000);
  if (days < 0) return DocumentStatus.EXPIRED;
  if (days <= 30) return DocumentStatus.EXPIRING_SOON;
  return DocumentStatus.VALID;
}

function addressFrom(value: unknown, fallback?: Driver['address']): Driver['address'] {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    street: optionalText(input.street) ?? fallback?.street ?? '',
    number: optionalText(input.number) ?? fallback?.number ?? '',
    complement: optionalText(input.complement) ?? fallback?.complement,
    neighborhood: optionalText(input.neighborhood) ?? fallback?.neighborhood ?? '',
    city: optionalText(input.city) ?? fallback?.city ?? '',
    state: optionalText(input.state)?.toUpperCase() ?? fallback?.state ?? '',
    zipCode: optionalText(input.zipCode)?.replace(/\D/g, '') ?? fallback?.zipCode ?? '',
  };
}

function platformsFrom(value: unknown, fallback: string[] = []): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) throw new DriverValidationError('Invalid appPlatforms');
  return [...new Set(value.map((item) => requiredText(item, 'appPlatform')).map((item) => item.slice(0, 60)))];
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

function sendDriverError(res: Response, error: unknown): void {
  if (error instanceof DriverValidationError) {
    res.status(400).json({ error: 'Invalid driver request' });
    return;
  }
  if (error instanceof DriverConflictError || isUniqueViolation(error)) {
    res.status(409).json({ error: 'Driver conflict' });
    return;
  }
  if (error instanceof DriverNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  console.error('AUTOERP_DRIVER_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Driver operation failed' });
}

function auditState(driver: Driver): string {
  const { healthAndEmergency: _health, ...core } = driver;
  return JSON.stringify(core);
}

function healthPermission(principal: AuthenticatedPrincipal, action: 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH'): boolean {
  return hasDriverHealthPermission(action, {
    userId: principal.userId,
    role: principal.role,
    active: true,
    companyId: principal.companyId,
    permissions: principal.permissions,
  });
}

export function registerDriverRoutes(app: Express): void {
  app.get('/api/drivers', async (req: Request, res: Response) => {
    const principal = requireDriverPrincipal(req, res, 'VIEW_DRIVER');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) =>
        (await tx.getDriverRepo().findAllByCompany(principal.companyId)).filter((driver) => !driver.isArchived)
      );
      res.json({ items });
    } catch (error) {
      sendDriverError(res, error);
    }
  });

  app.get('/api/drivers/:id', async (req: Request, res: Response) => {
    const principal = requireDriverPrincipal(req, res, 'VIEW_DRIVER');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getDriverRepo().findByIdForCompany(principal.companyId, req.params.id)
      );
      if (!item || item.isArchived) throw new DriverNotFoundError();
      res.json({ item });
    } catch (error) {
      sendDriverError(res, error);
    }
  });

  app.post('/api/drivers', async (req: Request, res: Response) => {
    const principal = requireDriverPrincipal(req, res, 'CREATE_DRIVER');
    if (!principal) return;
    try {
      const fullName = requiredText(req.body?.fullName, 'fullName', 3);
      const cpf = normalizeCpf(req.body?.cpf);
      const cnhNumber = normalizeCnh(req.body?.cnhNumber);
      const birthDate = normalizeIsoDate(req.body?.birthDate, 'birthDate', false);
      const phone = normalizePhone(req.body?.phone, 'phone')!;
      const cnhExpiration = normalizeIsoDate(req.body?.cnhExpiration, 'cnhExpiration', true);
      const cnhState = evaluateCnhStatus(cnhExpiration);
      const now = new Date().toISOString();
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const repo = tx.getDriverRepo();
        if (await repo.findByCpf(principal.companyId, cpf)) throw new DriverConflictError();
        if (await repo.findByCnh(principal.companyId, cnhNumber)) throw new DriverConflictError();
        const created = await repo.create({
          id: randomUUID(),
          companyId: principal.companyId,
          fullName,
          cpf,
          rg: optionalText(req.body?.rg),
          birthDate,
          phone,
          whatsapp: normalizePhone(req.body?.whatsapp, 'whatsapp', false) || phone,
          email: optionalText(req.body?.email)?.toLowerCase(),
          address: addressFrom(req.body?.address),
          cnhNumber,
          cnhCategory: optionalText(req.body?.cnhCategory)?.toUpperCase() || '',
          cnhExpiration,
          cnhStatus: cnhState,
          appPlatforms: platformsFrom(req.body?.appPlatforms),
          status: cnhState === DocumentStatus.EXPIRED ? DriverStatus.BLOCKED : DriverStatus.ACTIVE,
          photoUrl: optionalText(req.body?.photoUrl),
          notes: optionalText(req.body?.notes),
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Driver', entityId: created.id,
          action: AuditAction.CREATE, newState: auditState(created), userId: principal.userId,
          userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendDriverError(res, error);
    }
  });

  app.patch('/api/drivers/:id', async (req: Request, res: Response) => {
    const principal = requireDriverPrincipal(req, res, 'EDIT_DRIVER');
    if (!principal) return;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const forbidden = ['companyId', 'userId', 'userName', 'role', 'status', 'isArchived', 'currentVehicleId', 'currentContractId', 'healthAndEmergency'];
    if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      res.status(400).json({ error: 'Invalid driver authority surface' });
      return;
    }
    const editable = ['fullName','cpf','rg','birthDate','phone','whatsapp','email','address','cnhNumber','cnhCategory','cnhExpiration','appPlatforms','photoUrl','notes'];
    if (!editable.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
      res.status(400).json({ error: 'Invalid driver request' });
      return;
    }
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const repo = tx.getDriverRepo();
        const existing = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!existing || existing.isArchived) throw new DriverNotFoundError();
        const updated: Driver = {
          ...existing,
          fullName: body.fullName === undefined ? existing.fullName : requiredText(body.fullName, 'fullName', 3),
          cpf: body.cpf === undefined ? existing.cpf : normalizeCpf(body.cpf),
          rg: body.rg === undefined ? existing.rg : optionalText(body.rg),
          birthDate: body.birthDate === undefined ? existing.birthDate : normalizeIsoDate(body.birthDate, 'birthDate', false),
          phone: body.phone === undefined ? existing.phone : normalizePhone(body.phone, 'phone')!,
          whatsapp: body.whatsapp === undefined ? existing.whatsapp : (normalizePhone(body.whatsapp, 'whatsapp', false) || (body.phone === undefined ? existing.phone : normalizePhone(body.phone, 'phone')!)),
          email: body.email === undefined ? existing.email : optionalText(body.email)?.toLowerCase(),
          address: body.address === undefined ? existing.address : addressFrom(body.address, existing.address),
          cnhNumber: body.cnhNumber === undefined ? existing.cnhNumber : normalizeCnh(body.cnhNumber),
          cnhCategory: body.cnhCategory === undefined ? existing.cnhCategory : (optionalText(body.cnhCategory)?.toUpperCase() || ''),
          cnhExpiration: body.cnhExpiration === undefined ? existing.cnhExpiration : normalizeIsoDate(body.cnhExpiration, 'cnhExpiration', true),
          appPlatforms: platformsFrom(body.appPlatforms, existing.appPlatforms),
          photoUrl: body.photoUrl === undefined ? existing.photoUrl : optionalText(body.photoUrl),
          notes: body.notes === undefined ? existing.notes : optionalText(body.notes),
          updatedAt: new Date().toISOString(),
        };
        const cpfDuplicate = await repo.findByCpf(principal.companyId, updated.cpf);
        if (cpfDuplicate && cpfDuplicate.id !== existing.id) throw new DriverConflictError();
        const cnhDuplicate = await repo.findByCnh(principal.companyId, updated.cnhNumber);
        if (cnhDuplicate && cnhDuplicate.id !== existing.id) throw new DriverConflictError();
        const saved = await repo.updateForCompany(principal.companyId, existing.id, updated);
        if (!saved) throw new DriverNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Driver', entityId: existing.id,
          action: AuditAction.UPDATE, previousState: auditState(existing), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: updated.updatedAt,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendDriverError(res, error);
    }
  });

  app.patch('/api/drivers/:id/status', async (req: Request, res: Response) => {
    const principal = requireDriverPrincipal(req, res, 'CHANGE_DRIVER_STATUS');
    if (!principal) return;
    const rawStatus = typeof req.body?.status === 'string' ? req.body.status : '';
    const reason = optionalText(req.body?.reason);
    if (!STATUS_VALUES.has(rawStatus as DriverStatus) || !MUTABLE_STATUS_VALUES.has(rawStatus as DriverStatus)) {
      res.status(400).json({ error: 'Invalid driver status' });
      return;
    }
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const repo = tx.getDriverRepo();
        const existing = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!existing || existing.isArchived) throw new DriverNotFoundError();
        if (existing.status === rawStatus) return existing;
        const now = new Date().toISOString();
        const statusNote = reason ? `[Status ${rawStatus}]: ${reason}` : undefined;
        const updated: Driver = {
          ...existing,
          status: rawStatus as DriverStatus,
          notes: statusNote ? `${existing.notes || ''}\n${statusNote}`.trim() : existing.notes,
          updatedAt: now,
        };
        const saved = await repo.updateForCompany(principal.companyId, existing.id, updated);
        if (!saved) throw new DriverNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Driver', entityId: existing.id,
          action: AuditAction.UPDATE,
          previousState: JSON.stringify({ status: existing.status }),
          newState: JSON.stringify({ status: saved.status, reason }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendDriverError(res, error);
    }
  });

  app.post('/api/drivers/:id/archive', async (req: Request, res: Response) => {
    const principal = requireDriverPrincipal(req, res, 'ARCHIVE_DRIVER');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const repo = tx.getDriverRepo();
        const existing = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!existing) throw new DriverNotFoundError();
        if (existing.isArchived) return existing;
        const updated: Driver = {
          ...existing,
          status: DriverStatus.ARCHIVED,
          isArchived: true,
          updatedAt: new Date().toISOString(),
        };
        const saved = await repo.updateForCompany(principal.companyId, existing.id, updated);
        if (!saved) throw new DriverNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Driver', entityId: existing.id,
          action: AuditAction.ARCHIVE,
          previousState: JSON.stringify({ status: existing.status, isArchived: existing.isArchived }),
          newState: JSON.stringify({ status: saved.status, isArchived: saved.isArchived }),
          userId: principal.userId, userName: principal.name, timestamp: updated.updatedAt,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendDriverError(res, error);
    }
  });

  app.get('/api/drivers/:id/health', async (req: Request, res: Response) => {
    const principal = principalFrom(req);
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }
    if (!healthPermission(principal, 'VIEW_DRIVER_HEALTH')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const driverId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!driverId) {
      res.status(400).json({ error: 'Invalid driver health request' });
      return;
    }
    try {
      const health = await UnitOfWork.run(principal.companyId, async (tx) => {
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!driver || driver.isArchived) throw new DriverNotFoundError();
        const profile = await tx.getDriverHealthRepo().findByDriverId(driverId);
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'DriverHealthSecurity', entityId: driverId,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({ event: 'VIEW_DRIVER_HEALTH' }), timestamp: new Date().toISOString(),
        });
        if (!profile) return {};
        const { id: _id, companyId: _companyId, driverId: _driverId, createdAt: _createdAt, updatedAt: _updatedAt, ...safe } = profile;
        return safe;
      });
      res.json({ health });
    } catch (error) {
      if (error instanceof DriverNotFoundError) res.status(404).json({ error: 'Not found' });
      else res.status(400).json({ error: 'Driver health request failed' });
    }
  });

  app.put('/api/drivers/:id/health', async (req: Request, res: Response) => {
    const principal = principalFrom(req);
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }
    if (!healthPermission(principal, 'EDIT_DRIVER_HEALTH')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const driverId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const raw = req.body?.health;
    if (!driverId || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
      res.status(400).json({ error: 'Invalid driver health request' });
      return;
    }
    const allowed = ['bloodType','allergies','relevantConditions','continuousMedications','emergencyContactName','emergencyContactRelationship','emergencyContactPhone','emergencyNotes'] as const;
    const health: Record<string, string> = {};
    for (const key of allowed) {
      const value = (raw as Record<string, unknown>)[key];
      if (value !== undefined) {
        if (typeof value !== 'string') {
          res.status(400).json({ error: 'Invalid driver health request' });
          return;
        }
        health[key] = value;
      }
    }
    try {
      const saved = await UnitOfWork.run(principal.companyId, async (tx) => {
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!driver || driver.isArchived) throw new DriverNotFoundError();
        const existing = await tx.getDriverHealthRepo().findByDriverId(driverId);
        const now = new Date().toISOString();
        const profile = await tx.getDriverHealthRepo().upsert({
          id: existing?.id || randomUUID(),
          companyId: principal.companyId,
          driverId,
          ...(existing || {}),
          ...health,
          lastUpdateDate: now,
          responsibleUser: principal.name,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'DriverHealthSecurity', entityId: driverId,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({ event: 'EDIT_DRIVER_HEALTH', fieldsChanged: Object.keys(health) }), timestamp: now,
        });
        return profile;
      });
      const { id: _id, companyId: _companyId, driverId: _driverId, createdAt: _createdAt, updatedAt: _updatedAt, ...safe } = saved;
      res.json({ health: safe });
    } catch (error) {
      if (error instanceof DriverNotFoundError) res.status(404).json({ error: 'Not found' });
      else res.status(400).json({ error: 'Driver health request failed' });
    }
  });
}
