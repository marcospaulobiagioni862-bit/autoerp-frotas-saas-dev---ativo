import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { PayableService } from '../domain/finance/PayableService';
import { AuditAction, DocumentStatus, OriginType } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import type { DocumentRecord, DocumentSubjectType, Driver } from '../types/entities';
import {
  evaluateDocumentCompliance,
  isAnnualVehicleDocument,
  normalizeDocumentType,
  parseIsoDate,
  parseReferenceYear,
} from '../domain/documents/documentPolicy';

type DocumentAction = 'VIEW_DOCUMENT' | 'CREATE_DOCUMENT' | 'VERSION_DOCUMENT' | 'ARCHIVE_DOCUMENT' | 'RESTORE_DOCUMENT';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const SUBJECT_TYPES = new Set<DocumentSubjectType>(['VEHICLE', 'DRIVER']);

class DocumentValidationError extends Error {}
class DocumentNotFoundError extends Error {}
class DocumentConflictError extends Error {}
class DocumentForbiddenError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasPermission(principal: AuthenticatedPrincipal, action: DocumentAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  if (action === 'VIEW_DOCUMENT') return true;
  return DEFAULT_WRITE_ROLES.has(role);
}

function requirePrincipal(req: Request, res: Response, action: DocumentAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasPermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function optionalText(value: unknown, max = 1000): string | undefined {
  if (value === undefined || value === null) return undefined;
  const clean = String(value).trim();
  if (!clean) return undefined;
  if (clean.length > max) throw new DocumentValidationError('Invalid text field');
  return clean;
}

function subjectTypeFrom(value: unknown): DocumentSubjectType {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() as DocumentSubjectType : '' as DocumentSubjectType;
  if (!SUBJECT_TYPES.has(normalized)) throw new DocumentValidationError('Invalid subjectType');
  return normalized;
}

function positiveCost(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new DocumentValidationError('Invalid cost');
  return Math.round(parsed * 100) / 100;
}

function booleanQuery(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw new DocumentValidationError('Invalid boolean filter');
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
  if (error instanceof DocumentValidationError) {
    res.status(400).json({ error: 'Invalid document request' });
    return;
  }
  if (error instanceof DocumentForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof DocumentNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof DocumentConflictError || isUniqueViolation(error)) {
    res.status(409).json({ error: 'Document conflict' });
    return;
  }
  console.error('AUTOERP_DOCUMENT_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Document operation failed' });
}

function auditState(item: DocumentRecord): string {
  return JSON.stringify({
    subjectType: item.subjectType,
    subjectId: item.subjectId,
    documentType: item.documentType,
    documentNumber: item.documentNumber,
    referenceYear: item.referenceYear,
    issueDate: item.issueDate,
    expirationDate: item.expirationDate,
    attachmentId: item.attachmentId,
    versionNumber: item.versionNumber,
    supersedesDocumentId: item.supersedesDocumentId,
    isCurrent: item.isCurrent,
    isArchived: item.isArchived,
    cost: item.cost,
    payableId: item.payableId,
    complianceStatus: item.complianceStatus,
    daysToExpiration: item.daysToExpiration,
    alertStage: item.alertStage,
  });
}

async function validateSubject(tx: any, companyId: string, subjectType: DocumentSubjectType, subjectId: string): Promise<Driver | undefined> {
  if (!subjectId || subjectId.length > 120) throw new DocumentValidationError('Invalid subjectId');
  if (subjectType === 'VEHICLE') {
    const vehicle = await tx.getVehicleRepo().findByIdForCompany(companyId, subjectId);
    if (!vehicle || vehicle.isArchived) throw new DocumentNotFoundError();
    return undefined;
  }
  const driver = await tx.getDriverRepo().findByIdForCompany(companyId, subjectId);
  if (!driver || driver.isArchived) throw new DocumentNotFoundError();
  return driver;
}

async function validateAttachment(
  tx: any,
  companyId: string,
  subjectType: DocumentSubjectType,
  subjectId: string,
  attachmentId?: string
): Promise<void> {
  if (!attachmentId) return;
  const attachment = await tx.getAttachmentRepo().findByIdForCompany(companyId, attachmentId);
  if (!attachment || attachment.isArchived || attachment.storageProvider !== 'SERVER_FS' || attachment.contentState !== 'AVAILABLE') {
    throw new DocumentNotFoundError();
  }
  const expectedEntity = subjectType === 'VEHICLE' ? 'Vehicle' : 'Driver';
  if (attachment.entityType !== expectedEntity || attachment.entityId !== subjectId) {
    throw new DocumentNotFoundError();
  }
}

