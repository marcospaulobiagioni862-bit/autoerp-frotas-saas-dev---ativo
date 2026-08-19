import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { db } from '../db/index';
import { companies } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { AuditAction, ContractStatus } from '../types/enums';
import type { Contract, ContractArtifact, ContractTemplate, Driver, Vehicle } from '../types/entities';
import { renderContractTemplate, ContractTemplatePolicyError } from '../domain/contracts/contractTemplatePolicy';
import type { AuthenticatedPrincipal } from './auth';
import {
  AttachmentStorageUnavailableError,
  AttachmentStorageValidationError,
  ServerAttachmentStorage,
} from './attachmentStorage';

type ExecutionAction = 'VIEW_CONTRACT_ARTIFACT' | 'GENERATE_CONTRACT_PDF' | 'REGISTER_CONTRACT_SIGNATURE_EVIDENCE';
const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

class ExecutionValidationError extends Error {}
class ExecutionNotFoundError extends Error {}
class ExecutionConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response, action: ExecutionAction): AuthenticatedPrincipal | null {
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
  if (action === 'VIEW_CONTRACT_ARTIFACT') return principal;
  if (!WRITE_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return principal;
}

function text(value: unknown, field: string, min = 1, max = 180): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean.length < min || clean.length > max) throw new ExecutionValidationError(`Invalid ${field}`);
  return clean;
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function rejectAuthorityFields(body: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const forbidden = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (forbidden.length) throw new ExecutionValidationError('Invalid contract execution authority surface');
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface ContractSnapshot {
  company: { id: string; name: string; document: string };
  contract: {
    id: string; number: string; startDate: string; endDate: string; rentalAmount: number;
    billingPeriodicity: string; securityDepositAmount: number; franchiseKm: number; excessKmRate: number;
  };
  driver: { id: string; name: string; cpf: string; cnh: string; cnhExpiration: string };
  vehicle: { id: string; plate: string; brand: string; model: string; renavam: string };
  template: { id: string; templateKey: string; versionNumber: number; title: string };
}

function makeSnapshot(
  company: { id: string; name: string; document: string },
  contract: Contract,
  driver: Driver,
  vehicle: Vehicle,
  template: ContractTemplate
): ContractSnapshot {
  return {
    company: { id: company.id, name: company.name, document: company.document },
    contract: {
      id: contract.id,
      number: contract.contractNumber,
      startDate: contract.startDate,
      endDate: contract.endDate || '',
      rentalAmount: contract.rentalAmount,
      billingPeriodicity: contract.billingPeriodicity,
      securityDepositAmount: contract.securityDepositAmount,
      franchiseKm: contract.franchiseKm,
      excessKmRate: contract.excessKmRate,
    },
    driver: {
      id: driver.id,
      name: driver.fullName,
      cpf: driver.cpf,
      cnh: driver.cnhNumber,
      cnhExpiration: driver.cnhExpiration,
    },
    vehicle: {
      id: vehicle.id,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      renavam: vehicle.renavam,
    },
    template: {
      id: template.id,
      templateKey: template.templateKey,
      versionNumber: template.versionNumber,
      title: template.title,
    },
  };
}

function valuesFromSnapshot(snapshot: ContractSnapshot): Record<string, string> {
  return {
    'company.name': snapshot.company.name,
    'company.document': snapshot.company.document,
    'contract.number': snapshot.contract.number,
    'contract.startDate': snapshot.contract.startDate,
    'contract.endDate': snapshot.contract.endDate || 'Prazo indeterminado',
    'contract.rentalAmount': formatMoney(snapshot.contract.rentalAmount),
    'contract.billingPeriodicity': snapshot.contract.billingPeriodicity,
    'contract.securityDepositAmount': formatMoney(snapshot.contract.securityDepositAmount),
    'contract.franchiseKm': String(snapshot.contract.franchiseKm),
    'contract.excessKmRate': formatMoney(snapshot.contract.excessKmRate),
    'driver.name': snapshot.driver.name,
    'driver.cpf': snapshot.driver.cpf,
    'driver.cnh': snapshot.driver.cnh,
    'driver.cnhExpiration': snapshot.driver.cnhExpiration,
    'vehicle.plate': snapshot.vehicle.plate,
    'vehicle.brand': snapshot.vehicle.brand,
    'vehicle.model': snapshot.vehicle.model,
    'vehicle.renavam': snapshot.vehicle.renavam,
  };
}

function pdfSafe(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '?');
}

