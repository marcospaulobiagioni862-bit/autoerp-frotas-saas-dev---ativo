import express, { type Express, type Request, type Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { UnitOfWork } from '../db/uow';
import type { AuthenticatedPrincipal } from './auth';
import type { FileAttachment } from '../types/entities';
import { AuditAction } from '../types/enums';
import { hasDriverHealthPermission } from '../shared/security/driverHealthAuthorization';
import {
  AttachmentStorageNotFoundError,
  AttachmentStorageUnavailableError,
  AttachmentStorageValidationError,
  MAX_ATTACHMENT_BYTES,
  ServerAttachmentStorage,
} from './attachmentStorage';

type AttachmentAction = 'VIEW_ATTACHMENT' | 'CREATE_ATTACHMENT' | 'ARCHIVE_ATTACHMENT' | 'RESTORE_ATTACHMENT';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const DEFAULT_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const ENTITY_TYPES = new Set(['Vehicle', 'Driver', 'Contract', 'HealthAndEmergency']);

class AttachmentValidationError extends Error {}
class AttachmentNotFoundError extends Error {}
class AttachmentForbiddenError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function hasAttachmentPermission(principal: AuthenticatedPrincipal, action: AttachmentAction): boolean {
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) return false;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return true;
  if (action === 'VIEW_ATTACHMENT') return true;
  return DEFAULT_WRITE_ROLES.has(role);
}

