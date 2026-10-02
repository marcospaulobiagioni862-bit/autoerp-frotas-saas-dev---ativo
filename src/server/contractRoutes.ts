import { sql } from 'drizzle-orm';
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
import { cancelUnpaidContractReceivables, ensureInitialContractReceivable } from './contractFinanceAuthority';
import { ContractSignatureRequiredError, requireContractEffectivePeriod } from '../domain/contracts/contractEffectivePeriod';
import { contractConflictResponse } from './contractConflictResponse';

type ContractAction =
  | 'VIEW_CONTRACT'
  | 'CREATE_CONTRACT'
  | 'EDIT_CONTRACT'
  | 'ACTIVATE_CONTRACT'
  | 'SUSPEND_CONTRACT'
  | 'RESUME_CONTRACT'
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

async function generateContractNumber(companyId: string, raw: any): Promise<string> {
  await raw.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${companyId}:contract-number`})))`);
  const result = await raw.execute(sql`
    SELECT COALESCE(
      MAX(
        CASE
          WHEN contract_number LIKE 'CNT-%'
            AND length(contract_number) = 10
            AND substring(contract_number from 5) ~ '^[0-9]{6}$'
          THEN substring(contract_number from 5)::integer
          ELSE 0
        END
      ),
      0
    ) AS max_number
    FROM contracts
    WHERE company_id=${companyId}
  `);
  const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
  const current = Number(rows[0]?.max_number ?? 0);
  if (!Number.isInteger(current) || current < 0 || current >= 999999) {
    throw new ContractConflictError('Contract numbering exhausted');
  }
  return `CNT-${String(current + 1).padStart(6, '0')}`;
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

function requiredDueDay(value: unknown, field: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') throw new ContractValidationError(`Invalid ${field}`);
  return dueDay(value, field, min, max);
}