function markdownToPlainText(value: string): string {
  return pdfSafe(value)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '- ');
}

function wrapLine(font: any, textValue: string, size: number, maxWidth: number): string[] {
  const words = textValue.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function createPdf(title: string, rendered: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 10.5;
  const lineHeight = 15;
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  page.drawText(pdfSafe(title), { x: margin, y, size: 14, font: bold });
  y -= 28;

  for (const paragraph of markdownToPlainText(rendered).split(/\r?\n/)) {
    const lines = wrapLine(font, paragraph, fontSize, maxWidth);
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = document.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }
    y -= 5;
  }

  const bytes = await document.save({ useObjectStreams: false });
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Generated PDF signature invalid');
  return buffer;
}

async function getCompany(companyId: string): Promise<{ id: string; name: string; document: string }> {
  const rows = await db.select({ id: companies.id, name: companies.name, document: companies.document })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = rows[0];
  if (!company) throw new ExecutionNotFoundError();
  return { id: company.id, name: company.name, document: company.document || '' };
}

function sameSnapshotTerms(snapshot: ContractSnapshot, contract: Contract, driver: Driver, vehicle: Vehicle, template: ContractTemplate): boolean {
  return JSON.stringify({ ...snapshot, company: undefined }) === JSON.stringify({
    ...makeSnapshot(snapshot.company, contract, driver, vehicle, template),
    company: undefined,
  });
}

function parseSignedAt(value: unknown): string {
  if (value === undefined || value === null || value === '') return new Date().toISOString();
  if (typeof value !== 'string') throw new ExecutionValidationError('Invalid signedAt');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ExecutionValidationError('Invalid signedAt');
  if (parsed.getTime() > Date.now() + 5 * 60_000) throw new ExecutionValidationError('Invalid signedAt');
  return parsed.toISOString();
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ExecutionValidationError || error instanceof ContractTemplatePolicyError || error instanceof AttachmentStorageValidationError) {
    res.status(400).json({ error: 'Invalid contract execution request' });
    return;
  }
  if (error instanceof ExecutionNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof ExecutionConflictError) {
    res.status(409).json({ error: 'Contract execution conflict' });
    return;
  }
  if (error instanceof AttachmentStorageUnavailableError) {
    res.status(503).json({ error: 'Attachment storage unavailable' });
    return;
  }
  console.error('AUTOERP_CONTRACT_EXECUTION_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Contract execution operation failed' });
}

