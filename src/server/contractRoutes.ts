import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { ReceivableService } from '../domain/finance/ReceivableService';
import { assertFinancialCategoryForObligation } from '../domain/finance/FinancialCategoryAuthority';
import { ANNUAL_VEHICLE_DOCUMENT_TYPES } from '../domain/documents/documentPolicy';
import type { Contract, Driver, Vehicle } from '../types/entities';
import {
  AuditAction,
  ContractStatus,
  DocumentStatus,
  DriverStatus,
  OriginType,
  RecurringFrequency,
  VehicleStatus,
} from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { ensureVehicleInsuranceEligible } from './contractInsuranceGate';

type ContractAction =
  | 'VIEW_CONTRACT'
  | 'CREATE_CONTRACT'
  | 'EDIT_CONTRACT'
  | 'ACTIVATE_CONTRACT'
  | 'CLOSE_CONTRACT'
  | 'CANCEL_CONTRACT'
  | 'ARCHIVE_CONTRACT'
  | 'BILL_CONTRACT';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const BILL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL', 'FINANCIAL']);
const PERIODICITIES = new Set(Object.values(RecurringFrequency));

class ContractValidationError extends Error {}
class ContractConflictError extends Error {}
class ContractNotFoundError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasContractPermission(principal: AuthenticatedPrincipal, action: ContractAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  if (action === 'VIEW_CONTRACT') return true;
  if (action === 'BILL_CONTRACT') return BILL_ROLES.has(role);
  return DEFAULT_WRITE_ROLES.has(role);
}

function requireContractPrincipal(req: Request, res: Response, action: ContractAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasContractPermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function requiredText(value: unknown, field: string, minLength = 1): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean.length < minLength) throw new ContractValidationError(`Invalid ${field}`);
  return clean;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const clean = String(value).trim();
  return clean || undefined;
}

function normalizeContractNumber(value: unknown): string | undefined {
  const clean = optionalText(value);
  if (!clean) return undefined;
  const normalized = clean.toUpperCase().replace(/\s+/g, '-');
  if (normalized.length < 3 || normalized.length > 80 || !/^[A-Z0-9._/-]+$/.test(normalized)) {
    throw new ContractValidationError('Invalid contractNumber');
  }
  return normalized;
}

function generateContractNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `CNT-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalizeDate(value: unknown, field: string): string {
  const date = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ContractValidationError(`Invalid ${field}`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ContractValidationError(`Invalid ${field}`);
  }
  return date;
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeDate(value, field);
}

function nonNegative(value: unknown, field: string, defaultValue?: number): number {
  if ((value === undefined || value === null || value === '') && defaultValue !== undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ContractValidationError(`Invalid ${field}`);
  return parsed;
}

function positive(value: unknown, field: string): number {
  const parsed = nonNegative(value, field);
  if (parsed <= 0) throw new ContractValidationError(`Invalid ${field}`);
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string, defaultValue = 0): number {
  const parsed = nonNegative(value, field, defaultValue);
  if (!Number.isInteger(parsed)) throw new ContractValidationError(`Invalid ${field}`);
  return parsed;
}

function periodicity(value: unknown, fallback = RecurringFrequency.WEEKLY): RecurringFrequency {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !PERIODICITIES.has(value as RecurringFrequency)) {
    throw new ContractValidationError('Invalid billingPeriodicity');
  }
  return value as RecurringFrequency;
}

function dueDay(value: unknown, field: string, min: number, max: number, fallback = 1): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ContractValidationError(`Invalid ${field}`);
  return parsed;
}

function validateDateRange(startDate: string, endDate?: string): void {
  if (endDate && startDate > endDate) throw new ContractValidationError('Invalid contract date range');
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

function sendContractError(res: Response, error: unknown): void {
  if (error instanceof ContractValidationError) {
    res.status(400).json({ error: 'Invalid contract request' });
    return;
  }
  if (error instanceof ContractConflictError || isUniqueViolation(error)) {
    res.status(409).json({ error: 'Contract conflict' });
    return;
  }
  if (error instanceof ContractNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.startsWith('Categoria financeira') || message === 'Financial category authority unavailable') {
    res.status(400).json({ error: 'Invalid contract financial category' });
    return;
  }
  if (message.includes('período financeiro') || message.includes('Período')) {
    res.status(409).json({ error: 'Contract financial conflict' });
    return;
  }
  console.error('AUTOERP_CONTRACT_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Contract operation failed' });
}

function auditState(contract: Contract): string {
  return JSON.stringify(contract);
}

function appendNote(existing: string | undefined, label: string, text?: string): string | undefined {
  if (!text) return existing;
  return `${existing || ''}\n[${label}]: ${text}`.trim();
}

function ensureDriverEligible(driver: Driver): void {
  if (driver.isArchived || driver.status !== DriverStatus.ACTIVE) throw new ContractConflictError('Driver unavailable');
  if (![DocumentStatus.VALID, DocumentStatus.EXPIRING_SOON].includes(driver.cnhStatus)) throw new ContractConflictError('Driver CNH invalid');
}

function ensureVehicleEligible(vehicle: Vehicle): void {
  if (vehicle.isArchived || vehicle.status !== VehicleStatus.AVAILABLE) throw new ContractConflictError('Vehicle unavailable');
  if (vehicle.currentContractId || vehicle.currentDriverId) throw new ContractConflictError('Vehicle already bound');
}

async function ensureVehicleDocumentsEligible(companyId: string, vehicleId: string, tx: any): Promise<void> {
  const documents = await tx.getDocumentRepo().findAllByCompany(companyId, {
    subjectType: 'VEHICLE',
    subjectId: vehicleId,
    currentOnly: true,
  });
  const blocking = documents.filter((document: any) =>
    ANNUAL_VEHICLE_DOCUMENT_TYPES.has(document.documentType) &&
    [DocumentStatus.PENDING, DocumentStatus.EXPIRED].includes(document.complianceStatus)
  );
  if (blocking.length > 0) throw new ContractConflictError('Vehicle documentation unavailable');
}

function editableBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function forbidAuthorityFields(body: Record<string, unknown>, fields: string[]): void {
  if (fields.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    throw new ContractValidationError('Invalid contract authority surface');
  }
}

export function registerContractRoutes(app: Express): void {
  app.get('/api/contracts', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'VIEW_CONTRACT');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getContractRepo().findAllByCompany(principal.companyId)
      );
      res.json({ items: items.filter((item) => !item.isArchived) });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.get('/api/contracts/:id', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'VIEW_CONTRACT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id)
      );
      if (!item || item.isArchived) throw new ContractNotFoundError();
      res.json({ item });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'CREATE_CONTRACT');
    if (!principal) return;
    const body = editableBody(req);
    try {
      forbidAuthorityFields(body, ['companyId','userId','userName','role','status','isArchived','securityDepositId','generatedPdfUrl','signedContractUrl','signatureRequired']);
      const vehicleId = requiredText(body.vehicleId, 'vehicleId');
      const driverId = requiredText(body.driverId, 'driverId');
      const startDate = normalizeDate(body.startDate, 'startDate');
      const endDate = optionalDate(body.endDate, 'endDate');
      validateDateRange(startDate, endDate);
      const rentalAmount = positive(body.rentalAmount, 'rentalAmount');
      const billingPeriodicity = periodicity(body.billingPeriodicity);
      const billingDueDayOfWeek = dueDay(body.billingDueDayOfWeek, 'billingDueDayOfWeek', 1, 7);
      const billingDueDayOfMonth = dueDay(body.billingDueDayOfMonth, 'billingDueDayOfMonth', 1, 31);
      const securityDepositAmount = nonNegative(body.securityDepositAmount, 'securityDepositAmount', 0);
      const franchiseKm = nonNegativeInteger(body.franchiseKm, 'franchiseKm', 0);
      const excessKmRate = nonNegative(body.excessKmRate, 'excessKmRate', 0);
      const requestedNumber = normalizeContractNumber(body.contractNumber);
      const requestedTemplateId = optionalText(body.templateId);

      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!vehicle || vehicle.isArchived) throw new ContractNotFoundError();
        if (!driver || driver.isArchived) throw new ContractNotFoundError();
        if (requestedTemplateId) {
          const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);
          if (!template || template.isArchived) throw new ContractNotFoundError();
          if (!template.isCurrent || !template.isActive) throw new ContractConflictError('Contract template unavailable');
        }

        let contractNumber = requestedNumber || generateContractNumber();
        if (await tx.getContractRepo().findByNumber(principal.companyId, contractNumber)) {
          if (requestedNumber) throw new ContractConflictError('Duplicate contract number');
          contractNumber = generateContractNumber();
          if (await tx.getContractRepo().findByNumber(principal.companyId, contractNumber)) {
            throw new ContractConflictError('Duplicate generated contract number');
          }
        }

        const now = new Date().toISOString();
        const created = await tx.getContractRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractNumber,
          driverId,
          vehicleId,
          startDate,
          endDate,
          status: ContractStatus.DRAFT,
          rentalAmount,
          billingPeriodicity,
          billingDueDayOfWeek,
          billingDueDayOfMonth,
          securityDepositAmount,
          franchiseKm,
          excessKmRate,
          paymentMethodId: optionalText(body.paymentMethodId),
          templateId: requestedTemplateId,
          signatureRequired: true,
          notes: optionalText(body.notes),
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: created.id,
          action: AuditAction.CREATE, newState: auditState(created), userId: principal.userId,
          userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.patch('/api/contracts/:id', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'EDIT_CONTRACT');
    if (!principal) return;
    const body = editableBody(req);
    try {
      forbidAuthorityFields(body, ['companyId','userId','userName','role','status','isArchived','securityDepositId','generatedPdfUrl','signedContractUrl','signatureRequired']);
      const editable = ['contractNumber','vehicleId','driverId','startDate','endDate','rentalAmount','billingPeriodicity','billingDueDayOfWeek','billingDueDayOfMonth','securityDepositAmount','franchiseKm','excessKmRate','paymentMethodId','templateId','notes'];
      if (!editable.some((key) => Object.prototype.hasOwnProperty.call(body, key))) throw new ContractValidationError('No editable fields');

      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const existing = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!existing || existing.isArchived) throw new ContractNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(existing.status)) {
          throw new ContractConflictError('Contract is not editable');
        }
        const generatedArtifact = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, existing.id, 'GENERATED_PDF', true
        );
        if (generatedArtifact) throw new ContractConflictError('Contract terms are locked after PDF generation');

        const vehicleId = body.vehicleId === undefined ? existing.vehicleId : requiredText(body.vehicleId, 'vehicleId');
        const driverId = body.driverId === undefined ? existing.driverId : requiredText(body.driverId, 'driverId');
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!vehicle || vehicle.isArchived || !driver || driver.isArchived) throw new ContractNotFoundError();
        const nextTemplateId = body.templateId === undefined ? existing.templateId : optionalText(body.templateId);
        if (nextTemplateId) {
          const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, nextTemplateId);
          if (!template || template.isArchived) throw new ContractNotFoundError();
          if (!template.isCurrent || !template.isActive) throw new ContractConflictError('Contract template unavailable');
        }

        const contractNumber = body.contractNumber === undefined
          ? existing.contractNumber
          : (normalizeContractNumber(body.contractNumber) || existing.contractNumber);
        const duplicate = await tx.getContractRepo().findByNumber(principal.companyId, contractNumber);
        if (duplicate && duplicate.id !== existing.id) throw new ContractConflictError('Duplicate contract number');

        const startDate = body.startDate === undefined ? existing.startDate : normalizeDate(body.startDate, 'startDate');
        const endDate = body.endDate === undefined ? existing.endDate : optionalDate(body.endDate, 'endDate');
        validateDateRange(startDate, endDate);
        const now = new Date().toISOString();
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, existing.id, {
          contractNumber,
          vehicleId,
          driverId,
          startDate,
          endDate,
          rentalAmount: body.rentalAmount === undefined ? existing.rentalAmount : positive(body.rentalAmount, 'rentalAmount'),
          billingPeriodicity: body.billingPeriodicity === undefined ? existing.billingPeriodicity : periodicity(body.billingPeriodicity),
          billingDueDayOfWeek: body.billingDueDayOfWeek === undefined ? existing.billingDueDayOfWeek : dueDay(body.billingDueDayOfWeek, 'billingDueDayOfWeek', 1, 7),
          billingDueDayOfMonth: body.billingDueDayOfMonth === undefined ? existing.billingDueDayOfMonth : dueDay(body.billingDueDayOfMonth, 'billingDueDayOfMonth', 1, 31),
          securityDepositAmount: body.securityDepositAmount === undefined ? existing.securityDepositAmount : nonNegative(body.securityDepositAmount, 'securityDepositAmount'),
          franchiseKm: body.franchiseKm === undefined ? existing.franchiseKm : nonNegativeInteger(body.franchiseKm, 'franchiseKm'),
          excessKmRate: body.excessKmRate === undefined ? existing.excessKmRate : nonNegative(body.excessKmRate, 'excessKmRate'),
          paymentMethodId: body.paymentMethodId === undefined ? existing.paymentMethodId : optionalText(body.paymentMethodId),
          templateId: nextTemplateId,
          notes: body.notes === undefined ? existing.notes : optionalText(body.notes),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: existing.id,
          action: AuditAction.UPDATE, previousState: auditState(existing), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts/:id/activate', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'ACTIVATE_CONTRACT');
    if (!principal) return;
    try {
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        if (contract.status === ContractStatus.ACTIVE) {
          const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
          if (vehicle?.currentContractId === contract.id && vehicle.currentDriverId === contract.driverId) {
            return { item: contract, receivables: [] };
          }
          throw new ContractConflictError('Active contract binding mismatch');
        }
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {
          throw new ContractConflictError('Contract lifecycle does not allow activation');
        }
        if (contract.signatureRequired) {
          const generated = await tx.getContractArtifactRepo().findCurrentForContract(
            principal.companyId, contract.id, 'GENERATED_PDF', true
          );
          const signed = await tx.getContractArtifactRepo().findCurrentForContract(
            principal.companyId, contract.id, 'SIGNED_EVIDENCE', true
          );
          if (!generated || !signed || signed.sourceArtifactId !== generated.id) {
            throw new ContractConflictError('Signed contract evidence required');
          }
        }
        if (contract.rentalAmount <= 0) throw new ContractConflictError('Contract rental amount incomplete');
        validateDateRange(contract.startDate, contract.endDate);
        const categoryId = requiredText(req.body?.categoryId, 'categoryId');
        await assertFinancialCategoryForObligation(principal.companyId, categoryId, 'RECEIVABLE', tx);

        // Deterministic lock order: Contract -> Vehicle -> Driver.
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        const driver = await tx.getDriverRepo().findByIdForCompanyWithLock(principal.companyId, contract.driverId);
        if (!driver) throw new ContractNotFoundError();
        ensureVehicleEligible(vehicle);
        await ensureVehicleDocumentsEligible(principal.companyId, vehicle.id, tx);
        if (!(await ensureVehicleInsuranceEligible(principal.companyId, vehicle.id, contract.startDate, tx))) {
          throw new ContractConflictError('Vehicle insurance unavailable');
        }
        ensureDriverEligible(driver);

        const vehicleConflict = await tx.getContractRepo().findActiveByVehicle(principal.companyId, contract.vehicleId, contract.id);
        const driverConflict = await tx.getContractRepo().findActiveByDriver(principal.companyId, contract.driverId, contract.id);
        if (vehicleConflict || driverConflict) throw new ContractConflictError('Active binding conflict');

        const now = new Date().toISOString();
        const active = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.ACTIVE,
          updatedAt: now,
        });
        if (!active) throw new ContractNotFoundError();

        const boundVehicle = await tx.getVehicleRepo().updateForCompany(principal.companyId, vehicle.id, {
          status: VehicleStatus.RENTED,
          currentDriverId: contract.driverId,
          currentContractId: contract.id,
          updatedAt: now,
        });
        if (!boundVehicle) throw new ContractNotFoundError();

        const receivables = await ReceivableService.create({
          companyId: principal.companyId,
          originType: OriginType.CONTRACT_RENT,
          originId: `${active.id}:${active.startDate}`,
          vehicleId: active.vehicleId,
          driverId: active.driverId,
          contractId: active.id,
          categoryId,
          description: `Aluguel Contrato ${active.contractNumber} (${active.billingPeriodicity})`,
          totalAmount: active.rentalAmount,
          dueDate: active.startDate,
          competenceDate: active.startDate,
          userId: principal.userId,
          userName: principal.name,
        }, tx);

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: active.id,
          action: AuditAction.UPDATE, previousState: auditState(contract), newState: auditState(active),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return { item: active, receivables };
      });
      res.json(result);
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts/:id/close', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'CLOSE_CONTRACT');
    if (!principal) return;
    try {
      const closeDate = req.body?.closeDate === undefined
        ? new Date().toISOString().slice(0, 10)
        : normalizeDate(req.body.closeDate, 'closeDate');
      const reason = optionalText(req.body?.reason);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        if (contract.status === ContractStatus.CLOSED || contract.status === ContractStatus.FINISHED) return contract;
        if (contract.status === ContractStatus.CANCELLED) throw new ContractConflictError('Cancelled contract cannot close');
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        const now = new Date().toISOString();
        const endDate = contract.endDate && contract.endDate < closeDate ? contract.endDate : closeDate;
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.CLOSED,
          endDate,
          notes: appendNote(contract.notes, 'Encerramento', reason),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
        if (vehicle.currentContractId === contract.id) {
          const released = await tx.getVehicleRepo().updateForCompany(principal.companyId, vehicle.id, {
            status: VehicleStatus.AVAILABLE,
            currentDriverId: '',
            currentContractId: '',
            updatedAt: now,
          });
          if (!released) throw new ContractNotFoundError();
        }
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.UPDATE, previousState: auditState(contract), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'CANCEL_CONTRACT');
    if (!principal) return;
    try {
      const reason = requiredText(req.body?.reason, 'reason', 3);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        if (contract.status === ContractStatus.CANCELLED) return contract;
        if ([ContractStatus.CLOSED, ContractStatus.FINISHED].includes(contract.status)) {
          throw new ContractConflictError('Closed contract cannot cancel');
        }
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        const now = new Date().toISOString();
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.CANCELLED,
          notes: appendNote(contract.notes, 'Cancelamento', reason),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
        if (vehicle.currentContractId === contract.id) {
          const released = await tx.getVehicleRepo().updateForCompany(principal.companyId, vehicle.id, {
            status: VehicleStatus.AVAILABLE,
            currentDriverId: '',
            currentContractId: '',
            updatedAt: now,
          });
          if (!released) throw new ContractNotFoundError();
        }
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.CANCEL, previousState: auditState(contract), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts/:id/archive', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'ARCHIVE_CONTRACT');
    if (!principal) return;
    try {
      const reason = optionalText(req.body?.reason);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract) throw new ContractNotFoundError();
        if (contract.isArchived) return contract;
        if ([ContractStatus.ACTIVE, ContractStatus.SUSPENDED].includes(contract.status)) {
          throw new ContractConflictError('Active contract cannot archive');
        }
        const now = new Date().toISOString();
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.ARCHIVED,
          isArchived: true,
          notes: appendNote(contract.notes, 'Arquivamento', reason),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.ARCHIVE, previousState: auditState(contract), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts/:id/bill', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'BILL_CONTRACT');
    if (!principal) return;
    try {
      const dueDate = normalizeDate(req.body?.dueDate, 'dueDate');
      const competenceDate = req.body?.competenceDate === undefined
        ? dueDate
        : normalizeDate(req.body.competenceDate, 'competenceDate');
      const categoryId = requiredText(req.body?.categoryId, 'categoryId');
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        if (contract.status !== ContractStatus.ACTIVE) throw new ContractConflictError('Contract must be active');
        await assertFinancialCategoryForObligation(principal.companyId, categoryId, 'RECEIVABLE', tx);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        if (!vehicle || !driver) throw new ContractNotFoundError();
        if (vehicle.currentContractId !== contract.id || vehicle.currentDriverId !== contract.driverId) {
          throw new ContractConflictError('Contract binding mismatch');
        }
        ensureDriverEligible(driver);
        return await ReceivableService.create({
          companyId: principal.companyId,
          originType: OriginType.CONTRACT_RENT,
          originId: `${contract.id}:${competenceDate}`,
          vehicleId: contract.vehicleId,
          driverId: contract.driverId,
          contractId: contract.id,
          categoryId,
          description: `Aluguel Recorrente - Contrato ${contract.contractNumber}`,
          totalAmount: contract.rentalAmount,
          dueDate,
          competenceDate,
          userId: principal.userId,
          userName: principal.name,
        }, tx);
      });
      res.json({ items });
    } catch (error) {
      sendContractError(res, error);
    }
  });
}
