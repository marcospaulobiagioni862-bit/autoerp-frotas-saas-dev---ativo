import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { ContractTemplatePolicyError, validateContractTemplateContent } from '../domain/contracts/contractTemplatePolicy';
import {
  MOVEFLEX_APPROVED_CONTRACT_MASTERS,
  MOVEFLEX_DEFAULT_TEMPLATE_KEY,
  getMoveFlexApprovedContractMaster,
  type MoveFlexApprovedContractMaster,
} from '../domain/contracts/moveflexApprovedContractMaster';

type TemplateAction = 'VIEW_CONTRACT_TEMPLATE' | 'MANAGE_CONTRACT_TEMPLATE';
type TemplateSourceMode = 'MARKDOWN' | 'FILE';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER']);

class TemplateValidationError extends Error {}
class TemplateNotFoundError extends Error {}
class TemplateConflictError extends Error {}
class ApprovedMasterLockedError extends Error {}
class ApprovedMasterMismatchError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response, action: TemplateAction): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  if (!principal.userId || !principal.companyId || !CANONICAL_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return principal;
  if (action === 'VIEW_CONTRACT_TEMPLATE') return principal;
  if (!WRITE_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function text(value: unknown, field: string, min = 1, max = 200): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean.length < min || clean.length > max) throw new TemplateValidationError(`Invalid ${field}`);
  return clean;
}

function sourceMode(value: unknown): TemplateSourceMode {
  if (value === undefined || value === 'MARKDOWN') return 'MARKDOWN';
  if (value === 'FILE') return 'FILE';
  throw new TemplateValidationError('Invalid sourceMode');
}

function templateKey(value: unknown): string {
  const clean = text(value, 'templateKey', 2, 80).toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(clean)) throw new TemplateValidationError('Invalid templateKey');
  return clean;
}

const SAVED_CONTRACT_KEY = /^modelo-contrato-(\d+)$/;

