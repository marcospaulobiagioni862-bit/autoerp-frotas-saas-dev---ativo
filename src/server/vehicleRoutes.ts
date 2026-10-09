import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { recordVehicleKm, VehicleKmError } from './vehicleKmAuthority';
import { canManuallyTransitionVehicleStatus } from '../domain/fleet/vehicleStatusPolicy';
import { AuditAction, VEHICLE_CATEGORIES, VehicleStatus } from '../types/enums';
import type { Vehicle } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import { registerDriverRoutes } from './driverRoutes';
import { registerContractRoutes } from './contractRoutes';
import { registerAttachmentRoutes } from './attachmentRoutes';
import { registerDocumentRoutes } from './documentRoutes';
import { registerDocumentAiRoutes } from './documentAiRoutes';
import { registerReportAiSuggestionRoutes } from './reportAiSuggestionRoutes';
import { registerWhatsappRoutes } from './whatsappRoutes';
import { registerContractTemplateRoutes } from './contractTemplateRoutes';
import { registerContractExecutionRoutes } from './contractExecutionRoutes';
import { registerRecurringRoutes } from './recurringRoutes';
import { registerVehicleCrlvApplyRoutes } from './vehicleCrlvApplyRoutes';
import { registerVehicleLifecycleRoutes } from './vehicleLifecycleRoutes';
import { registerVehicleInspectionRoutes } from './vehicleInspectionRoutes';
import { registerCompanyProfileRoutes } from './companyProfileRoutes';
import { MaintenancePlanTemplateAuthority } from './maintenancePlanTemplateAuthority';
import { findVehicleIdentityConflict, normalizeVehicleIdentity, vehicleIdentityConflictMessage } from './vehicleIdentityGuard';
import { getVehicleDetailsSummary, VehicleDetailsNotFoundError } from './vehicleDetailsAuthority';

type VehicleAction = 'VIEW_VEHICLE' | 'CREATE_VEHICLE' | 'EDIT_VEHICLE' | 'CHANGE_VEHICLE_STATUS' | 'RECORD_VEHICLE_KM' | 'RECORD_KM' | 'ARCHIVE_VEHICLE';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const VEHICLE_CATEGORY_VALUES = new Set<string>(VEHICLE_CATEGORIES);

class VehicleValidationError extends Error {}
class VehicleConflictError extends Error {}
class VehicleNotFoundError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasVehiclePermission(principal: AuthenticatedPrincipal, action: VehicleAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  if (role === 'ADMIN') return true;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*')) return true;
  if (action === 'RECORD_VEHICLE_KM' || action === 'RECORD_KM') {
    return permissions.includes('RECORD_KM') || permissions.includes('RECORD_VEHICLE_KM');
  }
  return permissions.includes(action);
}

function requireVehiclePrincipal(req: Request, res: Response, action: VehicleAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasVehiclePermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function normalizePlate(value: unknown): string {
  const plate = typeof value === 'string' ? value.toUpperCase().trim().replace(/[^A-Z0-9]/g, '') : '';
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) throw new VehicleValidationError('Invalid vehicle plate');
  return plate;
}

function requiredText(value: unknown, field: string): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) throw new VehicleValidationError(`Missing ${field}`);
  return clean;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function normalizeVehicleCategory(value: unknown, fallback = 'Hatch / Sedan Compacto'): string {
  const category = optionalText(value) || fallback;
  if (!VEHICLE_CATEGORY_VALUES.has(category)) throw new VehicleValidationError('Invalid vehicle category');
  return category;
}

function requiredNonNegative(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new VehicleValidationError(`Invalid ${field}`);
  return numberValue;
}

function optionalNonNegative(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredNonNegative(value, field);
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  const parsed = optionalNonNegative(value, field);
  if (parsed === undefined) return undefined;
  if (!Number.isInteger(parsed)) throw new VehicleValidationError(`Invalid ${field}`);
  return parsed;
}

function requiredNonNegativeInteger(value: unknown, field: string): number {
  const parsed = optionalNonNegativeInteger(value, field);
  if (parsed === undefined) throw new VehicleValidationError(`Missing ${field}`);
  return parsed;
}

function requiredPositive(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new VehicleValidationError(`Invalid ${field}`);
  return parsed;
}

