import { createHash, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from '../db/index';
import { companies } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { AuditAction, ContractStatus } from '../types/enums';
import type { Contract, ContractArtifact, ContractSignatureMethod, ContractTemplate, Driver, Vehicle } from '../types/entities';
import { renderContractTemplate, ContractTemplatePolicyError } from '../domain/contracts/contractTemplatePolicy';
import { extractContractDocxPlainText, renderContractDocxPackage } from '../domain/contracts/contractDocxPackageRenderer';
import { ContractDocxTemplateError } from '../domain/contracts/contractDocxTemplateRenderer';
import type { AuthenticatedPrincipal } from './auth';
import {
  AttachmentStorageUnavailableError,
  AttachmentStorageValidationError,
} from './attachmentStorage';
import { createAttachmentStorageFromEnvironment } from './r2AttachmentStorage';
import {
  loadContractVehicleInsuranceSnapshot,
  sameContractVehicleInsuranceSnapshot,
  type ContractVehicleInsuranceSnapshot,
} from './contractVehicleInsuranceSnapshot';
import { contractVehicleInsuranceTemplateValues } from './contractVehicleInsuranceTemplateValues';
import {
  loadContractVehicleTrackerSnapshot,
  sameContractVehicleTrackerSnapshot,
  type ContractVehicleTrackerSnapshot,
} from './contractVehicleTrackerSnapshot';
import { contractVehicleTrackerTemplateValues } from './contractVehicleTrackerTemplateValues';

type ExecutionAction = 'VIEW_CONTRACT_ARTIFACT' | 'GENERATE_CONTRACT_PDF' | 'GENERATE_CONTRACT_DOCX' | 'REGISTER_CONTRACT_REVIEWED_FINAL_PDF' | 'REGISTER_CONTRACT_SIGNATURE_EVIDENCE';
const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const SIGNATURE_METHODS = new Set<ContractSignatureMethod>(['SIGNED_PDF_UPLOAD', 'GOV_BR']);

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

function parseSignatureMethod(value: unknown): ContractSignatureMethod {
  if (value === undefined || value === null || value === '') return 'SIGNED_PDF_UPLOAD';
  if (typeof value !== 'string' || !SIGNATURE_METHODS.has(value as ContractSignatureMethod)) {
    throw new ExecutionValidationError('Invalid signatureMethod');
  }
  return value as ContractSignatureMethod;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface ContractSnapshot {
  company: {
    id: string; name: string; tradeName: string; document: string; email: string; phone: string; whatsapp: string;
    address: { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zipCode: string; full: string };
    legalRepresentative: { name: string; cpf: string };
  };
  contract: {
    id: string; number: string; startDate: string; endDate: string; rentalAmount: number;
    billingPeriodicity: string; securityDepositAmount: number; franchiseKm: number; excessKmRate: number;
  };
  driver: {
    id: string; name: string; cpf: string; rg: string; birthDate: string; phone: string; whatsapp: string; email: string; maritalStatus: string; profession: string; motherName: string; pixKey: string; cnh: string; cnhCategory: string; cnhExpiration: string;
    address: {
      street: string; number: string; complement: string; neighborhood: string;
      city: string; state: string; zipCode: string; full: string;
    };
  };
  vehicle: { id: string; plate: string; brand: string; model: string; version: string; brandModel: string; yearFabrication: number; yearModel: number; yearDisplay: string; color: string; renavam: string; chassis: string; currentKm: number };
  vehicleInsurance: ContractVehicleInsuranceSnapshot | null;
  vehicleTracker: ContractVehicleTrackerSnapshot | null;
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
  company: {
    id: string; name: string; tradeName: string; document: string; email: string; phone: string; whatsapp: string;
    address: { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zipCode: string; full: string };
    legalRepresentative: { name: string; cpf: string };
  },
  contract: Contract,
  driver: Driver,
  vehicle: Vehicle,
  vehicleInsurance: ContractVehicleInsuranceSnapshot | null,
  vehicleTracker: ContractVehicleTrackerSnapshot | null,
  template: ContractTemplate
): ContractSnapshot {
  return {
    company,
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
      rg: driver.rg || '',
      birthDate: driver.birthDate,
      phone: driver.phone,
      whatsapp: driver.whatsapp,
      email: driver.email || '',
      maritalStatus: driver.maritalStatus || '',
      profession: driver.profession || '',
      motherName: driver.motherName || '',
      pixKey: driver.pixKey || '',
      cnh: driver.cnhNumber,
      cnhCategory: driver.cnhCategory,
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
      version: vehicle.version || '',
      brandModel: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' '),
      yearFabrication: vehicle.yearFabrication,
      yearModel: vehicle.yearModel,
      yearDisplay: `${vehicle.yearFabrication}/${vehicle.yearModel}`,
      color: vehicle.color,
      renavam: vehicle.renavam,
      chassis: vehicle.chassis,
      currentKm: vehicle.currentKm,
    },
    vehicleInsurance,
    vehicleTracker,
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
    'company.tradeName': snapshot.company.tradeName,
    'company.document': snapshot.company.document,
    'company.email': snapshot.company.email,
    'company.phone': snapshot.company.phone,
    'company.whatsapp': snapshot.company.whatsapp,
    'company.address.street': snapshot.company.address.street,
    'company.address.number': snapshot.company.address.number,
    'company.address.complement': snapshot.company.address.complement,
    'company.address.neighborhood': snapshot.company.address.neighborhood,
    'company.address.city': snapshot.company.address.city,
    'company.address.state': snapshot.company.address.state,
    'company.address.zipCode': snapshot.company.address.zipCode,
    'company.address.full': snapshot.company.address.full,
    'company.legalRepresentative.name': snapshot.company.legalRepresentative.name,
    'company.legalRepresentative.cpf': snapshot.company.legalRepresentative.cpf,
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
    'driver.rg': snapshot.driver.rg,
    'driver.birthDate': snapshot.driver.birthDate,
    'driver.phone': snapshot.driver.phone,
    'driver.whatsapp': snapshot.driver.whatsapp,
    'driver.email': snapshot.driver.email,
    'driver.maritalStatus': snapshot.driver.maritalStatus,
    'driver.profession': snapshot.driver.profession,
    'driver.motherName': snapshot.driver.motherName,
    'driver.pixKey': snapshot.driver.pixKey,
    'driver.cnh': snapshot.driver.cnh,
    'driver.cnhCategory': snapshot.driver.cnhCategory,
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
    'vehicle.version': snapshot.vehicle.version,
    'vehicle.brandModel': snapshot.vehicle.brandModel,
    'vehicle.yearFabrication': String(snapshot.vehicle.yearFabrication),
    'vehicle.yearModel': String(snapshot.vehicle.yearModel),
    'vehicle.yearDisplay': snapshot.vehicle.yearDisplay,
    'vehicle.color': snapshot.vehicle.color,
    'vehicle.renavam': snapshot.vehicle.renavam,
    'vehicle.chassis': snapshot.vehicle.chassis,
    'vehicle.currentKm': String(snapshot.vehicle.currentKm),
    ...contractVehicleInsuranceTemplateValues(snapshot.vehicleInsurance),
    ...contractVehicleTrackerTemplateValues(snapshot.vehicleTracker),
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
  let y = 0;

  const preparePage = () => {
    page.drawCircle({ x: margin + 13, y: pageHeight - 44, size: 13, color: rgb(0.43, 0.16, 0.85) });
    page.drawLine({ start: { x: margin + 6, y: pageHeight - 44 }, end: { x: margin + 11, y: pageHeight - 50 }, thickness: 2.2, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: margin + 11, y: pageHeight - 50 }, end: { x: margin + 20, y: pageHeight - 37 }, thickness: 2.2, color: rgb(1, 1, 1) });
    page.drawText('MoveFlex', { x: margin + 34, y: pageHeight - 49, size: 17, font: bold, color: rgb(0.12, 0.14, 0.2) });
    page.drawText('Locação de Veículos', { x: margin + 34, y: pageHeight - 62, size: 7.5, font, color: rgb(0.35, 0.38, 0.45) });
    page.drawLine({ start: { x: margin, y: pageHeight - 76 }, end: { x: pageWidth - margin, y: pageHeight - 76 }, thickness: 1, color: rgb(0.43, 0.16, 0.85) });
    y = pageHeight - 102;
  };

  preparePage();
  page.drawText(pdfSafe(title), { x: margin, y, size: 14, font: bold });
  y -= 28;

  for (const paragraph of markdownToPlainText(rendered).split(/\r?\n/)) {
    const lines = wrapLine(font, paragraph, fontSize, maxWidth);
    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = document.addPage([pageWidth, pageHeight]);
        preparePage();
      }
      page.drawText(line, { x: margin, y, size: fontSize, font });
      y -= lineHeight;
    }
    y -= 5;
  }

  const pages = document.getPages();
  pages.forEach((item, index) => item.drawText(`${index + 1} / ${pages.length}`, {
    x: pageWidth - 78, y: 24, size: 8, font, color: rgb(0.45, 0.45, 0.5),
  }));

  const bytes = await document.save({ useObjectStreams: false });
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Generated PDF signature invalid');
  return buffer;
}