export function registerContractExecutionRoutes(app: Express): void {
  const storage = new ServerAttachmentStorage();

  app.get('/api/contracts/:id/artifacts', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'VIEW_CONTRACT_ARTIFACT');
    if (!principal) return;
    try {
      const items = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        return await tx.getContractArtifactRepo().findAllForContract(principal.companyId, contract.id);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/generate-pdf', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'GENERATE_CONTRACT_PDF');
    if (!principal) return;
    const body = bodyOf(req);
    let storedKey: string | undefined;
    try {
      rejectAuthorityFields(body, ['templateId']);
      const requestedTemplateId = text(body.templateId, 'templateId', 1, 120);
      const company = await getCompany(principal.companyId);

      const prepared = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);
        if (!template || template.isArchived) throw new ExecutionNotFoundError();
        if (!template.isCurrent || !template.isActive) throw new ExecutionConflictError();
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE');
        if (signed) throw new ExecutionConflictError();
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || driver.isArchived || !vehicle || vehicle.isArchived) throw new ExecutionNotFoundError();
        return { contract, template, driver, vehicle };
      });

      const snapshot = makeSnapshot(company, prepared.contract, prepared.driver, prepared.vehicle, prepared.template);
      const snapshotJson = JSON.stringify(snapshot);
      const snapshotHash = createHash('sha256').update(snapshotJson).digest('hex');
      const rendered = renderContractTemplate(prepared.template.contentMarkdown, valuesFromSnapshot(snapshot));
      const pdf = await createPdf(`${prepared.template.title} - ${prepared.contract.contractNumber}`, rendered);
      const attachmentId = randomUUID();
      const stored = await storage.write(principal.companyId, attachmentId, pdf);
      storedKey = stored.storageKey;
      const now = new Date().toISOString();

      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, prepared.contract.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const template = await tx.getContractTemplateRepo().findByIdForCompanyWithLock(principal.companyId, prepared.template.id);
        if (!template || template.isArchived || !template.isCurrent || !template.isActive) throw new ExecutionConflictError();
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || driver.isArchived || !vehicle || vehicle.isArchived) throw new ExecutionNotFoundError();
        if (!sameSnapshotTerms(snapshot, contract, driver, vehicle, template)) throw new ExecutionConflictError();
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE', true);
        if (signed) throw new ExecutionConflictError();

        const previous = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF', true);
        if (previous) {
          const superseded = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, previous.id, {
            isCurrent: false, updatedAt: now,
          });
          if (!superseded) throw new Error('Generated artifact supersede failed');
        }

        const attachment = await tx.getAttachmentRepo().create({
          id: attachmentId,
          companyId: principal.companyId,
          entityName: 'Contract',
          entityType: 'Contract',
          entityId: contract.id,
          documentType: 'GENERATED_CONTRACT',
          fileName: `Contrato-${contract.contractNumber}.pdf`,
          fileSize: stored.fileSize,
          mimeType: 'application/pdf',
          uploadedBy: principal.name,
          storageProvider: 'SERVER_FS',
          storageKey: stored.storageKey,
          checksum: stored.checksum,
          createdBy: principal.userId,
          isArchived: false,
          contentState: 'AVAILABLE',
          description: `PDF gerado no servidor a partir do template ${template.templateKey} v${template.versionNumber}`,
          createdAt: now,
        });

        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(), companyId: principal.companyId, contractId: contract.id,
          artifactType: 'GENERATED_PDF', attachmentId: attachment.id, templateId: template.id,
          snapshotJson, snapshotHash, isCurrent: true, isArchived: false,
          createdBy: principal.userId, createdAt: now, updatedAt: now,
        });
        const savedContract = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          templateId: template.id,
          status: ContractStatus.AWAITING_SIGNATURE,
          updatedAt: now,
        });
        if (!savedContract) throw new ExecutionNotFoundError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractArtifact', entityId: artifact.id,
          action: AuditAction.CREATE,
          newState: JSON.stringify({ artifact, attachmentChecksum: attachment.checksum, snapshotHash }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return { artifact, attachment, contract: savedContract };
      });

      storedKey = undefined;
      res.status(201).json(result);
    } catch (error) {
      if (storedKey && principal) {
        await storage.remove(principal.companyId, storedKey).catch((cleanupError) =>
          console.error('AUTOERP_CONTRACT_PDF_COMPENSATION_FAILURE', cleanupError)
        );
      }
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/signature-evidence', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'REGISTER_CONTRACT_SIGNATURE_EVIDENCE');
    if (!principal) return;
    const body = bodyOf(req);
    try {
      rejectAuthorityFields(body, ['attachmentId','signedByName','signedAt']);
      const attachmentId = text(body.attachmentId, 'attachmentId', 1, 120);
      const signedByName = text(body.signedByName, 'signedByName', 2, 160);
      const signedAt = parseSignedAt(body.signedAt);
      const artifact = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const generated = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF', true);
        if (!generated) throw new ExecutionConflictError();
        const existing = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE', true);
        if (existing) {
          if (existing.attachmentId === attachmentId) return existing;
          throw new ExecutionConflictError();
        }
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, attachmentId);
        if (!attachment) throw new ExecutionNotFoundError();
        if (
          attachment.entityType !== 'Contract' ||
          attachment.entityId !== contract.id ||
          attachment.isArchived ||
          attachment.storageProvider !== 'SERVER_FS' ||
          attachment.contentState !== 'AVAILABLE' ||
          attachment.mimeType !== 'application/pdf' ||
          attachment.documentType !== 'SIGNED_CONTRACT' ||
          !attachment.checksum ||
          attachment.id === generated.attachmentId
        ) throw new ExecutionValidationError('Invalid signed attachment');

        const now = new Date().toISOString();
        const created: ContractArtifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(), companyId: principal.companyId, contractId: contract.id,
          artifactType: 'SIGNED_EVIDENCE', attachmentId: attachment.id,
          sourceArtifactId: generated.id, snapshotHash: attachment.checksum,
          isCurrent: true, isArchived: false, signatureMethod: 'SIGNED_PDF_UPLOAD',
          signedByName, signedAt, createdBy: principal.userId, createdAt: now, updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractArtifact', entityId: created.id,
          action: AuditAction.CREATE,
          newState: JSON.stringify({ artifact: created, sourceArtifactId: generated.id, attachmentChecksum: attachment.checksum }),
          userId: principal.userId, userName: principal.name, timestamp: now,
        });
        return created;
      });
      res.status(201).json({ artifact });
    } catch (error) {
      sendError(res, error);
    }
  });
}
