import { createHash, randomUUID } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MOVEFLEX_LOGO_JPEG_BASE64 } from '../domain/contracts/moveflexBrand';
import { db } from '../db/index';
import { companies, tenantOperationalConfigs } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { AuditAction, ContractStatus, ObligationStatus, OriginType } from '../types/enums';
import type { Contract, ContractArtifact, ContractSignatureMethod, ContractTemplate, Driver, Vehicle } from '../types/entities';
import { classifyContractTemplateSource, renderContractTemplate, ContractTemplatePolicyError } from '../domain/contracts/contractTemplatePolicy';
import { extractContractDocxPlainText, renderContractDocxPackage } from '../domain/contracts/contractDocxPackageRenderer';
import {
  getMoveFlexVisualFixedMissingFields,
  renderMoveFlexVisualFixedPdf,
} from '../domain/contracts/moveflexVisualFixedPdfRenderer';
import {
  getMoveFlexApprovedContractMaster,
  MOVEFLEX_APPROVED_CONTRACT_MASTERS,
} from '../domain/contracts/moveflexApprovedContractMaster';
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
import { ensureInitialContractReceivable } from './contractFinanceAuthority';
import { ContractSignatureRequiredError, contractTimestampUtc } from '../domain/contracts/contractEffectivePeriod';
import { contractConflictResponse } from './contractConflictResponse';

type ExecutionAction = 'VIEW_CONTRACT_ARTIFACT' | 'GENERATE_CONTRACT_PDF' | 'GENERATE_CONTRACT_DOCX' | 'REGISTER_CONTRACT_REVIEWED_FINAL_PDF' | 'REGISTER_CONTRACT_SIGNATURE_EVIDENCE' | 'RECONCILE_CONTRACT_FINANCE';
const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);
const SIGNATURE_METHODS = new Set<ContractSignatureMethod>(['SIGNED_PDF_UPLOAD', 'GOV_BR', 'NOTARY']);
const STANDARD_TEMPLATE_KEYS = new Set<string>(
  MOVEFLEX_APPROVED_CONTRACT_MASTERS.map((item) => item.templateKey)
);

class ExecutionValidationError extends Error {}
class ExecutionRequiredDataError extends Error {
  constructor(public readonly fields: string[]) {
    super('Missing required contract data');
  }
}
class ExecutionNotFoundError extends Error {}
class ExecutionConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function structuredExecutionResponse(res: Response): void {
  const originalJson = res.json.bind(res);
  res.json = ((payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return originalJson(payload);
    }

    const body = payload as Record<string, unknown>;
    const message = typeof body.error === 'string' ? body.error : '';

    if (res.statusCode === 422 && Array.isArray(body.missingFields)) {
      return originalJson({ ...body, code: 'MISSING_REQUIRED_DATA' });
    }
    if (res.statusCode === 400 && message === 'Invalid contract execution request') {
      return originalJson({
        error: 'Os dados ou o artefato do contrato não são elegíveis para esta operação.',
        code: 'CONTRACT_INELIGIBLE',
      });
    }
    if (res.statusCode === 404 && message === 'Not found') {
      return originalJson({
        error: 'Contrato, modelo vinculado ou recurso necessário não foi encontrado.',
        code: 'TEMPLATE_NOT_FOUND',
      });
    }
    if (res.statusCode === 409 && message === 'Contract execution conflict') {
      return originalJson({
        error: 'O contrato ou o modelo vinculado não está elegível para geração neste estado.',
        code: 'CONTRACT_INELIGIBLE',
      });
    }
    if (res.statusCode === 503 && message === 'Attachment storage unavailable') {
      return originalJson({
        error: 'O armazenamento de documentos está temporariamente indisponível.',
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
      });
    }
    return originalJson(payload);
  }) as Response['json'];
}

