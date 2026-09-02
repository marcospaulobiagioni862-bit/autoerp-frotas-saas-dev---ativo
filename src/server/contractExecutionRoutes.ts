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
  driver: {
    id: string; name: string; cpf: string; cnh: string; cnhExpiration: string;
    address: {
      street: string; number: string; complement: string; neighborhood: string;
      city: string; state: string; zipCode: string; full: string;
    };
  };
  vehicle: { id: string; plate: string; brand: string; model: string; renavam: string };
  template: { id: string; templateKey: string; versionNumber: number; title: string };
}

function fullDriverAddress(driver: Driver): string {
  const address = driver.address;
  return [
    [address.street, address.number].filter(Boolean).join(', '),
    address.complement || '',
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(' - '),
    address.zipCode ? `CEP ${address.zipCode}` : '',
  ].filter(Boolean).join(', ');
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
      address: {
        street: driver.address.street,
        number: driver.address.number,
        complement: driver.address.complement || '',
        neighborhood: driver.address.neighborhood,
        city: driver.address.city,
        state: driver.address.state,
        zipCode: driver.address.zipCode,
        full: fullDriverAddress(driver),
      },
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
    'driver.address.street': snapshot.driver.address.street,
    'driver.address.number': snapshot.driver.address.number,
    'driver.address.complement': snapshot.driver.address.complement,
    'driver.address.neighborhood': snapshot.driver.address.neighborhood,
    'driver.address.city': snapshot.driver.address.city,
    'driver.address.state': snapshot.driver.address.state,
    'driver.address.zipCode': snapshot.driver.address.zipCode,
    'driver.address.full': snapshot.driver.address.full,
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
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);
        if (!contract || !template) throw new ExecutionNotFoundError();
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || !vehicle) throw new ExecutionNotFoundError();
        if (!sameSnapshotTerms(snapshot, contract, driver, vehicle, template)) throw new ExecutionConflictError();

        const attachment = await tx.getAttachmentRepo().create({
          id: attachmentId,
          companyId: principal.companyId,
          entityType: 'Contract',
          entityId: contract.id,
          documentType: 'CONTRACT_GENERATED_PDF',
          fileName: `${contract.contractNumber}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          sha256: createHash('sha256').update(pdf).digest('hex'),
          storageKey: stored.storageKey,
          contentState: 'AVAILABLE',
          description: 'PDF oficial do contrato gerado no servidor',
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });

        const current = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF');
        if (current) {
          await tx.getContractArtifactRepo().archive(current.id, principal.userId, now);
        }
        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'GENERATED_PDF',
          attachmentId: attachment.id,
          templateId: template.id,
          templateVersion: template.versionNumber,
          snapshotJson,
          snapshotSha256: snapshotHash,
          signedAt: null,
          signerName: null,
          signerDocument: null,
          signatureProvider: null,
          isCurrent: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });

        const updatedContract = await tx.getContractRepo().update(contract.id, {
          templateId: template.id,
          generatedPdfUrl: attachment.storageKey,
          generatedPdfSha256: attachment.sha256,
          generatedAt: now,
          status: contract.signatureRequired === false ? contract.status : ContractStatus.AWAITING_SIGNATURE,
          updatedAt: now,
          updatedBy: principal.userId,
        });

        await tx.getAuditRepo().create({
          id: randomUUID(), companyId: principal.companyId, userId: principal.userId,
          action: AuditAction.UPDATE, entityType: 'Contract', entityId: contract.id,
          changes: { generatedPdf: true, templateId: template.id, snapshotSha256: snapshotHash }, createdAt: now,
        });

        return { artifact, attachment, contract: updatedContract };
      });

      res.status(201).json(result);
    } catch (error) {
      if (storedKey) await storage.remove(storedKey).catch(() => undefined);
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/signature-evidence', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'REGISTER_CONTRACT_SIGNATURE_EVIDENCE');
    if (!principal) return;
    const body = bodyOf(req);
    let storedKey: string | undefined;
    try {
      rejectAuthorityFields(body, ['fileName', 'mimeType', 'contentBase64', 'signedAt', 'signerName', 'signerDocument', 'signatureProvider']);
      const fileName = text(body.fileName, 'fileName', 1, 180);
      const mimeType = text(body.mimeType, 'mimeType', 1, 120);
      if (mimeType !== 'application/pdf') throw new ExecutionValidationError('Invalid signature evidence mimeType');
      const contentBase64 = text(body.contentBase64, 'contentBase64', 1, 14_000_000);
      const signerName = text(body.signerName, 'signerName', 1, 180);
      const signerDocument = text(body.signerDocument, 'signerDocument', 1, 80);
      const signatureProvider = text(body.signatureProvider, 'signatureProvider', 1, 120);
      const signedAt = parseSignedAt(body.signedAt);
      const bytes = Buffer.from(contentBase64, 'base64');
      if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new ExecutionValidationError('Invalid signature evidence content');
      }

      const prepared = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const generated = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF');
        if (!generated) throw new ExecutionConflictError();
        const currentSigned = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE');
        if (currentSigned) throw new ExecutionConflictError();
        return { contract, generated };
      });

      const generatedSnapshotHash = prepared.generated.snapshotSha256;
      const attachmentId = randomUUID();
      const stored = await storage.write(principal.companyId, attachmentId, bytes);
      storedKey = stored.storageKey;
      const now = new Date().toISOString();

      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        const generated = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'GENERATED_PDF');
        if (!contract || !generated || generated.snapshotSha256 !== generatedSnapshotHash) throw new ExecutionConflictError();

        const attachment = await tx.getAttachmentRepo().create({
          id: attachmentId,
          companyId: principal.companyId,
          entityType: 'Contract',
          entityId: contract.id,
          documentType: 'CONTRACT_SIGNED_EVIDENCE',
          fileName,
          mimeType,
          sizeBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          storageKey: stored.storageKey,
          contentState: 'AVAILABLE',
          description: 'Evidência PDF assinada do contrato',
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'SIGNED_EVIDENCE',
          attachmentId: attachment.id,
          templateId: generated.templateId,
          templateVersion: generated.templateVersion,
          snapshotJson: generated.snapshotJson,
          snapshotSha256: generated.snapshotSha256,
          signedAt,
          signerName,
          signerDocument,
          signatureProvider,
          isCurrent: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        const updatedContract = await tx.getContractRepo().update(contract.id, {
          signedPdfUrl: attachment.storageKey,
          signedPdfSha256: attachment.sha256,
          signedAt,
          signatureProvider,
          updatedAt: now,
          updatedBy: principal.userId,
        });
        await tx.getAuditRepo().create({
          id: randomUUID(), companyId: principal.companyId, userId: principal.userId,
          action: AuditAction.UPDATE, entityType: 'Contract', entityId: contract.id,
          changes: { signedEvidence: true, signatureProvider, signedAt }, createdAt: now,
        });
        return { artifact, attachment, contract: updatedContract };
      });

      res.status(201).json(result);
    } catch (error) {
      if (storedKey) await storage.remove(storedKey).catch(() => undefined);
      sendError(res, error);
    }
  });
}