function requiredVehicleYear(value: unknown, field: string): number {
  const year = requiredNonNegativeInteger(value, field);
  const maxYear = new Date().getFullYear() + 1;
  if (year < 1900 || year > maxYear) throw new VehicleValidationError(`Invalid ${field}`);
  return year;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

function sendVehicleError(res: Response, error: unknown): void {
  if (error instanceof VehicleKmError) { res.status(error.kind === 'NOT_FOUND' ? 404 : error.kind === 'TERMINAL' ? 409 : 400).json({ error: error.message }); return; }
  if (error instanceof VehicleValidationError) { res.status(400).json({ error: error.message || 'Invalid vehicle request' }); return; }
  if (error instanceof VehicleConflictError) { res.status(409).json({ error: error.message || 'Vehicle conflict' }); return; }
  if (isUniqueViolation(error)) { res.status(409).json({ error: 'Já existe um veículo com a mesma Placa ou RENAVAM.' }); return; }
  if (error instanceof VehicleNotFoundError) { res.status(404).json({ error: 'Not found' }); return; }
  console.error('AUTOERP_VEHICLE_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Vehicle operation failed' });
}

function appendStatusReason(existing: Vehicle, reason?: string): string | undefined {
  if (!reason) return existing.notes;
  return `${existing.notes || ''}\n[Status]: ${reason}`.trim();
}

function optionalVehicleYear(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredVehicleYear(value, field);
}

function optionalState(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const state = String(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new VehicleValidationError('UF deve ter 2 letras');
  return state;
}

function optionalSecurityCode(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const code = String(value).replace(/\D/g, '');
  if (!code) return undefined;
  if (code.length < 9 || code.length > 11) throw new VehicleValidationError('Código de segurança do CLA inválido');
  return code;
}

function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === Number(digits[10]);
}