function cnhFields(driver: Driver, documentNumber: string | undefined, expirationDate: string | undefined): { documentNumber: string; expirationDate: string } {
  if (documentNumber && documentNumber.replace(/\D/g, '') !== driver.cnhNumber.replace(/\D/g, '')) {
    throw new DocumentValidationError('CNH number cannot diverge from Driver core');
  }
  if (expirationDate && expirationDate !== driver.cnhExpiration) {
    throw new DocumentValidationError('CNH expiration cannot diverge from Driver core');
  }
  return { documentNumber: driver.cnhNumber, expirationDate: driver.cnhExpiration };
}

interface BuildDocumentInput {
  subjectType: DocumentSubjectType;
  subjectId: string;
  documentType: string;
  documentNumber?: string;
  referenceYear?: number;
  issueDate?: string;
  expirationDate?: string;
  attachmentId?: string;
  cost: number;
  notes?: string;
}

async function normalizeInput(tx: any, companyId: string, body: any, fallback?: DocumentRecord): Promise<BuildDocumentInput> {
  const subjectType = fallback?.subjectType ?? subjectTypeFrom(body?.subjectType);
  const subjectId = fallback?.subjectId ?? optionalText(body?.subjectId, 120);
  if (!subjectId) throw new DocumentValidationError('Missing subjectId');
  const documentType = fallback?.documentType ?? normalizeDocumentType(body?.documentType);
  let referenceYear = body?.referenceYear !== undefined
    ? parseReferenceYear(body.referenceYear)
    : fallback?.referenceYear;
  if (subjectType === 'VEHICLE' && isAnnualVehicleDocument(documentType)) {
    referenceYear = parseReferenceYear(referenceYear, true);
  }

  const driver = await validateSubject(tx, companyId, subjectType, subjectId);
  const attachmentId = body?.attachmentId !== undefined
    ? optionalText(body.attachmentId, 120)
    : fallback?.attachmentId;
  await validateAttachment(tx, companyId, subjectType, subjectId, attachmentId);

  let documentNumber = body?.documentNumber !== undefined
    ? optionalText(body.documentNumber, 160)
    : fallback?.documentNumber;
  let expirationDate = body?.expirationDate !== undefined
    ? parseIsoDate(body.expirationDate, 'expirationDate')
    : fallback?.expirationDate;
  const issueDate = body?.issueDate !== undefined
    ? parseIsoDate(body.issueDate, 'issueDate')
    : fallback?.issueDate;

  if (documentType === 'CNH') {
    if (subjectType !== 'DRIVER' || !driver) throw new DocumentValidationError('CNH requires DRIVER subject');
    ({ documentNumber, expirationDate } = cnhFields(driver, documentNumber, expirationDate));
  }

  return {
    subjectType,
    subjectId,
    documentType,
    documentNumber,
    referenceYear,
    issueDate,
    expirationDate,
    attachmentId,
    cost: positiveCost(body?.cost, fallback?.cost ?? 0),
    notes: body?.notes !== undefined ? optionalText(body.notes, 4000) : fallback?.notes,
  };
}