async function getCompany(companyId: string): Promise<ContractSnapshot['company']> {
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const company = rows[0];
  if (!company) throw new ExecutionNotFoundError();
  const address = {
    street: company.addressStreet || '',
    number: company.addressNumber || '',
    complement: company.addressComplement || '',
    neighborhood: company.addressNeighborhood || '',
    city: company.addressCity || '',
    state: company.addressState || '',
    zipCode: company.addressZipCode || '',
    full: [
      [company.addressStreet || '', company.addressNumber || ''].filter(Boolean).join(', '),
      company.addressComplement || '',
      company.addressNeighborhood || '',
      [company.addressCity || '', company.addressState || ''].filter(Boolean).join(' - '),
      company.addressZipCode ? `CEP ${company.addressZipCode}` : '',
    ].filter(Boolean).join(', '),
  };
  return {
    id: company.id,
    name: company.name,
    tradeName: company.tradeName || '',
    document: company.document || '',
    email: company.email || '',
    phone: company.phone || '',
    whatsapp: company.whatsapp || '',
    address,
    legalRepresentative: {
      name: company.legalRepresentativeName || '',
      cpf: company.legalRepresentativeCpf || '',
    },
  };
}

function sameSnapshotTerms(
  snapshot: ContractSnapshot,
  contract: Contract,
  driver: Driver,
  vehicle: Vehicle,
  vehicleInsurance: ContractVehicleInsuranceSnapshot | null,
  vehicleTracker: ContractVehicleTrackerSnapshot | null,
  template: ContractTemplate,
): boolean {
  return JSON.stringify({ ...snapshot, company: undefined }) === JSON.stringify({
    ...makeSnapshot(snapshot.company, contract, driver, vehicle, vehicleInsurance, vehicleTracker, template),
    company: undefined,
  }) &&
    sameContractVehicleInsuranceSnapshot(snapshot.vehicleInsurance, vehicleInsurance) &&
    sameContractVehicleTrackerSnapshot(snapshot.vehicleTracker, vehicleTracker);
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
  if (error instanceof ExecutionValidationError || error instanceof ContractTemplatePolicyError || error instanceof ContractDocxTemplateError || error instanceof AttachmentStorageValidationError) {
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
    console.error('AUTOERP_ATTACHMENT_STORAGE_UNAVAILABLE', {
      name: error.name,
      message: error.message,
    });
    res.status(503).json({ error: 'Attachment storage unavailable' });
    return;
  }
  console.error('AUTOERP_CONTRACT_EXECUTION_AUTHORITY_FAILURE', error);
  res.status(500).json({ error: 'Contract execution operation failed' });
}