function requireAttachmentPrincipal(req: Request, res: Response, action: AttachmentAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  if (!hasAttachmentPermission(principal, action)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function header(req: Request, name: string, required = false): string | undefined {
  const raw = req.get(name);
  if (!raw) {
    if (required) throw new AttachmentValidationError(`Missing ${name}`);
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new AttachmentValidationError(`Invalid ${name}`);
  }
  decoded = decoded.trim();
  if (!decoded && required) throw new AttachmentValidationError(`Missing ${name}`);
  return decoded || undefined;
}

function validateFilename(fileName: string): string {
  if (fileName.length > 180 || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || /[\u0000-\u001f]/.test(fileName)) {
    throw new AttachmentValidationError('Invalid file name');
  }
  return fileName;
}

function optionalIsoDate(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AttachmentValidationError(`Invalid ${field}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AttachmentValidationError(`Invalid ${field}`);
  }
  return value;
}

function healthContext(principal: AuthenticatedPrincipal) {
  return {
    userId: principal.userId,
    role: principal.role,
    active: true,
    companyId: principal.companyId,
    permissions: principal.permissions,
  };
}

async function validateEntity(
  tx: any,
  principal: AuthenticatedPrincipal,
  entityType: string,
  entityId: string,
  write: boolean
): Promise<void> {
  if (!ENTITY_TYPES.has(entityType)) throw new AttachmentValidationError('Invalid entity type');
  if (!entityId || entityId.length > 120) throw new AttachmentValidationError('Invalid entity id');

  if (entityType === 'Vehicle') {
    const item = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, entityId);
    if (!item || item.isArchived) throw new AttachmentNotFoundError();
    return;
  }
  if (entityType === 'Contract') {
    const item = await tx.getContractRepo().findByIdForCompany(principal.companyId, entityId);
    if (!item || item.isArchived) throw new AttachmentNotFoundError();
    return;
  }

  const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, entityId);
  if (!driver || driver.isArchived) throw new AttachmentNotFoundError();
  if (entityType === 'HealthAndEmergency') {
    const action = write ? 'EDIT_DRIVER_HEALTH' : 'VIEW_DRIVER_HEALTH';
    if (!hasDriverHealthPermission(action, healthContext(principal))) throw new AttachmentForbiddenError();
  }
}

function sendAttachmentError(res: Response, error: unknown): void {
  if (error instanceof AttachmentForbiddenError) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (error instanceof AttachmentNotFoundError || error instanceof AttachmentStorageNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof AttachmentValidationError || error instanceof AttachmentStorageValidationError) {
    res.status(400).json({ error: 'Invalid attachment request' });
    return;
  }
  if (error instanceof AttachmentStorageUnavailableError) {
    res.status(503).json({ error: 'Attachment storage unavailable' });
    return;
  }
  console.error('AUTOERP_ATTACHMENT_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Attachment operation failed' });
}

function auditState(item: FileAttachment): string {
  return JSON.stringify({
    entityType: item.entityType,
    entityId: item.entityId,
    documentType: item.documentType,
    fileName: item.fileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    checksum: item.checksum,
    storageProvider: item.storageProvider,
    contentState: item.contentState,
    isArchived: item.isArchived,
  });
}

export function registerAttachmentRoutes(app: Express): void {
  const storage = new ServerAttachmentStorage();

  app.get('/api/attachments', async (req: Request, res: Response) => {
    const principal = requireAttachmentPrincipal(req, res, 'VIEW_ATTACHMENT');
    if (!principal) return;
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '';
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        if (entityType || entityId) {
          if (!entityType || !entityId) throw new AttachmentValidationError('Both entityType and entityId are required');
          await validateEntity(tx, principal, entityType, entityId, false);
          return await tx.getAttachmentRepo().findByEntity(principal.companyId, entityType, entityId);
        }
        return await tx.getAttachmentRepo().findAllByCompany(principal.companyId);
      });
      res.json({ items });
    } catch (error) {
      sendAttachmentError(res, error);
    }
  });

  app.get('/api/attachments/:id', async (req: Request, res: Response) => {
    const principal = requireAttachmentPrincipal(req, res, 'VIEW_ATTACHMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const found = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!found) throw new AttachmentNotFoundError();
        await validateEntity(tx, principal, found.entityType, found.entityId, false);
        return found;
      });
      res.json({ item });
    } catch (error) {
      sendAttachmentError(res, error);
    }
  });

  app.post(
    '/api/attachments',
    express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }),
    async (req: Request, res: Response) => {
      const principal = requireAttachmentPrincipal(req, res, 'CREATE_ATTACHMENT');
      if (!principal) return;
      let storageKey: string | undefined;
      try {
        const entityType = header(req, 'x-autoerp-entity-type', true)!;
        const entityId = header(req, 'x-autoerp-entity-id', true)!;
        const documentType = header(req, 'x-autoerp-document-type');
        const fileName = validateFilename(header(req, 'x-autoerp-file-name', true)!);
        const description = header(req, 'x-autoerp-description');
        const issueDate = optionalIsoDate(header(req, 'x-autoerp-issue-date'), 'issueDate');
        const expirationDate = optionalIsoDate(header(req, 'x-autoerp-expiration-date'), 'expirationDate');
        const mimeType = String(req.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new AttachmentValidationError('Invalid mime type');
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new AttachmentValidationError('Empty file');
        if (req.body.length > MAX_ATTACHMENT_BYTES) {
          res.status(413).json({ error: 'Attachment too large' });
          return;
        }

        await UnitOfWork.run(principal.companyId, async (tx) => {
          await validateEntity(tx, principal, entityType, entityId, true);
        });

        const id = randomUUID();
        const stored = await storage.write(principal.companyId, id, req.body);
        storageKey = stored.storageKey;
        const now = new Date().toISOString();

        const item = await UnitOfWork.run(principal.companyId, async (tx) => {
          await validateEntity(tx, principal, entityType, entityId, true);
          const created = await tx.getAttachmentRepo().create({
            id,
            companyId: principal.companyId,
            entityName: entityType,
            entityType,
            entityId,
            documentType,
            fileName,
            fileSize: stored.fileSize,
            mimeType,
            uploadedBy: principal.name,
            storageProvider: 'SERVER_FS',
            storageKey: stored.storageKey,
            checksum: stored.checksum,
            createdBy: principal.userId,
            isArchived: false,
            contentState: 'AVAILABLE',
            description,
            issueDate,
            expirationDate,
            createdAt: now,
          });
          await tx.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'FileAttachment',
            entityId: created.id,
            action: AuditAction.CREATE,
            newState: auditState(created),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
          return created;
        });
        res.status(201).json({ item });
      } catch (error) {
        if (storageKey && principal) {
          await storage.remove(principal.companyId, storageKey).catch((cleanupError) => {
            console.error('AUTOERP_ATTACHMENT_COMPENSATION_FAILURE', cleanupError);
          });
        }
        sendAttachmentError(res, error);
      }
    }
  );

  app.get('/api/attachments/:id/content', async (req: Request, res: Response) => {
    const principal = requireAttachmentPrincipal(req, res, 'VIEW_ATTACHMENT');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const found = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!found || found.isArchived) throw new AttachmentNotFoundError();
        await validateEntity(tx, principal, found.entityType, found.entityId, false);
        if (found.storageProvider !== 'SERVER_FS' || found.contentState !== 'AVAILABLE' || !found.storageKey) {
          throw new AttachmentNotFoundError();
        }
        return found;
      });
      const bytes = await storage.read(principal.companyId, item.storageKey!);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== item.fileSize || !item.checksum || checksum !== item.checksum) {
        throw new Error('Attachment integrity mismatch');
      }
      await UnitOfWork.run(principal.companyId, async (tx) => {
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'FileAttachment', entityId: item.id,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({ event: 'DOWNLOAD', checksum }), timestamp: new Date().toISOString(),
        });
      });
      const safeName = item.fileName.replace(/[\r\n"]/g, '_');
      res.setHeader('content-type', item.mimeType);
      res.setHeader('content-length', String(bytes.length));
      res.setHeader('content-disposition', `inline; filename="${safeName}"`);
      res.setHeader('x-content-type-options', 'nosniff');
      res.send(bytes);
    } catch (error) {
      sendAttachmentError(res, error);
    }
  });

  for (const lifecycle of [
    { path: 'archive', action: 'ARCHIVE_ATTACHMENT' as const, archived: true },
    { path: 'restore', action: 'RESTORE_ATTACHMENT' as const, archived: false },
  ]) {
    app.post(`/api/attachments/:id/${lifecycle.path}`, async (req: Request, res: Response) => {
      const principal = requireAttachmentPrincipal(req, res, lifecycle.action);
      if (!principal) return;
      try {
        const item = await UnitOfWork.run(principal.companyId, async (tx) => {
          const existing = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, req.params.id);
          if (!existing) throw new AttachmentNotFoundError();
          await validateEntity(tx, principal, existing.entityType, existing.entityId, true);
          if (existing.isArchived === lifecycle.archived) return existing;
          const saved = await tx.getAttachmentRepo().updateForCompany(principal.companyId, existing.id, { isArchived: lifecycle.archived });
          if (!saved) throw new AttachmentNotFoundError();
          await tx.getAuditLogRepo().create({
            id: randomUUID(), companyId: principal.companyId, entityName: 'FileAttachment', entityId: existing.id,
            action: AuditAction.UPDATE, previousState: JSON.stringify({ isArchived: existing.isArchived }),
            newState: JSON.stringify({ isArchived: saved.isArchived, event: lifecycle.path.toUpperCase() }),
            userId: principal.userId, userName: principal.name, timestamp: new Date().toISOString(),
          });
          return saved;
        });
        res.json({ item });
      } catch (error) {
        sendAttachmentError(res, error);
      }
    });
  }
}