async function createPayableIfRequested(
  tx: any,
  principal: AuthenticatedPrincipal,
  item: DocumentRecord,
  body: any
): Promise<DocumentRecord> {
  if (body?.generatePayable !== true || item.subjectType !== 'VEHICLE' || item.cost <= 0) return item;
  if (!item.expirationDate) throw new DocumentValidationError('expirationDate is required for payable generation');
  const categoryId = optionalText(body?.categoryId, 120) || 'cat-doc-default';
  const payables = await PayableService.create({
    companyId: principal.companyId,
    originType: OriginType.DOCUMENTATION,
    originId: item.id,
    vehicleId: item.subjectId,
    categoryId,
    description: `Obrigação Documental: ${item.documentType} (${item.documentNumber || 'N/A'})`,
    totalAmount: item.cost,
    dueDate: item.expirationDate,
    userId: principal.userId,
    userName: principal.name,
  }, tx);
  const payableId = payables[0]?.id;
  if (!payableId) throw new Error('Document payable creation failed');
  const updated = await tx.getDocumentRepo().updateForCompany(principal.companyId, item.id, {
    payableId,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) throw new Error('Document payable linkage failed');
  return updated;
}

export function registerDocumentRoutes(app: Express): void {
  app.get('/api/documents/alerts', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DOCUMENT');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) =>
        (await tx.getDocumentRepo().findAllByCompany(principal.companyId, { currentOnly: true, includeArchived: false }))
          .filter((item: DocumentRecord) => item.alertStage !== 'NONE')
      );
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/documents', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DOCUMENT');
    if (!principal) return;
    try {
      const filters = {
        subjectType: req.query.subjectType ? subjectTypeFrom(req.query.subjectType) : undefined,
        subjectId: optionalText(req.query.subjectId, 120),
        documentType: req.query.documentType ? normalizeDocumentType(req.query.documentType) : undefined,
        referenceYear: req.query.referenceYear ? parseReferenceYear(req.query.referenceYear) : undefined,
        currentOnly: booleanQuery(req.query.currentOnly, true),
        includeArchived: booleanQuery(req.query.includeArchived, false),
      };
      let items = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getDocumentRepo().findAllByCompany(principal.companyId, filters)
      );
      if (req.query.status) {
        const status = String(req.query.status).toUpperCase() as DocumentStatus;
        if (!Object.values(DocumentStatus).includes(status)) throw new DocumentValidationError('Invalid status');
        items = items.filter((item: DocumentRecord) => item.complianceStatus === status);
      }
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/documents/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DOCUMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getDocumentRepo().findByIdForCompany(principal.companyId, req.params.id)
      );
      if (!item) throw new DocumentNotFoundError();
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/documents/:id/versions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_DOCUMENT');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        const item = await tx.getDocumentRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!item) throw new DocumentNotFoundError();
        return await tx.getDocumentRepo().findVersions(
          principal.companyId,
          item.subjectType,
          item.subjectId,
          item.documentType,
          item.referenceYear
        );
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/documents', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'CREATE_DOCUMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const input = await normalizeInput(tx, principal.companyId, req.body);
        const current = await tx.getDocumentRepo().findCurrentWithLock(
          principal.companyId, input.subjectType, input.subjectId, input.documentType, input.referenceYear
        );
        if (current) throw new DocumentConflictError();
        const now = new Date().toISOString();
        const derived = evaluateDocumentCompliance(input.expirationDate, Boolean(input.attachmentId));
        let created = await tx.getDocumentRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          ...input,
          versionNumber: 1,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
          ...derived,
        });
        created = await createPayableIfRequested(tx, principal, created, req.body);
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Document', entityId: created.id,
          action: AuditAction.CREATE, newState: auditState(created), userId: principal.userId,
          userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/documents/:id/versions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VERSION_DOCUMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const base = await tx.getDocumentRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!base || base.isArchived) throw new DocumentNotFoundError();
        const current = await tx.getDocumentRepo().findCurrentWithLock(
          principal.companyId, base.subjectType, base.subjectId, base.documentType, base.referenceYear
        );
        if (!current) throw new DocumentNotFoundError();
        if (current.id !== base.id) throw new DocumentConflictError();
        const input = await normalizeInput(tx, principal.companyId, req.body, current);
        if (input.subjectType !== current.subjectType || input.subjectId !== current.subjectId || input.documentType !== current.documentType || (input.referenceYear ?? 0) !== (current.referenceYear ?? 0)) {
          throw new DocumentValidationError('Semantic key cannot change during versioning');
        }
        const now = new Date().toISOString();
        const previous = await tx.getDocumentRepo().updateForCompany(principal.companyId, current.id, {
          isCurrent: false,
          updatedAt: now,
        });
        if (!previous) throw new DocumentNotFoundError();
        const derived = evaluateDocumentCompliance(input.expirationDate, Boolean(input.attachmentId));
        let created = await tx.getDocumentRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          ...input,
          versionNumber: current.versionNumber + 1,
          supersedesDocumentId: current.id,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
          ...derived,
        });
        created = await createPayableIfRequested(tx, principal, created, req.body);
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Document', entityId: current.id,
          action: AuditAction.UPDATE, previousState: auditState(current), newState: auditState(previous),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Document', entityId: created.id,
          action: AuditAction.CREATE, newState: auditState(created), userId: principal.userId,
          userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/documents/:id/archive', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'ARCHIVE_DOCUMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const existing = await tx.getDocumentRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!existing) throw new DocumentNotFoundError();
        if (existing.isArchived) return existing;
        const now = new Date().toISOString();
        const saved = await tx.getDocumentRepo().updateForCompany(principal.companyId, existing.id, {
          isArchived: true,
          isCurrent: false,
          updatedAt: now,
        });
        if (!saved) throw new DocumentNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Document', entityId: existing.id,
          action: AuditAction.ARCHIVE, previousState: auditState(existing), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/documents/:id/restore', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'RESTORE_DOCUMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const existing = await tx.getDocumentRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!existing) throw new DocumentNotFoundError();
        if (!existing.isArchived) return existing;
        const current = await tx.getDocumentRepo().findCurrentWithLock(
          principal.companyId, existing.subjectType, existing.subjectId, existing.documentType, existing.referenceYear
        );
        if (current && current.id !== existing.id) throw new DocumentConflictError();
        await validateSubject(tx, principal.companyId, existing.subjectType, existing.subjectId);
        await validateAttachment(tx, principal.companyId, existing.subjectType, existing.subjectId, existing.attachmentId);
        const now = new Date().toISOString();
        const saved = await tx.getDocumentRepo().updateForCompany(principal.companyId, existing.id, {
          isArchived: false,
          isCurrent: true,
          updatedAt: now,
        });
        if (!saved) throw new DocumentNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Document', entityId: existing.id,
          action: AuditAction.RESTORE, previousState: auditState(existing), newState: auditState(saved),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return saved;
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });
}