async function nextSavedContractKey(tx: any, companyId: string): Promise<string> {
  const raw = tx.getRawTransaction?.();
  if (!raw) throw new Error('Contract template sequence authority unavailable');
  await raw.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${`${companyId}:saved-contract-template-sequence`})))`);
  const all = await tx.getContractTemplateRepo().findAllByCompany(companyId, true);
  let maxNumber = 0;
  for (const item of all) {
    const match = SAVED_CONTRACT_KEY.exec(String(item.templateKey || ''));
    if (!match) continue;
    maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
  }
  return `modelo-contrato-${String(maxNumber + 1).padStart(2, '0')}`;
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function rejectAuthorityFields(body: Record<string, unknown>): void {
  const forbidden = ['companyId','createdBy','versionNumber','supersedesTemplateId','isCurrent','isArchived','createdAt','updatedAt'];
  if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    throw new TemplateValidationError('Invalid template authority surface');
  }
}

function contentForMode(body: Record<string, unknown>, mode: TemplateSourceMode, fallback?: string): string {
  if (mode === 'FILE') return '';
  const raw = body.contentMarkdown === undefined ? fallback : body.contentMarkdown;
  const contentMarkdown = text(raw, 'contentMarkdown', 10, 100_000);
  validateContractTemplateContent(contentMarkdown);
  return contentMarkdown;
}

async function approvedMasterSource(
  tx: any,
  companyId: string,
  template: any,
  master: MoveFlexApprovedContractMaster,
): Promise<any | undefined> {
  if (!template || template.isArchived || template.contentMarkdown.trim()) return undefined;
  const attachments = await tx.getAttachmentRepo().findByEntity(companyId, 'ContractTemplate', template.id);
  const sources = attachments.filter((attachment: any) =>
    !attachment.isArchived &&
    attachment.documentType === 'CONTRACT_TEMPLATE_SOURCE' &&
    attachment.mimeType === DOCX_MIME &&
    attachment.contentState === 'AVAILABLE'
  );
  if (sources.length !== 1) return undefined;
  const source = sources[0];
  return source.checksum === master.sha256 && source.fileSize === master.fileSize ? source : undefined;
}

async function hasNoActiveTemplateSource(tx: any, companyId: string, template: any): Promise<boolean> {
  if (!template || template.isArchived || template.contentMarkdown.trim()) return false;
  const attachments = await tx.getAttachmentRepo().findByEntity(companyId, 'ContractTemplate', template.id);
  return !attachments.some((attachment: any) =>
    !attachment.isArchived &&
    attachment.documentType === 'CONTRACT_TEMPLATE_SOURCE' &&
    attachment.contentState === 'AVAILABLE'
  );
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
  if (error instanceof ApprovedMasterMismatchError) {
    res.status(400).json({ error: 'O arquivo não corresponde ao arquivo mestre aprovado da MoveFlex.' });
    return;
  }
  if (error instanceof ApprovedMasterLockedError) {
    res.status(409).json({ error: 'O modelo padrão MoveFlex é imutável e só aceita o arquivo mestre aprovado.' });
    return;
  }
  if (error instanceof TemplateValidationError || error instanceof ContractTemplatePolicyError) {
    res.status(400).json({ error: 'Invalid contract template request' });
    return;
  }
  if (error instanceof TemplateNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof TemplateConflictError || isUniqueViolation(error)) {
    res.status(409).json({ error: 'Contract template conflict' });
    return;
  }
  console.error('AUTOERP_CONTRACT_TEMPLATE_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Contract template operation failed' });
}

export function registerContractTemplateRoutes(app: Express): void {
  app.post('/api/contract-templates/ensure-moveflex-default', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_CONTRACT_TEMPLATE');
    if (!principal) return;
    try {
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const ensured = [];
        let createdCount = 0;

        for (const master of MOVEFLEX_APPROVED_CONTRACT_MASTERS) {
          const current = await tx.getContractTemplateRepo().findCurrentWithLock(principal.companyId, master.templateKey);
          const exactSource = current
            ? await approvedMasterSource(tx, principal.companyId, current, master)
            : undefined;

          if (current && !current.isArchived && !current.contentMarkdown.trim() && exactSource) {
            if (current.isActive && current.title === master.title) {
              ensured.push(current);
            } else {
              const now = new Date().toISOString();
              const activated = await tx.getContractTemplateRepo().updateForCompany(principal.companyId, current.id, {
                title: master.title,
                isActive: true,
                updatedAt: now,
              });
              if (!activated) throw new TemplateConflictError();
              ensured.push(activated);
            }
            continue;
          }

          if (
            current &&
            !current.isArchived &&
            current.isCurrent &&
            !current.isActive &&
            !current.contentMarkdown.trim() &&
            current.title === master.title &&
            await hasNoActiveTemplateSource(tx, principal.companyId, current)
          ) {
            ensured.push(current);
            continue;
          }

          const versions = await tx.getContractTemplateRepo().findVersions(principal.companyId, master.templateKey);
          const now = new Date().toISOString();
          if (current) {
            const demoted = await tx.getContractTemplateRepo().updateForCompany(principal.companyId, current.id, {
              isCurrent: false,
              isActive: false,
              updatedAt: now,
            });
            if (!demoted) throw new TemplateConflictError();
          }

          const created = await tx.getContractTemplateRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            templateKey: master.templateKey,
            title: master.title,
            contentMarkdown: '',
            versionNumber: Math.max(...versions.map((version) => version.versionNumber), 0) + 1,
            supersedesTemplateId: current?.id,
            isCurrent: true,
            isActive: false,
            isArchived: false,
            createdBy: principal.userId,
            createdAt: now,
            updatedAt: now,
          });
          await tx.getAuditLogRepo().create({
            id: randomUUID(),
            companyId: principal.companyId,
            entityName: 'ContractTemplate',
            entityId: created.id,
            action: AuditAction.CREATE,
            previousState: current ? JSON.stringify(current) : undefined,
            newState: JSON.stringify({
              event: 'ENSURE_MOVEFLEX_APPROVED_MASTER_PENDING',
              templateKey: created.templateKey,
              versionNumber: created.versionNumber,
              approvedFileName: master.fileName,
              approvedSha256: master.sha256,
            }),
            userId: principal.userId,
            userName: principal.name,
            timestamp: now,
          });
          ensured.push(created);
          createdCount += 1;
        }

        const item = ensured.find((template) => template.templateKey === MOVEFLEX_DEFAULT_TEMPLATE_KEY) || ensured[0];
        if (!item) throw new TemplateConflictError();
        return { item, items: ensured, created: createdCount > 0 };
      });
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/contract-templates', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_CONTRACT_TEMPLATE');
    if (!principal) return;
    try {
      const includeArchived = req.query.includeArchived === 'true';
      const currentOnly = req.query.currentOnly !== 'false';
      const activeOnly = req.query.activeOnly !== 'false';
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        const all = await tx.getContractTemplateRepo().findAllByCompany(principal.companyId, includeArchived);
        const base = all.filter((item) =>
          (!currentOnly || item.isCurrent) &&
          (!activeOnly || item.isActive) &&
          (includeArchived || !item.isArchived)
        );

        // Operational selectors use the default activeOnly=true list. Approved
        // MoveFlex standards are exposed there only when the currently linked
        // file is byte-for-byte the approved master. Management screens ask for
        // activeOnly=false and still see invalid/legacy sources so they can be
        // repaired without deleting history.
        if (!activeOnly) return base;

        const operational: typeof base = [];
        for (const item of base) {
          const master = getMoveFlexApprovedContractMaster(item.templateKey);
          if (!master || await approvedMasterSource(tx, principal.companyId, item, master)) {
            operational.push(item);
          }
        }
        return operational;
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/contract-templates/:id', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_CONTRACT_TEMPLATE');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) =>
        await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, req.params.id)
      );
      if (!item || item.isArchived) throw new TemplateNotFoundError();
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/contract-templates/:id/versions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_CONTRACT_TEMPLATE');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!template) throw new TemplateNotFoundError();
        return await tx.getContractTemplateRepo().findVersions(principal.companyId, template.templateKey);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/contract-templates', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'MANAGE_CONTRACT_TEMPLATE');
    if (!principal) return;
    const body = bodyOf(req);
    try {
      rejectAuthorityFields(body);
      const requestedKey = body.templateKey === undefined || body.templateKey === null || String(body.templateKey).trim() === ''
        ? undefined
        : templateKey(body.templateKey);
      const title = text(body.title, 'title', 2, 160);
      const mode = sourceMode(body.sourceMode);
      const contentMarkdown = contentForMode(body, mode);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const key = requestedKey || await nextSavedContractKey(tx, principal.companyId);
        if (getMoveFlexApprovedContractMaster(key)) throw new ApprovedMasterLockedError();
        const existing = await tx.getContractTemplateRepo().findCurrentWithLock(principal.companyId, key);
        if (existing) throw new TemplateConflictError();
        const versions = await tx.getContractTemplateRepo().findVersions(principal.companyId, key);
        const nextVersionNumber = Math.max(...versions.map((version) => version.versionNumber), 0) + 1;
        const now = new Date().toISOString();
        const created = await tx.getContractTemplateRepo().create({
          id: randomUUID(), companyId: principal.companyId, templateKey: key, title, contentMarkdown,
          versionNumber: nextVersionNumber, isCurrent: true,
          isActive: mode === 'FILE' ? false : body.isActive === false ? false : true,
          isArchived: false, createdBy: principal.userId, createdAt: now, updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractTemplate', entityId: created.id,
          action: AuditAction.CREATE, newState: JSON.stringify({ ...created, sourceMode: mode }), userId: principal.userId,
          userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/contract-templates/:id/versions', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'MANAGE_CONTRACT_TEMPLATE');
    if (!principal) return;
    const body = bodyOf(req);
    try {
      rejectAuthorityFields(body);
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const source = await tx.getContractTemplateRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!source || source.isArchived) throw new TemplateNotFoundError();
        if (getMoveFlexApprovedContractMaster(source.templateKey)) throw new ApprovedMasterLockedError();
        const current = await tx.getContractTemplateRepo().findCurrentWithLock(principal.companyId, source.templateKey);
        if (!current || current.id !== source.id) throw new TemplateConflictError();
        const title = body.title === undefined ? source.title : text(body.title, 'title', 2, 160);
        const mode = sourceMode(body.sourceMode ?? (source.contentMarkdown.trim() ? 'MARKDOWN' : 'FILE'));
        const contentMarkdown = contentForMode(body, mode, source.contentMarkdown);
        const versions = await tx.getContractTemplateRepo().findVersions(principal.companyId, source.templateKey);
        const nextVersionNumber = Math.max(...versions.map((version) => version.versionNumber), 0) + 1;
        const now = new Date().toISOString();

        if (mode === 'MARKDOWN') {
          const old = await tx.getContractTemplateRepo().updateForCompany(principal.companyId, source.id, {
            isCurrent: false, updatedAt: now,
          });
          if (!old) throw new TemplateNotFoundError();
        }

        const created = await tx.getContractTemplateRepo().create({
          id: randomUUID(), companyId: principal.companyId, templateKey: source.templateKey, title, contentMarkdown,
          versionNumber: nextVersionNumber, supersedesTemplateId: source.id,
          isCurrent: mode === 'MARKDOWN',
          isActive: mode === 'FILE' ? false : body.isActive === undefined ? source.isActive : body.isActive === true,
          isArchived: false, createdBy: principal.userId, createdAt: now, updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractTemplate', entityId: created.id,
          action: AuditAction.CREATE, previousState: JSON.stringify(source), newState: JSON.stringify({ ...created, sourceMode: mode }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/contract-templates/:id/promote-file-source', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'MANAGE_CONTRACT_TEMPLATE');
    if (!principal) return;
    try {
      const item = await UnitOfWork.run(principal.companyId, async (tx) => {
        const candidate = await tx.getContractTemplateRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!candidate || candidate.isArchived) throw new TemplateNotFoundError();
        if (candidate.contentMarkdown.trim()) throw new TemplateConflictError();

        const attachments = await tx.getAttachmentRepo().findByEntity(principal.companyId, 'ContractTemplate', candidate.id);
        const sources = attachments.filter((attachment) =>
          !attachment.isArchived &&
          attachment.documentType === 'CONTRACT_TEMPLATE_SOURCE' &&
          attachment.contentState === 'AVAILABLE'
        );
        if (sources.length !== 1) throw new TemplateConflictError();
        const approvedMaster = getMoveFlexApprovedContractMaster(candidate.templateKey);
        if (approvedMaster) {
          const source = sources[0];
          if (
            source.mimeType !== DOCX_MIME ||
            source.checksum !== approvedMaster.sha256 ||
            source.fileSize !== approvedMaster.fileSize
          ) throw new ApprovedMasterMismatchError();
        } else if (!['application/pdf', DOCX_MIME].includes(sources[0].mimeType)) {
          throw new TemplateConflictError();
        }
        const shouldActivate = approvedMaster ? true : sources[0].mimeType === DOCX_MIME;
        if (candidate.isCurrent && candidate.isActive === shouldActivate) return candidate;

        const current = await tx.getContractTemplateRepo().findCurrentWithLock(principal.companyId, candidate.templateKey);
        if (approvedMaster) {
          if (!current || current.id !== candidate.id || !candidate.isCurrent) throw new TemplateConflictError();
        } else if (candidate.supersedesTemplateId && (!current || current.id !== candidate.supersedesTemplateId)) {
          throw new TemplateConflictError();
        }
        const now = new Date().toISOString();
        if (current && current.id !== candidate.id) {
          const demoted = await tx.getContractTemplateRepo().updateForCompany(principal.companyId, current.id, {
            isCurrent: false, isActive: false, updatedAt: now,
          });
          if (!demoted) throw new TemplateConflictError();
        }
        const promoted = await tx.getContractTemplateRepo().updateForCompany(principal.companyId, candidate.id, {
          isCurrent: true,
          isActive: shouldActivate,
          updatedAt: now,
        });
        if (!promoted) throw new TemplateNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractTemplate', entityId: promoted.id,
          action: AuditAction.UPDATE, previousState: JSON.stringify(candidate),
          newState: JSON.stringify({
            ...promoted,
            event: approvedMaster ? 'PROMOTE_APPROVED_MASTER_SOURCE' : 'PROMOTE_FILE_SOURCE',
            attachmentId: sources[0].id,
            approvedFileName: approvedMaster?.fileName,
            approvedSha256: approvedMaster?.sha256,
          }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return promoted;
      });
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  for (const lifecycle of [
    { path: 'archive', archived: true },
    { path: 'restore', archived: false },
  ]) {
    app.post(`/api/contract-templates/:id/${lifecycle.path}`, async (req: Request, res: Response) => {
      const principal = requirePrincipal(req, res, 'MANAGE_CONTRACT_TEMPLATE');
      if (!principal) return;
      try {
        const item = await UnitOfWork.run(principal.companyId, async (tx) => {
          const existing = await tx.getContractTemplateRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
          if (!existing) throw new TemplateNotFoundError();
          if (getMoveFlexApprovedContractMaster(existing.templateKey)) throw new ApprovedMasterLockedError();
          if (existing.isArchived === lifecycle.archived) return existing;
          if (!lifecycle.archived && existing.isCurrent) {
            const current = await tx.getContractTemplateRepo().findCurrentWithLock(principal.companyId, existing.templateKey);
            if (current && current.id !== existing.id) throw new TemplateConflictError();
          }
          const now = new Date().toISOString();
          const saved = await tx.getContractTemplateRepo().updateForCompany(principal.companyId, existing.id, {
            isArchived: lifecycle.archived,
            isActive: lifecycle.archived ? false : existing.isActive,
            updatedAt: now,
          });
          if (!saved) throw new TemplateNotFoundError();
          await tx.getAuditLogRepo().create({
            id: randomUUID(), companyId: principal.companyId, entityName: 'ContractTemplate', entityId: saved.id,
            action: AuditAction.UPDATE, previousState: JSON.stringify(existing), newState: JSON.stringify(saved),
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
}