async function enforcePersistedTemplateAuthority(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== 'POST') {
    next();
    return;
  }

  structuredExecutionResponse(res);

  const action: ExecutionAction = req.baseUrl.endsWith('/generate-docx')
    ? 'GENERATE_CONTRACT_DOCX'
    : 'GENERATE_CONTRACT_PDF';
  const principal = requirePrincipal(req, res, action);
  if (!principal) return;

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const unexpectedFields = Object.keys(body).filter((key) => key !== 'templateId');
  if (unexpectedFields.length) {
    res.status(400).json({
      error: 'A geração do contrato não aceita campos além do templateId legado.',
      code: 'INVALID_EXECUTION_REQUEST',
    });
    return;
  }

  try {
    const authority = await UnitOfWork.run(principal.companyId, async (tx) => {
      const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
      if (!contract || contract.isArchived) return { kind: 'CONTRACT_NOT_FOUND' as const };
      if (!contract.templateId) return { kind: 'TEMPLATE_NOT_LINKED' as const };

      const template = await tx.getContractTemplateRepo().findByIdForCompany(
        principal.companyId,
        contract.templateId,
      );
      if (!template || template.isArchived) return { kind: 'TEMPLATE_NOT_FOUND' as const };
      const templateKeyIsApprovedStandard = STANDARD_TEMPLATE_KEYS.has(template.templateKey);
      if (!template.isCurrent || !template.isActive) {
        return { kind: 'TEMPLATE_INELIGIBLE' as const };
      }
      return { kind: 'OK' as const, templateId: template.id, templateKeyIsApprovedStandard };
    });

    if (authority.kind === 'CONTRACT_NOT_FOUND') {
      res.status(404).json({ error: 'Contrato não encontrado.', code: 'CONTRACT_NOT_FOUND' });
      return;
    }
    if (authority.kind === 'TEMPLATE_NOT_LINKED') {
      res.status(409).json({
        error: 'O contrato não possui um dos modelos padrão vinculado.',
        code: 'TEMPLATE_NOT_FOUND',
      });
      return;
    }
    if (authority.kind === 'TEMPLATE_NOT_FOUND') {
      res.status(404).json({
        error: 'O modelo vinculado ao contrato não foi encontrado.',
        code: 'TEMPLATE_NOT_FOUND',
      });
      return;
    }
    if (authority.kind === 'TEMPLATE_INELIGIBLE') {
      res.status(409).json({
        error: 'O modelo vinculado ao contrato não está ativo ou atual.',
        code: 'CONTRACT_INELIGIBLE',
      });
      return;
    }

    // Browser-supplied templateId is intentionally ignored. The persisted
    // contract.templateId is the single source of authority for generation.
    req.body = { templateId: authority.templateId };
    next();
  } catch (error) {
    console.error('AUTOERP_CONTRACT_TEMPLATE_AUTHORITY_FAILURE', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown contract template authority failure',
    });
    res.status(500).json({
      error: 'Não foi possível validar o modelo vinculado ao contrato.',
      code: 'CONTRACT_AUTHORITY_FAILURE',
    });
  }
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
  if (role === 'ADMIN') return principal;
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];
  if (permissions.includes('*') || permissions.includes(action)) return principal;
  if (action === 'VIEW_CONTRACT_ARTIFACT' && permissions.includes('VIEW_CONTRACT')) return principal;
  if (action !== 'VIEW_CONTRACT_ARTIFACT' && (permissions.includes('EDIT_CONTRACT') || permissions.includes('SIGN_CONTRACT'))) return principal;
  res.status(403).json({ error: 'Forbidden' });
  return null;
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
    billingPeriodicity: string; billingDueDayOfWeek: number; billingDueDayOfMonth: number;
    securityDepositAmount: number; franchiseKm: number; excessKmRate: number;
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
      billingDueDayOfWeek: contract.billingDueDayOfWeek || 0,
      billingDueDayOfMonth: contract.billingDueDayOfMonth || 0,
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