export function registerContractExecutionRoutes(app: Express): void {
  const storage = createAttachmentStorageFromEnvironment(process.env);

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
        const vehicleInsurance = await loadContractVehicleInsuranceSnapshot(
          tx, principal.companyId, vehicle.id, contract.startDate
        );
        const vehicleTracker = await loadContractVehicleTrackerSnapshot(
          tx, principal.companyId, vehicle.id
        );
        return { contract, template, driver, vehicle, vehicleInsurance, vehicleTracker };
      });

      const snapshot = makeSnapshot(
        company,
        prepared.contract,
        prepared.driver,
        prepared.vehicle,
        prepared.vehicleInsurance,
        prepared.vehicleTracker,
        prepared.template,
      );
      const snapshotJson = JSON.stringify(snapshot);
      const snapshotHash = createHash('sha256').update(snapshotJson).digest('hex');
      const rendered = renderContractTemplate(prepared.template.contentMarkdown, valuesFromSnapshot(snapshot));
      const pdf = await createPdf(`${prepared.template.title} - ${prepared.contract.contractNumber}`, rendered);
      const attachmentId = randomUUID();
      const stored = await storage.write(principal.companyId, attachmentId, pdf);
      storedKey = stored.storageKey;
      const now = new Date().toISOString();

      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);
        if (!contract || !template || contract.isArchived || template.isArchived || !template.isCurrent || !template.isActive) {
          throw new ExecutionConflictError();
        }
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE', true);
        if (signed) throw new ExecutionConflictError();
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || !vehicle) throw new ExecutionConflictError();
        const vehicleInsurance = await loadContractVehicleInsuranceSnapshot(
          tx, principal.companyId, vehicle.id, contract.startDate
        );
        const vehicleTracker = await loadContractVehicleTrackerSnapshot(
          tx, principal.companyId, vehicle.id
        );
        if (!sameSnapshotTerms(snapshot, contract, driver, vehicle, vehicleInsurance, vehicleTracker, template)) throw new ExecutionConflictError();

        const attachment = await tx.getAttachmentRepo().create({
          id: attachmentId,
          companyId: principal.companyId,
          entityName: 'Contract',
          entityType: 'Contract',
          entityId: contract.id,
          documentType: 'CONTRACT_GENERATED_PDF',
          fileName: `${contract.contractNumber}.pdf`,
          fileSize: stored.fileSize,
          mimeType: 'application/pdf',
          uploadedBy: principal.name,
          storageProvider: storage.provider,
          storageKey: stored.storageKey,
          checksum: stored.checksum,
          createdBy: principal.userId,
          contentState: 'AVAILABLE',
          description: 'PDF oficial do contrato gerado no servidor',
          isArchived: false,
          createdAt: now,
        });

        const current = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF', true);
        if (current) {
          const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, current.id, {
            isCurrent: false, isArchived: true, updatedAt: now,
          });
          if (!archived) throw new ExecutionConflictError();
        }
        for (const artifactType of ['GENERATED_DOCX', 'REVIEWED_FINAL_PDF'] as const) {
          const superseded = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, artifactType, true);
          if (superseded) {
            const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, superseded.id, {
              isCurrent: false, isArchived: true, updatedAt: now,
            });
            if (!archived) throw new ExecutionConflictError();
          }
        }
        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'GENERATED_PDF',
          attachmentId: attachment.id,
          templateId: template.id,
          snapshotJson,
          snapshotHash,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        const updatedContract = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          templateId: template.id,
          generatedPdfUrl: attachment.storageKey,
          status: contract.signatureRequired === false ? contract.status : ContractStatus.AWAITING_SIGNATURE,
          updatedAt: now,
        });
        if (!updatedContract) throw new ExecutionConflictError();

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({ event: 'GENERATE_PDF', templateId: template.id, snapshotHash }),
          timestamp: now,
        });

        return { artifact, attachment, contract: updatedContract };
      });

      storedKey = undefined;
      res.status(201).json(result);
    } catch (error) {
      if (storedKey) await storage.remove(principal.companyId, storedKey).catch(() => undefined);
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/generate-docx', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'GENERATE_CONTRACT_DOCX');
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
        if (!template.isCurrent || !template.isActive || template.contentMarkdown.trim()) throw new ExecutionConflictError();
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE');
        if (signed) throw new ExecutionConflictError();
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || driver.isArchived || !vehicle || vehicle.isArchived) throw new ExecutionNotFoundError();
        const vehicleInsurance = await loadContractVehicleInsuranceSnapshot(
          tx, principal.companyId, vehicle.id, contract.startDate
        );
        const vehicleTracker = await loadContractVehicleTrackerSnapshot(
          tx, principal.companyId, vehicle.id
        );
        const attachments = await tx.getAttachmentRepo().findByEntity(principal.companyId, 'ContractTemplate', template.id);
        const sources = attachments.filter((item) =>
          !item.isArchived &&
          item.documentType === 'CONTRACT_TEMPLATE_SOURCE' &&
          item.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
          item.contentState === 'AVAILABLE' &&
          item.storageProvider === storage.provider &&
          Boolean(item.storageKey)
        );
        if (sources.length !== 1) throw new ExecutionConflictError();
        return { contract, template, driver, vehicle, vehicleInsurance, vehicleTracker, source: sources[0] };
      });

      const sourceBytes = await storage.read(principal.companyId, prepared.source.storageKey!);
      const sourceChecksum = createHash('sha256').update(sourceBytes).digest('hex');
      if (
        !prepared.source.checksum || sourceChecksum !== prepared.source.checksum ||
        sourceBytes.length !== prepared.source.fileSize
      ) throw new ExecutionValidationError('Invalid DOCX template source');

      const snapshot = makeSnapshot(
        company,
        prepared.contract,
        prepared.driver,
        prepared.vehicle,
        prepared.vehicleInsurance,
        prepared.vehicleTracker,
        prepared.template,
      );
      const snapshotJson = JSON.stringify(snapshot);
      const snapshotHash = createHash('sha256').update(snapshotJson).digest('hex');

      const replay = await UnitOfWork.run(principal.companyId, async (tx) => {
        const artifact = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, prepared.contract.id, 'GENERATED_DOCX'
        );
        if (
          !artifact || artifact.templateId !== prepared.template.id ||
          artifact.snapshotHash !== snapshotHash || artifact.snapshotJson !== snapshotJson
        ) return null;
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, artifact.attachmentId);
        if (
          !attachment || attachment.isArchived || attachment.entityType !== 'Contract' ||
          attachment.entityId !== prepared.contract.id || attachment.documentType !== 'CONTRACT_GENERATED_DOCX' ||
          attachment.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          attachment.contentState !== 'AVAILABLE' || attachment.storageProvider !== storage.provider ||
          !attachment.storageKey || !attachment.checksum
        ) throw new ExecutionConflictError();
        return { artifact, attachment, contract: prepared.contract };
      });
      if (replay) {
        res.status(200).json(replay);
        return;
      }

      const rendered = renderContractDocxPackage(sourceBytes, valuesFromSnapshot(snapshot));
      const attachmentId = randomUUID();
      const stored = await storage.write(principal.companyId, attachmentId, rendered.bytes);
      storedKey = stored.storageKey;
      const now = new Date().toISOString();

      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);
        if (!contract || !template || contract.isArchived || template.isArchived || !template.isCurrent || !template.isActive || template.contentMarkdown.trim()) {
          throw new ExecutionConflictError();
        }
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE', true);
        if (signed) throw new ExecutionConflictError();
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || !vehicle) throw new ExecutionConflictError();
        const vehicleInsurance = await loadContractVehicleInsuranceSnapshot(
          tx, principal.companyId, vehicle.id, contract.startDate
        );
        const vehicleTracker = await loadContractVehicleTrackerSnapshot(
          tx, principal.companyId, vehicle.id
        );
        if (!sameSnapshotTerms(snapshot, contract, driver, vehicle, vehicleInsurance, vehicleTracker, template)) throw new ExecutionConflictError();
        const source = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, prepared.source.id);
        if (
          !source || source.isArchived || source.entityType !== 'ContractTemplate' || source.entityId !== template.id ||
          source.documentType !== 'CONTRACT_TEMPLATE_SOURCE' ||
          source.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          source.contentState !== 'AVAILABLE' || source.storageProvider !== storage.provider ||
          source.storageKey !== prepared.source.storageKey || source.checksum !== sourceChecksum
        ) throw new ExecutionConflictError();

        const currentDocx = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, contract.id, 'GENERATED_DOCX', true
        );
        if (
          currentDocx && currentDocx.templateId === template.id &&
          currentDocx.snapshotHash === snapshotHash && currentDocx.snapshotJson === snapshotJson
        ) {
          const currentAttachment = await tx.getAttachmentRepo().findByIdForCompany(
            principal.companyId, currentDocx.attachmentId
          );
          if (
            !currentAttachment || currentAttachment.isArchived || currentAttachment.entityType !== 'Contract' ||
            currentAttachment.entityId !== contract.id || currentAttachment.documentType !== 'CONTRACT_GENERATED_DOCX' ||
            currentAttachment.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            currentAttachment.contentState !== 'AVAILABLE' || currentAttachment.storageProvider !== storage.provider ||
            !currentAttachment.storageKey || !currentAttachment.checksum
          ) throw new ExecutionConflictError();
          return { artifact: currentDocx, attachment: currentAttachment, contract, replayed: true as const };
        }

        const attachment = await tx.getAttachmentRepo().create({
          id: attachmentId,
          companyId: principal.companyId,
          entityName: 'Contract',
          entityType: 'Contract',
          entityId: contract.id,
          documentType: 'CONTRACT_GENERATED_DOCX',
          fileName: `${contract.contractNumber}.docx`,
          fileSize: stored.fileSize,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploadedBy: principal.name,
          storageProvider: storage.provider,
          storageKey: stored.storageKey,
          checksum: stored.checksum,
          createdBy: principal.userId,
          contentState: 'AVAILABLE',
          description: 'DOCX oficial preenchido no servidor para revisão humana',
          isArchived: false,
          createdAt: now,
        });

        for (const artifactType of ['GENERATED_PDF', 'GENERATED_DOCX', 'REVIEWED_FINAL_PDF'] as const) {
          const current = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, artifactType, true);
          if (current) {
            const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, current.id, {
              isCurrent: false, isArchived: true, updatedAt: now,
            });
            if (!archived) throw new ExecutionConflictError();
          }
        }
        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'GENERATED_DOCX',
          attachmentId: attachment.id,
          templateId: template.id,
          snapshotJson,
          snapshotHash,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
        const updatedContract = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          templateId: template.id,
          generatedPdfUrl: '',
          status: contract.signatureRequired === false ? contract.status : ContractStatus.AWAITING_SIGNATURE,
          updatedAt: now,
        });
        if (!updatedContract) throw new ExecutionConflictError();

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({
            event: 'GENERATE_DOCX',
            templateId: template.id,
            sourceAttachmentId: source.id,
            sourceChecksum,
            snapshotHash,
            replacedKeys: rendered.replacedKeys,
          }),
          timestamp: now,
        });
        return { artifact, attachment, contract: updatedContract, replayed: false as const };
      });

      if (result.replayed) {
        await storage.remove(principal.companyId, stored.storageKey).catch(() => undefined);
        storedKey = undefined;
        const { replayed: _replayed, ...payload } = result;
        res.status(200).json(payload);
        return;
      }
      storedKey = undefined;
      const { replayed: _replayed, ...payload } = result;
      res.status(201).json(payload);
    } catch (error) {
      if (storedKey) await storage.remove(principal.companyId, storedKey).catch(() => undefined);
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/generate-pdf-from-docx', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'GENERATE_CONTRACT_PDF');
    if (!principal) return;
    let storedKey: string | undefined;
    try {
      rejectAuthorityFields(bodyOf(req), []);

      const prepared = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, contract.id, 'GENERATED_DOCX'
        );
        if (!generatedDocx) throw new ExecutionConflictError();
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, generatedDocx.attachmentId);
        if (
          !attachment || attachment.isArchived || attachment.entityType !== 'Contract' ||
          attachment.entityId !== contract.id || attachment.documentType !== 'CONTRACT_GENERATED_DOCX' ||
          attachment.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          attachment.contentState !== 'AVAILABLE' || attachment.storageProvider !== storage.provider ||
          !attachment.storageKey || !attachment.checksum
        ) throw new ExecutionConflictError();
        return { contract, generatedDocx, attachment };
      });

      const docxBytes = await storage.read(principal.companyId, prepared.attachment.storageKey!);
      const docxChecksum = createHash('sha256').update(docxBytes).digest('hex');
      if (
        docxBytes.length !== prepared.attachment.fileSize ||
        docxChecksum !== prepared.attachment.checksum
      ) throw new ExecutionValidationError('Invalid generated DOCX content');

      const plainText = extractContractDocxPlainText(docxBytes);
      const pdf = await createPdf(`Contrato - ${prepared.contract.contractNumber}`, plainText);
      const attachmentId = randomUUID();
      const stored = await storage.write(principal.companyId, attachmentId, pdf);
      storedKey = stored.storageKey;
      const now = new Date().toISOString();

      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, req.params.id, 'GENERATED_DOCX', true
        );
        const sourceAttachment = generatedDocx
          ? await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, generatedDocx.attachmentId)
          : null;
        if (
          !contract || !generatedDocx || generatedDocx.id !== prepared.generatedDocx.id ||
          generatedDocx.snapshotHash !== prepared.generatedDocx.snapshotHash ||
          generatedDocx.snapshotJson !== prepared.generatedDocx.snapshotJson ||
          !sourceAttachment || sourceAttachment.isArchived ||
          sourceAttachment.checksum !== docxChecksum
        ) throw new ExecutionConflictError();

        const currentPdf = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, contract.id, 'GENERATED_PDF', true
        );
        if (currentPdf) {
          const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, currentPdf.id, {
            isCurrent: false, isArchived: true, updatedAt: now,
          });
          if (!archived) throw new ExecutionConflictError();
        }
        const reviewed = await tx.getContractArtifactRepo().findCurrentForContract(
          principal.companyId, contract.id, 'REVIEWED_FINAL_PDF', true
        );
        if (reviewed) {
          const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, reviewed.id, {
            isCurrent: false, isArchived: true, updatedAt: now,
          });
          if (!archived) throw new ExecutionConflictError();
        }

        const attachment = await tx.getAttachmentRepo().create({
          id: attachmentId,
          companyId: principal.companyId,
          entityName: 'Contract',
          entityType: 'Contract',
          entityId: contract.id,
          documentType: 'CONTRACT_GENERATED_PDF',
          fileName: `${contract.contractNumber}.pdf`,
          fileSize: stored.fileSize,
          mimeType: 'application/pdf',
          uploadedBy: principal.name,
          storageProvider: storage.provider,
          storageKey: stored.storageKey,
          checksum: stored.checksum,
          createdBy: principal.userId,
          contentState: 'AVAILABLE',
          description: 'PDF oficial gerado a partir do DOCX preenchido',
          isArchived: false,
          createdAt: now,
        });
        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'GENERATED_PDF',
          attachmentId: attachment.id,
          templateId: generatedDocx.templateId,
          sourceArtifactId: generatedDocx.id,
          snapshotJson: generatedDocx.snapshotJson,
          snapshotHash: generatedDocx.snapshotHash,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
        const updatedContract = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          generatedPdfUrl: attachment.storageKey,
          updatedAt: now,
        });
        if (!updatedContract) throw new ExecutionConflictError();

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({
            event: 'GENERATE_PDF_FROM_DOCX',
            sourceArtifactId: generatedDocx.id,
            snapshotHash: generatedDocx.snapshotHash,
          }),
          timestamp: now,
        });

        return { artifact, attachment, contract: updatedContract };
      });

      storedKey = undefined;
      res.status(201).json(result);
    } catch (error) {
      if (storedKey) await storage.remove(principal.companyId, storedKey).catch(() => undefined);
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/reviewed-final-pdf', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'REGISTER_CONTRACT_REVIEWED_FINAL_PDF');
    if (!principal) return;
    const body = bodyOf(req);
    try {
      rejectAuthorityFields(body, ['attachmentId']);
      const attachmentId = text(body.attachmentId, 'attachmentId', 1, 120);

      const prepared = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const generatedPdf = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF');
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_DOCX');
        const generated = generatedDocx || generatedPdf;
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE');
        if (!generated || signed) throw new ExecutionConflictError();
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, attachmentId);
        if (
          !attachment || attachment.isArchived || attachment.entityType !== 'Contract' ||
          attachment.entityId !== contract.id || attachment.documentType !== 'CONTRACT_FINAL_PDF' ||
          attachment.mimeType !== 'application/pdf' || attachment.contentState !== 'AVAILABLE' ||
          attachment.storageProvider !== storage.provider || !attachment.storageKey
        ) throw new ExecutionConflictError();
        return { contract, generated, attachment };
      });

      const bytes = await storage.read(principal.companyId, prepared.attachment.storageKey!);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (
        !bytes.length || bytes.length > 10 * 1024 * 1024 ||
        bytes.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        bytes.length !== prepared.attachment.fileSize ||
        !prepared.attachment.checksum || checksum !== prepared.attachment.checksum
      ) throw new ExecutionValidationError('Invalid reviewed final PDF content');

      const now = new Date().toISOString();
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        const generatedPdf = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'GENERATED_PDF', true);
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'GENERATED_DOCX', true);
        const generated = generatedDocx || generatedPdf;
        const signed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'SIGNED_EVIDENCE', true);
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, attachmentId);
        if (
          !contract || !generated || signed || generated.id !== prepared.generated.id ||
          generated.snapshotHash !== prepared.generated.snapshotHash ||
          !attachment || attachment.isArchived || attachment.entityType !== 'Contract' ||
          attachment.entityId !== contract.id || attachment.documentType !== 'CONTRACT_FINAL_PDF' ||
          attachment.checksum !== checksum || attachment.contentState !== 'AVAILABLE'
        ) throw new ExecutionConflictError();

        const current = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'REVIEWED_FINAL_PDF', true);
        if (current) {
          const archived = await tx.getContractArtifactRepo().updateForCompany(principal.companyId, current.id, {
            isCurrent: false, isArchived: true, updatedAt: now,
          });
          if (!archived) throw new ExecutionConflictError();
        }
        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'REVIEWED_FINAL_PDF',
          attachmentId: attachment.id,
          templateId: generated.templateId,
          sourceArtifactId: generated.id,
          snapshotJson: generated.snapshotJson,
          snapshotHash: generated.snapshotHash,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractArtifact', entityId: artifact.id,
          action: AuditAction.CREATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({ event: 'REGISTER_REVIEWED_FINAL_PDF', contractId: contract.id, sourceArtifactId: generated.id, checksum }),
          timestamp: now,
        });
        return { artifact, attachment, contract };
      });

      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/contracts/:id/signature-evidence', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'REGISTER_CONTRACT_SIGNATURE_EVIDENCE');
    if (!principal) return;
    const body = bodyOf(req);
    try {
      rejectAuthorityFields(body, ['attachmentId', 'signedByName', 'signedAt', 'signatureMethod']);
      const attachmentId = text(body.attachmentId, 'attachmentId', 1, 120);
      const signedByName = text(body.signedByName, 'signedByName', 1, 180);
      const signedAt = parseSignedAt(body.signedAt);
      const signatureMethod = parseSignatureMethod(body.signatureMethod);

      const prepared = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) throw new ExecutionConflictError();
        const generatedPdf = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_PDF');
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'GENERATED_DOCX');
        const generated = generatedDocx || generatedPdf;
        if (!generated) throw new ExecutionConflictError();
        const reviewed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'REVIEWED_FINAL_PDF');
        const source = reviewed || generated;
        if (new Date(signedAt).getTime() < new Date(source.createdAt).getTime()) throw new ExecutionConflictError();
        const currentSigned = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, contract.id, 'SIGNED_EVIDENCE');
        if (currentSigned) throw new ExecutionConflictError();
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, attachmentId);
        if (
          !attachment || attachment.isArchived || attachment.entityType !== 'Contract' ||
          attachment.entityId !== contract.id || attachment.documentType !== 'SIGNED_CONTRACT' ||
          attachment.mimeType !== 'application/pdf' || attachment.contentState !== 'AVAILABLE' ||
          attachment.storageProvider !== storage.provider || !attachment.storageKey
        ) throw new ExecutionConflictError();
        return { contract, source, attachment };
      });

      const bytes = await storage.read(principal.companyId, prepared.attachment.storageKey!);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      if (
        !bytes.length || bytes.length > 10 * 1024 * 1024 ||
        bytes.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        bytes.length !== prepared.attachment.fileSize ||
        !prepared.attachment.checksum || checksum !== prepared.attachment.checksum
      ) throw new ExecutionValidationError('Invalid signature evidence content');

      const now = new Date().toISOString();
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        const generatedPdf = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'GENERATED_PDF', true);
        const generatedDocx = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'GENERATED_DOCX', true);
        const generated = generatedDocx || generatedPdf;
        const reviewed = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'REVIEWED_FINAL_PDF', true);
        const source = reviewed || generated;
        const currentSigned = await tx.getContractArtifactRepo().findCurrentForContract(principal.companyId, req.params.id, 'SIGNED_EVIDENCE', true);
        const attachment = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, attachmentId);
        if (
          !contract || !generated || !source || currentSigned || source.id !== prepared.source.id ||
          source.snapshotHash !== prepared.source.snapshotHash ||
          !attachment || attachment.isArchived || attachment.entityType !== 'Contract' ||
          attachment.entityId !== contract.id || attachment.documentType !== 'SIGNED_CONTRACT' ||
          attachment.checksum !== checksum || attachment.contentState !== 'AVAILABLE'
        ) throw new ExecutionConflictError();

        const artifact = await tx.getContractArtifactRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          contractId: contract.id,
          artifactType: 'SIGNED_EVIDENCE',
          attachmentId: attachment.id,
          templateId: source.templateId,
          sourceArtifactId: source.id,
          snapshotJson: source.snapshotJson,
          snapshotHash: source.snapshotHash,
          signatureMethod,
          signedByName,
          signedAt,
          isCurrent: true,
          isArchived: false,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
        const updatedContract = await tx.getContractRepo().updateForCompany(principal.companyId, contract.id, {
          signedContractUrl: attachment.storageKey,
          updatedAt: now,
        });
        if (!updatedContract) throw new ExecutionConflictError();
        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'ContractArtifact', entityId: artifact.id,
          action: AuditAction.CREATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({ event: 'REGISTER_SIGNED_PDF_EVIDENCE', contractId: contract.id, sourceArtifactId: source.id, checksum, signatureMethod }),
          timestamp: now,
        });
        return { artifact, attachment, contract: updatedContract };
      });

      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}