function billingDueDays(
  billingPeriodicity: RecurringFrequency,
  billingDueDayOfWeekInput: unknown,
  billingDueDayOfMonthInput: unknown,
): { billingDueDayOfWeek: number; billingDueDayOfMonth: number } {
  if (billingPeriodicity === RecurringFrequency.WEEKLY) {
    return {
      billingDueDayOfWeek: requiredDueDay(billingDueDayOfWeekInput, 'billingDueDayOfWeek', 1, 7),
      billingDueDayOfMonth: 1,
    };
  }
  return {
    billingDueDayOfWeek: 1,
    billingDueDayOfMonth: requiredDueDay(billingDueDayOfMonthInput, 'billingDueDayOfMonth', 1, 31),
  };
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
  if (error instanceof ContractConflictError || error instanceof ContractSignatureRequiredError || isUniqueViolation(error) ||
      (error instanceof Error && error.message === 'Contract financial reconciliation conflict')) {
    res.status(409).json(contractConflictResponse(error instanceof Error ? error.message : undefined));
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
    res.status(409).json(contractConflictResponse('Financial period closed'));
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

async function ensureVehicleDocumentsEligible(companyId: string, vehicleId: string, effectiveDate: string, tx: any): Promise<void> {
  const documents = await tx.getDocumentRepo().findAllByCompany(companyId, {
    subjectType: 'VEHICLE',
    subjectId: vehicleId,
    currentOnly: true,
  });
  const annualDocuments = documents.filter((document: any) =>
    ANNUAL_VEHICLE_DOCUMENT_TYPES.has(document.documentType)
  );
  const blocking = annualDocuments.filter((document: any) =>
    [DocumentStatus.PENDING, DocumentStatus.EXPIRED].includes(document.complianceStatus)
  );
  const eligibleTypes = new Set(
    annualDocuments
      .filter((document: any) =>
        [DocumentStatus.VALID, DocumentStatus.EXPIRING_SOON].includes(document.complianceStatus) &&
        (!document.expirationDate || document.expirationDate >= effectiveDate)
      )
      .map((document: any) => document.documentType)
  );
  const missingRequiredType = [...ANNUAL_VEHICLE_DOCUMENT_TYPES]
    .some((documentType) => !eligibleTypes.has(documentType));
  if (blocking.length > 0 || missingRequiredType) {
    throw new ContractConflictError('Vehicle documentation unavailable');
  }
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
      const { billingDueDayOfWeek, billingDueDayOfMonth } = billingDueDays(
        billingPeriodicity,
        body.billingDueDayOfWeek,
        body.billingDueDayOfMonth,
      );
      const securityDepositAmount = nonNegative(body.securityDepositAmount, 'securityDepositAmount', 0);
      const franchiseKm = nonNegativeInteger(body.franchiseKm, 'franchiseKm', 0);
      const excessKmRate = nonNegative(body.excessKmRate, 'excessKmRate', 0);
      const requestedNumber = normalizeContractNumber(body.contractNumber);
      const requestedTemplateId = optionalText(body.templateId);

      const idempotencyKey = typeof req.headers['x-idempotency-key'] === 'string'
        ? req.headers['x-idempotency-key'].trim()
        : '';
      if (!idempotencyKey || idempotencyKey.length > 200) {
        throw new ContractValidationError('Missing idempotency key');
      }

      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const raw = tx.getRawTransaction?.();
        if (!raw) throw new Error('Contract idempotency authority unavailable');
        await raw.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${principal.companyId}:contract-create:${idempotencyKey}`})))`);

        const replayMarker = `[V2-IDEMPOTENCY:${idempotencyKey}]`;
        const replayRows = await raw.execute(sql`
          SELECT id FROM contracts
          WHERE company_id=${principal.companyId}
            AND notes LIKE ${`%${replayMarker}%`}
            AND is_archived=false
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const replayId = Array.isArray((replayRows as any)?.rows) ? (replayRows as any).rows[0]?.id : undefined;
        if (replayId) {
          const existing = await tx.getContractRepo().findByIdForCompany(principal.companyId, String(replayId));
          if (existing) {
            const receivables = await tx.getReceivableRepo().findByContractId(existing.id);
            return { item: existing, receivables };
          }
        }

        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!vehicle || vehicle.isArchived) throw new ContractNotFoundError();
        if (!driver || driver.isArchived) throw new ContractNotFoundError();
        // Compare civil dates in the operating timezone, without parsing CNH as a timestamp.
        if (driver.status !== DriverStatus.ACTIVE) throw new ContractConflictError('Driver is not eligible for a V2 contract');
        if (vehicle.status !== VehicleStatus.AVAILABLE) throw new ContractConflictError('Vehicle is not eligible for a V2 contract');
        const civilParts = new Intl.DateTimeFormat('en', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date());
        const today = ['year', 'month', 'day'].map(type => civilParts.find(part => part.type === type)!.value).join('-');
        if (driver.cnhExpiration && driver.cnhExpiration < today) throw new ContractConflictError('Driver CNH invalid');
        const vehicleBinding = await tx.getContractRepo().findBlockingByVehicle(principal.companyId, vehicleId);
        const driverBinding = await tx.getContractRepo().findBlockingByDriver(principal.companyId, driverId);
        if (vehicleBinding) throw new ContractConflictError('Vehicle already bound to another contract');
        if (driverBinding) throw new ContractConflictError('Driver already bound to another contract');
        if (requestedTemplateId) {
          const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);
          if (!template || template.isArchived) throw new ContractNotFoundError();
          if (!template.isCurrent || !template.isActive) throw new ContractConflictError('Contract template unavailable');
        }

        const contractNumber = requestedNumber || await generateContractNumber(principal.companyId, raw);
        if (await tx.getContractRepo().findByNumber(principal.companyId, contractNumber)) {
          throw new ContractConflictError(requestedNumber ? 'Duplicate contract number' : 'Duplicate generated contract number');
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
          status: ContractStatus.ACTIVE,
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
          notes: [optionalText(body.notes), `[V2-IDEMPOTENCY:${idempotencyKey}]`].filter(Boolean).join('\n'),
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        const boundVehicle = await tx.getVehicleRepo().updateForCompany(principal.companyId, vehicle.id, {
          status: VehicleStatus.RENTED,
          currentDriverId: driverId,
          currentContractId: created.id,
          updatedAt: now,
        });
        if (!boundVehicle) throw new ContractNotFoundError();

        const receivables = await ensureInitialContractReceivable(created, principal, tx);

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: created.id,
          action: AuditAction.CREATE, newState: auditState(created), userId: principal.userId,
          userName: principal.name, timestamp: now,
        });
        return { item: created, receivables };
      });
      res.status(201).json(result);
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
        const generatedPdf = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, existing.id, 'GENERATED_PDF', true
        );
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, existing.id, 'GENERATED_DOCX', true
        );
        if (generatedPdf || generatedDocx) throw new ContractConflictError('Contract terms are locked after document generation');

        const vehicleId = body.vehicleId === undefined ? existing.vehicleId : requiredText(body.vehicleId, 'vehicleId');
        const driverId = body.driverId === undefined ? existing.driverId : requiredText(body.driverId, 'driverId');
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!vehicle || vehicle.isArchived || !driver || driver.isArchived) throw new ContractNotFoundError();
        const vehicleBinding = await tx.getContractRepo().findBlockingByVehicle(principal.companyId, vehicleId, existing.id);
        const driverBinding = await tx.getContractRepo().findBlockingByDriver(principal.companyId, driverId, existing.id);
        if (vehicleBinding) throw new ContractConflictError('Vehicle already bound to another contract');
        if (driverBinding) throw new ContractConflictError('Driver already bound to another contract');
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
        const billingPeriodicity = body.billingPeriodicity === undefined ? existing.billingPeriodicity : periodicity(body.billingPeriodicity);
        const dueDays = billingDueDays(
          billingPeriodicity,
          body.billingDueDayOfWeek === undefined && billingPeriodicity === existing.billingPeriodicity ? existing.billingDueDayOfWeek : body.billingDueDayOfWeek,
          body.billingDueDayOfMonth === undefined && billingPeriodicity === existing.billingPeriodicity ? existing.billingDueDayOfMonth : body.billingDueDayOfMonth,
        );
        const now = new Date().toISOString();
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, existing.id, {
          contractNumber,
          vehicleId,
          driverId,
          startDate,
          endDate,
          rentalAmount: body.rentalAmount === undefined ? existing.rentalAmount : positive(body.rentalAmount, 'rentalAmount'),
          billingPeriodicity,
          billingDueDayOfWeek: dueDays.billingDueDayOfWeek,
          billingDueDayOfMonth: dueDays.billingDueDayOfMonth,
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
            return { item: contract, receivables: await ensureInitialContractReceivable(contract, principal, tx) };
          }
          throw new ContractConflictError('Active contract binding mismatch');
        }
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {
          throw new ContractConflictError('Contract lifecycle does not allow activation');
        }
        const period = await requireContractEffectivePeriod(contract, tx);
        if (contract.rentalAmount <= 0) throw new ContractConflictError('Contract rental amount incomplete');
        validateDateRange(period.effectiveStartDate, contract.endDate);
        const today = new Date().toISOString().slice(0, 10);
        if (contract.endDate && contract.endDate < today) {
          throw new ContractConflictError('Contract period already ended');
        }
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        const driver = await tx.getDriverRepo().findByIdForCompanyWithLock(principal.companyId, contract.driverId);
        if (!driver) throw new ContractNotFoundError();

        // V2: only operational exclusivity is a hard gate. Documentation,
        // insurance and CNH compliance remain visible as warnings and must not
        // strand a saved contract in DRAFT.
        ensureVehicleEligible(vehicle);
        if (driver.isArchived || driver.status !== DriverStatus.ACTIVE) {
          throw new ContractConflictError('Driver unavailable');
        }

        const vehicleConflict = await tx.getContractRepo().findBlockingByVehicle(principal.companyId, contract.vehicleId, contract.id);
        const driverConflict = await tx.getContractRepo().findBlockingByDriver(principal.companyId, contract.driverId, contract.id);
        if (vehicleConflict || driverConflict) throw new ContractConflictError('Contract binding conflict');

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

        const receivables = await ensureInitialContractReceivable(active, principal, tx);

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: active.id,
          action: AuditAction.UPDATE, previousState: auditState(contract), newState: JSON.stringify({ ...active, ...period }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return { item: active, receivables };
      });
      res.json(result);
    } catch (error) {
      sendContractError(res, error);
    }
  });

  app.post('/api/contracts/:id/suspend', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'SUSPEND_CONTRACT');
    if (!principal) return;
    try {
      const reason = requiredText(req.body?.reason, 'reason', 3);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        if (contract.status === ContractStatus.SUSPENDED) return contract;
        if (contract.status !== ContractStatus.ACTIVE) {
          throw new ContractConflictError('Contract lifecycle does not allow suspend');
        }
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        if (
          vehicle.status !== VehicleStatus.RENTED ||
          vehicle.currentContractId !== contract.id ||
          vehicle.currentDriverId !== contract.driverId
        ) {
          throw new ContractConflictError('Contract binding mismatch');
        }
        const now = new Date().toISOString();
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.SUSPENDED,
          notes: appendNote(contract.notes, 'Suspensão', reason),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
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

  app.post('/api/contracts/:id/resume', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'RESUME_CONTRACT');
    if (!principal) return;
    try {
      const reason = optionalText(req.body?.reason);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        if (
          vehicle.status !== VehicleStatus.RENTED ||
          vehicle.currentContractId !== contract.id ||
          vehicle.currentDriverId !== contract.driverId
        ) {
          throw new ContractConflictError('Contract binding mismatch');
        }
        if (contract.status === ContractStatus.ACTIVE) return contract;
        if (contract.status !== ContractStatus.SUSPENDED) {
          throw new ContractConflictError('Contract lifecycle does not allow resume');
        }

        const period = await requireContractEffectivePeriod(contract, tx);
        validateDateRange(period.effectiveStartDate, contract.endDate);
        const today = new Date().toISOString().slice(0, 10);
        if (period.effectiveStartDate > today) throw new ContractConflictError('Contract period has not started');
        if (contract.endDate && contract.endDate < today) throw new ContractConflictError('Contract period already ended');

        const driver = await tx.getDriverRepo().findByIdForCompanyWithLock(principal.companyId, contract.driverId);
        if (!driver) throw new ContractNotFoundError();
        await ensureVehicleDocumentsEligible(principal.companyId, vehicle.id, today, tx);
        if (!(await ensureVehicleInsuranceEligible(principal.companyId, vehicle.id, today, tx))) {
          throw new ContractConflictError('Vehicle insurance unavailable');
        }
        ensureDriverEligible(driver);

        const vehicleConflict = await tx.getContractRepo().findActiveByVehicle(principal.companyId, contract.vehicleId, contract.id);
        const driverConflict = await tx.getContractRepo().findActiveByDriver(principal.companyId, contract.driverId, contract.id);
        if (vehicleConflict || driverConflict) throw new ContractConflictError('Active binding conflict');

        const now = new Date().toISOString();
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.ACTIVE,
          notes: appendNote(contract.notes, 'Retomada', reason),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
        await ensureInitialContractReceivable(saved, principal, tx);
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

  app.post('/api/contracts/:id/close', async (req: Request, res: Response) => {
    const principal = requireContractPrincipal(req, res, 'CLOSE_CONTRACT');
    if (!principal) return;
    try {
      const closeDate = req.body?.closeDate === undefined
        ? new Date().toISOString().slice(0, 10)
        : normalizeDate(req.body.closeDate, 'closeDate');
      const today = new Date().toISOString().slice(0, 10);
      if (closeDate > today) throw new ContractConflictError('Close date cannot be in the future');
      const reason = optionalText(req.body?.reason);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ContractNotFoundError();
        if (contract.status === ContractStatus.CLOSED || contract.status === ContractStatus.FINISHED) return contract;
        if (contract.status !== ContractStatus.ACTIVE) {
          throw new ContractConflictError('Contract lifecycle does not allow close');
        }
        const period = await requireContractEffectivePeriod(contract, tx);
        if (closeDate < period.effectiveStartDate) throw new ContractConflictError('Close date precedes contract start');
        const vehicle = await tx.getVehicleRepo().findByIdForCompanyWithLock(principal.companyId, contract.vehicleId);
        if (!vehicle) throw new ContractNotFoundError();
        if (vehicle.currentContractId !== contract.id || vehicle.currentDriverId !== contract.driverId) {
          throw new ContractConflictError('Contract binding mismatch');
        }
        const now = new Date().toISOString();
        const endDate = contract.endDate && contract.endDate < closeDate ? contract.endDate : closeDate;
        const saved = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          status: ContractStatus.CLOSED,
          endDate,
          notes: appendNote(contract.notes, 'Encerramento', reason),
          updatedAt: now,
        });
        if (!saved) throw new ContractNotFoundError();
        const released = await tx.getVehicleRepo().updateForCompany(principal.companyId, vehicle.id, {
          status: VehicleStatus.AVAILABLE,
          currentDriverId: '',
          currentContractId: '',
          updatedAt: now,
        });
        if (!released) throw new ContractNotFoundError();
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
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {
          throw new ContractConflictError('Contract lifecycle does not allow cancel');
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
        await cancelUnpaidContractReceivables(
          contract,
          `Contrato cancelado: ${reason}`,
          principal,
          tx
        );
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
        const period = await requireContractEffectivePeriod(contract, tx);
        if (competenceDate < period.effectiveStartDate) {
          throw new ContractConflictError('Billing competence precedes contract start');
        }
        if (contract.endDate && competenceDate > contract.endDate) {
          throw new ContractConflictError('Billing competence exceeds contract end');
        }
        await assertFinancialCategoryForObligation(principal.companyId, categoryId, 'RECEIVABLE', tx);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        if (!vehicle || !driver) throw new ContractNotFoundError();
        if (vehicle.currentContractId !== contract.id || vehicle.currentDriverId !== contract.driverId) {
          throw new ContractConflictError('Contract binding mismatch');
        }
        ensureDriverEligible(driver);
        if (competenceDate === period.effectiveStartDate) {
          return (await ensureInitialContractReceivable(contract, principal, tx))
            .filter(item => item.originType === OriginType.CONTRACT_RENT);
        }
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