function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * weights1[i];
  let rem = sum % 11;
  const d1 = rem < 2 ? 0 : 11 - rem;
  if (d1 !== Number(digits[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(digits[i]) * weights2[i];
  rem = sum % 11;
  const d2 = rem < 2 ? 0 : 11 - rem;
  return d2 === Number(digits[13]);
}

function normalizeOwnerDocument(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const cleaned = String(value).replace(/\D/g, '');
  if (!cleaned) return undefined;
  if (cleaned.length === 11) {
    if (!isValidCpf(cleaned)) throw new VehicleValidationError('CPF do proprietário inválido');
    return cleaned;
  }
  if (cleaned.length === 14) {
    if (!isValidCnpj(cleaned)) throw new VehicleValidationError('CNPJ do proprietário inválido');
    return cleaned;
  }
  throw new VehicleValidationError('Documento do proprietário deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)');
}

const VALID_OWNER_TYPES = new Set(['COMPANY', 'FINANCED_LEASING', 'PARTNER', 'THIRD_PARTY']);
const VALID_POSSESSION_TYPES = new Set(['PROPRIO', 'FINANCIAMENTO_LEASING', 'CESSAO_SOCIO', 'SUBLOCACAO_TERCEIRO']);
const VALID_FINANCIAL_RESTRICTIONS = new Set(['NONE', 'ALIENACAO_FIDUCIARIA', 'ARRENDAMENTO_MERCANTIL', 'OUTRO']);

function normalizeOwnerType(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'COMPANY';
  const val = String(value).trim().toUpperCase();
  if (!VALID_OWNER_TYPES.has(val)) throw new VehicleValidationError('Tipo de proprietário inválido');
  return val;
}

function normalizePossessionType(value: unknown, ownerType: string): string {
  if (value === undefined || value === null || value === '') {
    if (ownerType === 'FINANCED_LEASING') return 'FINANCIAMENTO_LEASING';
    if (ownerType === 'PARTNER') return 'CESSAO_SOCIO';
    if (ownerType === 'THIRD_PARTY') return 'SUBLOCACAO_TERCEIRO';
    return 'PROPRIO';
  }
  const val = String(value).trim().toUpperCase();
  if (!VALID_POSSESSION_TYPES.has(val)) throw new VehicleValidationError('Tipo de posse inválido');
  return val;
}

function normalizeFinancialRestriction(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'NONE';
  const val = String(value).trim().toUpperCase();
  if (!VALID_FINANCIAL_RESTRICTIONS.has(val)) throw new VehicleValidationError('Restrição financeira inválida');
  return val;
}

function calculateSneCoverage(ownerType: string): string {
  switch (ownerType) {
    case 'COMPANY': return 'COBERTO_CNPJ';
    case 'PARTNER': return 'PENDENTE_CPF_TITULAR';
    case 'FINANCED_LEASING': return 'DESCOBERTO_BANCO_LEASING';
    case 'THIRD_PARTY': return 'DESCOBERTO_TERCEIRO';
    default: return 'NAO_ADERIDO';
  }
}

export function registerVehicleRoutes(app: Express): void {
  registerCompanyProfileRoutes(app);
  registerVehicleInspectionRoutes(app);
  registerDriverRoutes(app);
  registerContractRoutes(app);
  registerAttachmentRoutes(app);
  registerDocumentRoutes(app);
  registerDocumentAiRoutes(app);
  registerReportAiSuggestionRoutes(app);
  registerWhatsappRoutes(app);
  registerContractTemplateRoutes(app);
  registerContractExecutionRoutes(app);
  registerRecurringRoutes(app);
  registerVehicleCrlvApplyRoutes(app);
  registerVehicleLifecycleRoutes(app);

  app.get('/api/fleet/vehicles', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) => await txContext.getVehicleRepo().findAllByCompany(principal.companyId));
      res.json({ items: items.filter((item) => !item.isArchived && item.status !== VehicleStatus.SOLD) });
    } catch (error) { sendVehicleError(res, error); }
  });

  app.get('/api/fleet/vehicles/identity-check', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const plate = normalizeVehicleIdentity(req.query.plate);
      const renavam = normalizeVehicleIdentity(req.query.renavam);
      const chassis = normalizeVehicleIdentity(req.query.chassis);
      if (!plate && !renavam && !chassis) {
        res.status(400).json({ error: 'Informe placa, RENAVAM ou chassi para consulta.' });
        return;
      }
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const conflict = await findVehicleIdentityConflict(txContext, principal.companyId, plate, renavam, chassis);
        if (!conflict) return { exists: false as const, item: null };
        const item = await txContext.getVehicleRepo().findByIdForCompany(principal.companyId, conflict.id);
        if (!item) throw new VehicleNotFoundError();
        return {
          exists: true as const,
          item,
          matches: {
            plate: conflict.plateMatch,
            renavam: conflict.renavamMatch,
            chassis: conflict.chassisMatch,
          },
          historical: conflict.isArchived || conflict.status === VehicleStatus.SOLD || conflict.status === VehicleStatus.ARCHIVED,
        };
      });
      res.json(result);
    } catch (error) { sendVehicleError(res, error); }
  });

  app.get('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) => await txContext.getVehicleRepo().findByIdForCompany(principal.companyId, req.params.id));
      if (!item) throw new VehicleNotFoundError();
      res.json({ item });
    } catch (error) { sendVehicleError(res, error); }
  });

  app.post('/api/fleet/vehicles', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'CREATE_VEHICLE');
    if (!principal) return;
    try {
      const plate = normalizePlate(req.body?.plate);
      const renavam = normalizeVehicleIdentity(requiredText(req.body?.renavam, 'renavam'));
      if (!renavam) throw new VehicleValidationError('Invalid renavam');
      const brand = requiredText(req.body?.brand, 'brand');
      const model = requiredText(req.body?.model, 'model');
      const color = requiredText(req.body?.color, 'color');
      const chassis = requiredText(req.body?.chassis, 'chassis').toUpperCase();
      const fuelType = requiredText(req.body?.fuelType, 'fuelType');
      const currentKm = requiredNonNegativeInteger(req.body?.currentKm, 'currentKm');
      const acquisitionValue = requiredPositive(req.body?.acquisitionValue, 'acquisitionValue');
      const currentValue = requiredPositive(req.body?.currentValue, 'currentValue');
      const rentalValueBase = requiredPositive(req.body?.rentalValueBase, 'rentalValueBase');
      const nextMaintenanceKm = optionalNonNegativeInteger(req.body?.nextMaintenanceKm, 'nextMaintenanceKm');
      if (nextMaintenanceKm !== undefined && nextMaintenanceKm < currentKm) {
        throw new VehicleValidationError('Próxima manutenção não pode ser menor que o KM atual');
      }
      const yearFabrication = requiredVehicleYear(req.body?.yearFabrication, 'yearFabrication');
      const yearModel = requiredVehicleYear(req.body?.yearModel, 'yearModel');
      const category = normalizeVehicleCategory(requiredText(req.body?.category, 'category'));
      const ownerType = normalizeOwnerType(req.body?.ownerType);
      const ownerName = optionalText(req.body?.ownerName);
      const ownerDocument = normalizeOwnerDocument(req.body?.ownerDocument);
      const possessionType = normalizePossessionType(req.body?.possessionType, ownerType);
      const financialRestriction = normalizeFinancialRestriction(req.body?.financialRestriction);
      const financialInstitution = optionalText(req.body?.financialInstitution);
      const crlvExerciseYear = optionalVehicleYear(req.body?.crlvExerciseYear, 'crlvExerciseYear');
      const registrationCity = optionalText(req.body?.registrationCity);
      const registrationState = optionalState(req.body?.registrationState);
      const claSecurityCode = optionalSecurityCode(req.body?.claSecurityCode);
      const sneCoverageStatus = calculateSneCoverage(ownerType);

      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        const identityConflict = await findVehicleIdentityConflict(txContext, principal.companyId, plate, renavam, chassis);
        if (identityConflict) throw new VehicleConflictError(vehicleIdentityConflictMessage(identityConflict));
        const now = new Date().toISOString();
        const created = await repo.create({
          id: randomUUID(),
          companyId: principal.companyId,
          plate,
          brand,
          model,
          version: optionalText(req.body?.version),
          yearFabrication,
          yearModel,
          color,
          renavam,
          chassis,
          currentKm,
          nextMaintenanceKm,
          fuelType,
          category,
          acquisitionValue,
          currentValue,
          rentalValueBase,
          ownerType,
          ownerName: ownerName || undefined,
          ownerDocument: ownerDocument || undefined,
          possessionType,
          financialRestriction,
          financialInstitution: financialInstitution || undefined,
          crlvExerciseYear,
          registrationCity: registrationCity || undefined,
          registrationState: registrationState || undefined,
          claSecurityCode: claSecurityCode || undefined,
          sneCoverageStatus,
          status: VehicleStatus.AVAILABLE,
          notes: optionalText(req.body?.notes),
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });

        await repo.createOwnershipHistory({
          id: randomUUID(),
          companyId: principal.companyId,
          vehicleId: created.id,
          ownerType,
          ownerName: ownerName || 'Empresa (Cadastro)',
          ownerDocument: ownerDocument || undefined,
          possessionType,
          financialRestriction,
          financialInstitution: financialInstitution || undefined,
          effectiveFrom: now,
          effectiveTo: undefined,
          reason: 'CADASTRO_INICIAL',
          createdBy: principal.userId,
          createdAt: now,
        });

        await txContext.getKmRecordRepo().create({ id: randomUUID(), companyId: principal.companyId, vehicleId: created.id, kmValue: created.currentKm, recordDate: now.split('T')[0], readingType: 'PERIODIC', notes: 'Cadastro inicial do veículo', createdAt: now });
        await MaintenancePlanTemplateAuthority.applyToVehicleContext(txContext, principal, created);
        const available = await repo.updateForCompany(principal.companyId, created.id, { status: VehicleStatus.AVAILABLE, updatedAt: now });
        if (!available) throw new VehicleNotFoundError();
        await txContext.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: created.id, action: AuditAction.CREATE, newState: JSON.stringify(available), userId: principal.userId, userName: principal.name, timestamp: now });
        return available;
      });
      res.status(201).json({ item });
    } catch (error) { sendVehicleError(res, error); }
  });

  app.patch('/api/fleet/vehicles/:id', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'EDIT_VEHICLE');
    if (!principal) return;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'currentKm')) { res.status(400).json({ error: 'Use the KM record endpoint to change currentKm' }); return; }
    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        const existing = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!existing) throw new VehicleNotFoundError();
        if (existing.isArchived || existing.status === VehicleStatus.SOLD) throw new VehicleConflictError('Terminal vehicle is read-only');
        const changes: Partial<Vehicle> = { updatedAt: new Date().toISOString() };
        if (req.body?.plate !== undefined) { const plate = normalizePlate(req.body.plate); const duplicate = await findVehicleIdentityConflict(txContext, principal.companyId, plate, existing.renavam, existing.chassis, existing.id); if (duplicate) throw new VehicleConflictError(vehicleIdentityConflictMessage(duplicate)); changes.plate = plate; }
        if (req.body?.renavam !== undefined) { const renavam = normalizeVehicleIdentity(requiredText(req.body.renavam, 'renavam')); if (!renavam) throw new VehicleValidationError('Invalid renavam'); const duplicate = await findVehicleIdentityConflict(txContext, principal.companyId, existing.plate, renavam, existing.chassis, existing.id); if (duplicate) throw new VehicleConflictError(vehicleIdentityConflictMessage(duplicate)); changes.renavam = renavam; }
        if (req.body?.brand !== undefined) changes.brand = requiredText(req.body.brand, 'brand');
        if (req.body?.model !== undefined) changes.model = requiredText(req.body.model, 'model');
        if (req.body?.version !== undefined) changes.version = optionalText(req.body.version) || '';
        if (req.body?.color !== undefined) changes.color = requiredText(req.body.color, 'color');
        if (req.body?.chassis !== undefined) { const chassis = normalizeVehicleIdentity(requiredText(req.body.chassis, 'chassis')); if (!chassis) throw new VehicleValidationError('Invalid chassis'); const duplicate = await findVehicleIdentityConflict(txContext, principal.companyId, existing.plate, existing.renavam, chassis, existing.id); if (duplicate) throw new VehicleConflictError(vehicleIdentityConflictMessage(duplicate)); changes.chassis = chassis; }
        if (req.body?.fuelType !== undefined) changes.fuelType = requiredText(req.body.fuelType, 'fuelType');
        if (req.body?.category !== undefined) changes.category = normalizeVehicleCategory(requiredText(req.body.category, 'category'));
        if (req.body?.notes !== undefined) changes.notes = optionalText(req.body.notes) || '';
        if (req.body?.yearFabrication !== undefined) changes.yearFabrication = requiredVehicleYear(req.body.yearFabrication, 'yearFabrication');
        if (req.body?.yearModel !== undefined) changes.yearModel = requiredVehicleYear(req.body.yearModel, 'yearModel');
        if (req.body?.nextMaintenanceKm !== undefined) {
          const nextMaintenanceKm = requiredNonNegativeInteger(req.body.nextMaintenanceKm, 'nextMaintenanceKm');
          if (nextMaintenanceKm < existing.currentKm) throw new VehicleValidationError('Próxima manutenção não pode ser menor que o KM atual');
          changes.nextMaintenanceKm = nextMaintenanceKm;
        }
        if (req.body?.acquisitionValue !== undefined) changes.acquisitionValue = requiredPositive(req.body.acquisitionValue, 'acquisitionValue');
        if (req.body?.currentValue !== undefined) changes.currentValue = requiredPositive(req.body.currentValue, 'currentValue');
        if (req.body?.rentalValueBase !== undefined) changes.rentalValueBase = requiredPositive(req.body.rentalValueBase, 'rentalValueBase');

        let ownershipChanged = false;
        if (req.body?.ownerType !== undefined) {
          const ot = normalizeOwnerType(req.body.ownerType);
          if (ot !== existing.ownerType) ownershipChanged = true;
          changes.ownerType = ot;
          changes.sneCoverageStatus = calculateSneCoverage(ot);
        }
        if (req.body?.ownerName !== undefined) {
          const on = optionalText(req.body.ownerName) || undefined;
          if (on !== existing.ownerName) ownershipChanged = true;
          changes.ownerName = on;
        }
        if (req.body?.ownerDocument !== undefined) {
          const od = normalizeOwnerDocument(req.body.ownerDocument);
          if (od !== existing.ownerDocument) ownershipChanged = true;
          changes.ownerDocument = od;
        }
        if (req.body?.possessionType !== undefined) {
          changes.possessionType = normalizePossessionType(req.body.possessionType, changes.ownerType || existing.ownerType);
        }
        if (req.body?.financialRestriction !== undefined) {
          changes.financialRestriction = normalizeFinancialRestriction(req.body.financialRestriction);
        }
        if (req.body?.financialInstitution !== undefined) {
          changes.financialInstitution = optionalText(req.body.financialInstitution) || undefined;
        }
        if (req.body?.crlvExerciseYear !== undefined) {
          changes.crlvExerciseYear = optionalVehicleYear(req.body.crlvExerciseYear, 'crlvExerciseYear');
        }
        if (req.body?.registrationCity !== undefined) {
          changes.registrationCity = optionalText(req.body.registrationCity) || undefined;
        }
        if (req.body?.registrationState !== undefined) {
          changes.registrationState = optionalState(req.body.registrationState);
        }
        if (req.body?.claSecurityCode !== undefined) {
          changes.claSecurityCode = optionalSecurityCode(req.body.claSecurityCode);
        }

        if (Object.keys(changes).length === 1) throw new VehicleValidationError('No editable fields');

        if (ownershipChanged) {
          await repo.closeActiveOwnershipHistory(principal.companyId, existing.id, changes.updatedAt!);
          await repo.createOwnershipHistory({
            id: randomUUID(),
            companyId: principal.companyId,
            vehicleId: existing.id,
            ownerType: changes.ownerType || existing.ownerType,
            ownerName: changes.ownerName || existing.ownerName || 'Não informado',
            ownerDocument: changes.ownerDocument !== undefined ? changes.ownerDocument : existing.ownerDocument,
            possessionType: changes.possessionType || existing.possessionType,
            financialRestriction: changes.financialRestriction || existing.financialRestriction,
            financialInstitution: changes.financialInstitution !== undefined ? changes.financialInstitution : existing.financialInstitution,
            effectiveFrom: changes.updatedAt!,
            effectiveTo: undefined,
            reason: optionalText(req.body?.ownershipChangeReason) || 'ALTERACAO_CADASTRO',
            createdBy: principal.userId,
            createdAt: changes.updatedAt!,
          });
        }

        const updated = await repo.updateForCompany(principal.companyId, existing.id, changes);
        if (!updated) throw new VehicleNotFoundError();
        await txContext.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: existing.id, action: AuditAction.UPDATE, previousState: JSON.stringify(existing), newState: JSON.stringify(updated), userId: principal.userId, userName: principal.name, timestamp: changes.updatedAt! });
        return updated;
      });
      res.json({ item });
    } catch (error) { sendVehicleError(res, error); }
  });

  app.get('/api/fleet/vehicles/:id/details-summary', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const summary = await getVehicleDetailsSummary(principal.companyId, req.params.id);
      res.json({ summary });
    } catch (error) {
      if (error instanceof VehicleDetailsNotFoundError) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      sendVehicleError(res, error);
    }
  });

  app.get('/api/fleet/vehicles/:id/ownership-history', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        const vehicle = await repo.findByIdForCompany(principal.companyId, req.params.id);
        if (!vehicle) throw new VehicleNotFoundError();
        return await repo.getOwnershipHistoryForVehicle(principal.companyId, vehicle.id);
      });
      res.json({ items });
    } catch (error) { sendVehicleError(res, error); }
  });

  app.get('/api/fleet/vehicles/:id/km-records', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'VIEW_VEHICLE');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const vehicle = await txContext.getVehicleRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!vehicle) throw new VehicleNotFoundError();
        return await txContext.getKmRecordRepo().findByVehicleIdForCompany(principal.companyId, vehicle.id);
      });
      res.json({ items });
    } catch (error) { sendVehicleError(res, error); }
  });

  app.post('/api/fleet/vehicles/:id/km-records', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'RECORD_VEHICLE_KM');
    if (!principal) return;
    const newKm = Number(req.body?.kmValue);
    const readingType = typeof req.body?.readingType === 'string' ? req.body.readingType : '';
    const allowedTypes = new Set(['CHECK_IN', 'CHECK_OUT', 'PERIODIC', 'MAINTENANCE']);
    if (!Number.isInteger(newKm) || newKm < 0 || !allowedTypes.has(readingType)) { res.status(400).json({ error: 'Invalid KM record request' }); return; }
    try {
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const now = new Date().toISOString();
        const { record, vehicle, previousKm } = await recordVehicleKm(txContext, principal.companyId, {
          vehicleId: req.params.id, kmValue: newKm, recordDate: now.split('T')[0],
          readingType: readingType as 'CHECK_IN' | 'CHECK_OUT' | 'PERIODIC' | 'MAINTENANCE', notes: optionalText(req.body?.notes),
        });
        await txContext.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'KmRecord', entityId: record.id, action: AuditAction.CREATE, previousState: JSON.stringify({ vehicleId: vehicle.id, currentKm: previousKm }), newState: JSON.stringify({ vehicleId: vehicle.id, currentKm: newKm, readingType }), userId: principal.userId, userName: principal.name, timestamp: now });
        return { record, vehicle };
      });
      res.status(201).json(result);
    } catch (error) { sendVehicleError(res, error); }
  });

  app.post('/api/fleet/vehicles/km-records/batch', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'RECORD_VEHICLE_KM');
    if (!principal) return;
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (rawEntries.length === 0 || rawEntries.length > 100) {
      res.status(400).json({ error: 'Informe entre 1 e 100 leituras de KM.' });
      return;
    }

    const normalized = rawEntries.map((entry: any) => ({
      vehicleId: typeof entry?.vehicleId === 'string' ? entry.vehicleId.trim() : '',
      kmValue: Number(entry?.kmValue),
      notes: optionalText(entry?.notes),
    }));
    const seen = new Set<string>();
    for (const entry of normalized) {
      if (!entry.vehicleId || !Number.isInteger(entry.kmValue) || entry.kmValue < 0 || seen.has(entry.vehicleId)) {
        res.status(400).json({ error: 'Lote de KM inválido ou com veículo duplicado.' });
        return;
      }
      seen.add(entry.vehicleId);
    }

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const results: Array<{ record: any; vehicle: Vehicle }> = [];
        for (const entry of [...normalized].sort((a, b) => a.vehicleId.localeCompare(b.vehicleId))) {
          const now = new Date().toISOString();
          const { record, vehicle, previousKm } = await recordVehicleKm(txContext, principal.companyId, {
            vehicleId: entry.vehicleId,
            kmValue: entry.kmValue,
            recordDate: now.split('T')[0],
            readingType: 'PERIODIC',
            notes: entry.notes || 'Atualização de KM em lote',
          });
          await txContext.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'KmRecord',
            entityId: record.id,
            action: AuditAction.CREATE,
            previousState: JSON.stringify({ vehicleId: vehicle.id, currentKm: previousKm }),
            newState: JSON.stringify({ vehicleId: vehicle.id, currentKm: entry.kmValue, readingType: 'PERIODIC', source: 'BATCH' }),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
          results.push({ record, vehicle });
        }
        return results;
      });
      res.status(201).json({ items });
    } catch (error) {
      sendVehicleError(res, error);
    }
  });

  app.patch('/api/fleet/vehicles/:id/status', async (req: Request, res: Response) => {
    const principal = requireVehiclePrincipal(req, res, 'CHANGE_VEHICLE_STATUS');
    if (!principal) return;
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!Object.values(VehicleStatus).includes(status as VehicleStatus)) { res.status(400).json({ error: 'Invalid vehicle status' }); return; }
    if (status === VehicleStatus.SOLD || status === VehicleStatus.ARCHIVED) { res.status(400).json({ error: 'Use the dedicated vehicle lifecycle action' }); return; }
    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const repo = txContext.getVehicleRepo();
        const existing = await repo.findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!existing) throw new VehicleNotFoundError();
        if (existing.status === status) return existing;
        const targetStatus = status as VehicleStatus;
        const activeContract = await txContext.getContractRepo().findActiveByVehicle(principal.companyId, existing.id);
        const hasBlockingMaintenance = await txContext.getWorkOrderRepo().hasBlockingWorkOrder(principal.companyId, existing.id, '');
        const hasCurrentBinding = Boolean(activeContract || existing.currentContractId || existing.currentDriverId);
        if (!canManuallyTransitionVehicleStatus(existing.status, targetStatus, { hasActiveContract: hasCurrentBinding, hasBlockingMaintenance })) throw new VehicleConflictError('Invalid vehicle status transition');
        const now = new Date().toISOString();
        const reason = optionalText(req.body?.reason);
        const updated = await repo.updateForCompany(principal.companyId, existing.id, { status: targetStatus, isArchived: targetStatus === VehicleStatus.ARCHIVED, notes: appendStatusReason(existing, reason), updatedAt: now });
        if (!updated) throw new VehicleNotFoundError();
        await txContext.getAuditLogRepo().create({ id: randomUUID(), companyId: principal.companyId, entityName: 'Vehicle', entityId: existing.id, action: AuditAction.UPDATE, previousState: JSON.stringify({ status: existing.status, isArchived: existing.isArchived }), newState: JSON.stringify({ status: updated.status, isArchived: updated.isArchived, reason }), userId: principal.userId, userName: principal.name, timestamp: now });
        return updated;
      });
      res.json({ item });
    } catch (error) { sendVehicleError(res, error); }
  });
}