function billingWeekdayLabel(day: number): string {
  return ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'][day] || '';
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
    'contract.billingDueDayOfWeek': String(snapshot.contract.billingDueDayOfWeek || ''),
    'contract.billingDueDayOfMonth': String(snapshot.contract.billingDueDayOfMonth || ''),
    'contract.billingDueDayOfWeekLabel': billingWeekdayLabel(snapshot.contract.billingDueDayOfWeek),
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

interface PdfBranding {
  companyName?: string;
  logoBase64?: string | null;
}

async function createPdf(title: string, rendered: string, branding?: PdfBranding): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let logoBytes: Uint8Array | null = null;
  if (branding?.logoBase64) {
    try {
      const raw = branding.logoBase64.includes(',') ? branding.logoBase64.split(',')[1] : branding.logoBase64;
      logoBytes = Uint8Array.from(Buffer.from(raw, 'base64'));
    } catch {
      logoBytes = null;
    }
  }
  if (!logoBytes) {
    logoBytes = Uint8Array.from(Buffer.from(MOVEFLEX_LOGO_JPEG_BASE64, 'base64'));
  }
  const logo = await document.embedJpg(logoBytes).catch(async () => {
    return await document.embedPng(logoBytes!).catch(async () => {
      return await document.embedJpg(Uint8Array.from(Buffer.from(MOVEFLEX_LOGO_JPEG_BASE64, 'base64')));
    });
  });

  const companyName = branding?.companyName || 'MoveFlex';
  const watermarkName = companyName.toUpperCase().slice(0, 16);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 10.5;
  const lineHeight = 15;
  let page = document.addPage([pageWidth, pageHeight]);
  let y = 0;

  const preparePage = () => {
    page.drawImage(logo, { x: margin, y: pageHeight - 113, width: 176, height: 99 });
    page.drawText('CONTRATO DE LOCAÇÃO DE VEÍCULO', { x: pageWidth - 312, y: pageHeight - 49, size: 12, font: bold, color: rgb(0.30, 0.10, 0.55) });
    page.drawText(`Documento oficial ${companyName}`, { x: pageWidth - 312, y: pageHeight - 66, size: 8, font, color: rgb(0.38, 0.41, 0.48) });
    page.drawLine({ start: { x: margin, y: pageHeight - 122 }, end: { x: pageWidth - margin, y: pageHeight - 122 }, thickness: 1.4, color: rgb(0.42, 0.16, 0.75) });
    page.drawText(watermarkName, { x: 185, y: pageHeight / 2, size: 58, font: bold, color: rgb(0.43, 0.16, 0.85), opacity: 0.035 });
    y = pageHeight - 145;
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
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: margin, y: 38 }, end: { x: pageWidth - margin, y: 38 }, thickness: 0.7, color: rgb(0.76, 0.70, 0.86) });
    item.drawText(`${companyName} • Locação de Veículos`, { x: margin, y: 22, size: 7.5, font, color: rgb(0.38, 0.41, 0.48) });
    item.drawText(`Página ${index + 1} de ${pages.length}`, { x: pageWidth - 96, y: 22, size: 7.5, font, color: rgb(0.45, 0.45, 0.5) });
  });

  const bytes = await document.save({ useObjectStreams: false });
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Generated PDF signature invalid');
  return buffer;
}

async function getTenantBranding(companyId: string): Promise<PdfBranding> {
  const company = await getCompany(companyId);
  let logoBase64: string | null = null;
  try {
    const configs = await db.select().from(tenantOperationalConfigs).where(eq(tenantOperationalConfigs.companyId, companyId)).limit(1);
    logoBase64 = configs[0]?.logoUrl || null;
  } catch (error: any) {
    // Estreitar exclusivamente para erro 42703 (coluna logo_url inexistente em ambiente não migrado).
    // Qualquer outro erro de banco é propagado para não esconder falhas silenciosas.
    const pgCode = error?.code || error?.cause?.code;
    if (pgCode === '42703') {
      logoBase64 = null;
    } else {
      throw error;
    }
  }
  return {
    companyName: company.tradeName || company.name || 'MoveFlex',
    logoBase64,
  };
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

function hasPdfSignature(bytes: Buffer): boolean {
  const prefix = bytes.subarray(0, Math.min(bytes.length, 1024));
  return prefix.indexOf(Buffer.from('%PDF', 'ascii')) >= 0;
}

const REQUIRED_DATA_LABELS: Readonly<Record<string, string>> = {
  'company.name': 'razão social da empresa',
  'company.document': 'CNPJ/CPF da empresa',
  'company.address.full': 'endereço completo da empresa',
  'company.address.cityState': 'cidade/UF da empresa',
  'company.address.forum': 'cidade/UF da empresa',
  'company.address.city.signature': 'cidade da empresa',
  'driver.name': 'nome do motorista',
  'driver.cpf': 'CPF do motorista',
  'driver.cnh': 'CNH do motorista',
  'driver.cnhCategory': 'categoria da CNH',
  'driver.cnhExpiration': 'validade da CNH',
  'driver.birthDate': 'data de nascimento do motorista',
  'driver.address.full': 'endereço completo do motorista',
  'driver.address.cityState': 'cidade/UF do motorista',
  'driver.address.zipCode': 'CEP do motorista',
  'driver.phone': 'telefone do motorista',
  'vehicle.brand': 'marca do veículo',
  'vehicle.model': 'modelo do veículo',
  'vehicle.brandModel': 'marca/modelo do veículo',
  'vehicle.yearDisplay': 'ano/modelo do veículo',
  'vehicle.plate': 'placa do veículo',
  'vehicle.renavam': 'RENAVAM do veículo',
  'vehicle.color': 'cor do veículo',
  'vehicle.chassis': 'chassi do veículo',
  'vehicle.currentKm': 'quilometragem atual do veículo',
  'contract.startDate': 'data de início do contrato',
  'contract.rentalAmount': 'valor do aluguel',
  'company.document.signature': 'CNPJ/CPF da empresa',
  'driver.cpf.signature': 'CPF do motorista',
  'driver.name.signature': 'nome do motorista',
};

function requiredDataLabels(fields: string[]): string[] {
  return [...new Set(fields.map((field) => REQUIRED_DATA_LABELS[field] || field))];
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ExecutionRequiredDataError) {
    const fields = requiredDataLabels(error.fields);
    res.status(422).json({
      error: `Preencha os dados obrigatórios antes de gerar o contrato: ${fields.join('; ')}.`,
      missingFields: error.fields,
    });
    return;
  }
  if (error instanceof ExecutionValidationError || error instanceof ContractTemplatePolicyError || error instanceof ContractDocxTemplateError || error instanceof AttachmentStorageValidationError) {
    res.status(400).json({ error: 'Invalid contract execution request' });
    return;
  }
  if (error instanceof ExecutionNotFoundError) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof ExecutionConflictError || error instanceof ContractSignatureRequiredError ||
      (error instanceof Error && error.message === 'Contract financial reconciliation conflict')) {
    res.status(409).json(contractConflictResponse(error instanceof Error ? error.message : undefined));
    return;
  }
  if (error instanceof Error && (error.message.includes('período financeiro') || error.message.includes('Período'))) {
    res.status(409).json(contractConflictResponse('Financial period closed'));
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

  app.use('/api/contracts/:id/generate-pdf', enforcePersistedTemplateAuthority);
  app.use('/api/contracts/:id/generate-docx', enforcePersistedTemplateAuthority);

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

  app.post('/api/contracts/:id/reconcile-initial-receivable', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'RECONCILE_CONTRACT_FINANCE');
    if (!principal) return;
    if (!['ADMIN', 'MANAGER'].includes(String(principal.role || '').toUpperCase())) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      rejectAuthorityFields(bodyOf(req), []);
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompanyWithLock(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new ExecutionNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE, ContractStatus.ACTIVE].includes(contract.status)) {
          throw new ExecutionConflictError();
        }

        const artifacts = await tx.getContractArtifactRepo().findAllForContract(principal.companyId, contract.id);
        const hasOfficialArtifact = artifacts.some((artifact) =>
          !artifact.isArchived &&
          artifact.isCurrent &&
          ['GENERATED_PDF', 'GENERATED_DOCX', 'REVIEWED_FINAL_PDF', 'SIGNED_EVIDENCE'].includes(artifact.artifactType)
        );
        if (!hasOfficialArtifact) throw new ExecutionConflictError();

        const existingIds = new Set((await tx.getReceivableRepo().findByContractId(contract.id)).map(item => item.id));
        const createdReceivables = await ensureInitialContractReceivable(contract, principal, tx);
        const receivable = createdReceivables.find((item) =>
          item.companyId === principal.companyId &&
          item.originType === OriginType.CONTRACT_RENT &&
          item.status !== ObligationStatus.CANCELLED
        );
        if (!receivable) throw new ExecutionConflictError();
        if (existingIds.has(receivable.id)) return { receivable, reused: true };

        await tx.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'Contract',
          entityId: contract.id,
          action: AuditAction.UPDATE,
          userId: principal.userId,
          userName: principal.name,
          newState: JSON.stringify({
            event: 'RECONCILE_INITIAL_RECEIVABLE',
            contractId: contract.id,
            receivableId: receivable.id,
            originType: receivable.originType,
          }),
          timestamp: new Date().toISOString(),
        });

        return { receivable, reused: false };
      }, { financialPeriodLock: 'SHARED' });

      res.status(result.reused ? 200 : 201).json(result);
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
        const attachments = template.contentMarkdown.trim() ? [] : await tx.getAttachmentRepo().findByEntity(principal.companyId, 'ContractTemplate', template.id);
        const classified = classifyContractTemplateSource(template, attachments);
        if (classified?.mode !== 'PDF' || (classified.source && classified.source.storageProvider !== storage.provider)) throw new ExecutionConflictError();
        const { master: approvedMaster, source } = classified;
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
        return { contract, template, driver, vehicle, vehicleInsurance, vehicleTracker, approvedMaster, source };
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
      const templateValues = valuesFromSnapshot(snapshot);
      let sourceChecksum: string | undefined;
      let filledKeys: string[] | undefined;
      let visualPageCount: number | undefined;
      let pdf: Buffer;
      if (prepared.approvedMaster) {
        const missingFields = getMoveFlexVisualFixedMissingFields(prepared.approvedMaster.templateKey, templateValues);
        if (missingFields.length) throw new ExecutionRequiredDataError(missingFields);
        if (!prepared.source?.storageKey) throw new ExecutionConflictError();
        const sourceBytes = await storage.read(principal.companyId, prepared.source.storageKey);
        sourceChecksum = createHash('sha256').update(sourceBytes).digest('hex');
        if (
          sourceChecksum !== prepared.approvedMaster.sha256 ||
          sourceBytes.length !== prepared.approvedMaster.fileSize ||
          sourceChecksum !== prepared.source.checksum ||
          sourceBytes.length !== prepared.source.fileSize
        ) throw new ExecutionValidationError('Invalid VISUAL_FIXO master source');
        const visual = await renderMoveFlexVisualFixedPdf(sourceBytes, prepared.approvedMaster.templateKey, templateValues);
        pdf = visual.bytes;
        filledKeys = visual.filledKeys;
        visualPageCount = visual.pageCount;
      } else {
        const rendered = renderContractTemplate(prepared.template.contentMarkdown, templateValues);
        const branding = await getTenantBranding(principal.companyId);
        pdf = await createPdf(`${prepared.template.title} - ${prepared.contract.contractNumber}`, rendered, branding);
      }
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
        const currentSources = template.contentMarkdown.trim() ? [] : await tx.getAttachmentRepo().findByEntity(principal.companyId, 'ContractTemplate', template.id);
        const currentApprovedMaster = classifyContractTemplateSource(template, currentSources)?.master;
        if (prepared.approvedMaster) {
          if (
            !currentApprovedMaster ||
            currentApprovedMaster.sha256 !== prepared.approvedMaster.sha256 ||
            template.contentMarkdown.trim() ||
            !prepared.source ||
            !sourceChecksum
          ) throw new ExecutionConflictError();
          const source = await tx.getAttachmentRepo().findByIdForCompany(principal.companyId, prepared.source.id);
          if (
            !source || source.isArchived ||
            source.entityType !== 'ContractTemplate' ||
            source.entityId !== template.id ||
            source.documentType !== 'CONTRACT_TEMPLATE_SOURCE' ||
            source.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            source.contentState !== 'AVAILABLE' ||
            source.storageProvider !== storage.provider ||
            source.storageKey !== prepared.source.storageKey ||
            source.checksum !== sourceChecksum ||
            source.checksum !== currentApprovedMaster.sha256 ||
            source.fileSize !== currentApprovedMaster.fileSize
          ) throw new ExecutionConflictError();
        } else if (currentApprovedMaster || !template.contentMarkdown.trim()) {
          throw new ExecutionConflictError();
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
          description: prepared.approvedMaster
            ? 'PDF oficial gerado sobre o arquivo mestre VISUAL_FIXO imutável'
            : 'PDF oficial do contrato gerado no servidor',
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
        const receivables: never[] = [];

        await tx.getAuditLogRepo().create({
          id: randomUUID(), companyId: principal.companyId, entityName: 'Contract', entityId: contract.id,
          action: AuditAction.UPDATE, userId: principal.userId, userName: principal.name,
          newState: JSON.stringify({
            event: prepared.approvedMaster ? 'GENERATE_PDF_FROM_VISUAL_FIXED_MASTER' : 'GENERATE_PDF',
            templateId: template.id,
            snapshotHash,
            approvedMasterFileName: prepared.approvedMaster?.fileName,
            approvedMasterSha256: prepared.approvedMaster?.sha256,
            sourceAttachmentId: prepared.source?.id,
            sourceChecksum,
            pageCount: visualPageCount,
            filledKeys,
          }),
          timestamp: now,
        });

        return { artifact, attachment, contract: updatedContract, receivables };
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
        if (
          !template.isCurrent ||
          !template.isActive ||
          template.contentMarkdown.trim() ||
          getMoveFlexApprovedContractMaster(template.templateKey)
        ) throw new ExecutionConflictError();
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
        if (sources.length !== 1 || classifyContractTemplateSource(template, attachments)?.mode !== 'DOCX') throw new ExecutionConflictError();
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
        const receivables: never[] = [];
        res.status(200).json({ ...replay, receivables });
        return;
      }

      const templateValues = valuesFromSnapshot(snapshot);
      const rendered = renderContractDocxPackage(sourceBytes, templateValues);
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
        const receivables: never[] = [];

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
        return { artifact, attachment, contract: updatedContract, receivables, replayed: false as const };
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
        const generatedTemplate = generatedDocx.templateId
          ? await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, generatedDocx.templateId)
          : null;
        if (generatedTemplate && getMoveFlexApprovedContractMaster(generatedTemplate.templateKey)) {
          throw new ExecutionConflictError();
        }
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
      const branding = await getTenantBranding(principal.companyId);
      const pdf = await createPdf(`Contrato - ${prepared.contract.contractNumber}`, plainText, branding);
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
        !hasPdfSignature(bytes) ||
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
        if (new Date(signedAt).getTime() < contractTimestampUtc(source.createdAt)) throw new ExecutionConflictError();
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
        !hasPdfSignature(bytes) ||
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
          newState: JSON.stringify({ event: 'REGISTER_SIGNED_PDF_EVIDENCE', contractId: contract.id, sourceArtifactId: source.id, checksum, signatureMethod,
            plannedStartDate: contract.startDate, signedAt, effectiveStartDate: new Date(signedAt).toISOString().slice(0, 10) }),
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
