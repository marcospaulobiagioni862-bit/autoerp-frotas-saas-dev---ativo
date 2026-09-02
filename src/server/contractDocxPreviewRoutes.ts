import type { Express, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { companies } from '../db/schema';
import { UnitOfWork } from '../db/uow';
import { ContractStatus } from '../types/enums';
import type { Driver } from '../types/entities';
import type { AuthenticatedPrincipal } from './auth';
import { ContractDocxSourceError } from '../domain/contracts/contractDocxSource';
import { ContractDocxTemplateError } from '../domain/contracts/contractDocxTemplate';
import {
  AttachmentStorageNotFoundError,
  AttachmentStorageUnavailableError,
  AttachmentStorageValidationError,
} from './attachmentStorage';
import {
  ContractDocxPreviewConflictError,
  ContractDocxPreviewNotFoundError,
  renderContractDocxPreview,
} from './contractDocxPreview';

type PreviewAction = 'GENERATE_CONTRACT_PDF';
const CANONICAL_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'OPERATIONAL', 'READONLY']);
const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

class PreviewValidationError extends Error {}
class PreviewNotFoundError extends Error {}
class PreviewConflictError extends Error {}

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response, action: PreviewAction): AuthenticatedPrincipal | null {
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
  if (permissions.includes('*') || permissions.includes(action) || WRITE_ROLES.has(role)) return principal;
  res.status(403).json({ error: 'Forbidden' });
  return null;
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function requestedTemplateId(body: Record<string, unknown>): string {
  if (Object.keys(body).some((key) => key !== 'templateId')) {
    throw new PreviewValidationError('Invalid DOCX preview authority surface');
  }
  const value = typeof body.templateId === 'string' ? body.templateId.trim() : '';
  if (!value || value.length > 120) throw new PreviewValidationError('Invalid templateId');
  return value;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

async function companyFor(companyId: string): Promise<{ name: string; document: string }> {
  const rows = await db.select({ name: companies.name, document: companies.document })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!rows[0]) throw new PreviewNotFoundError();
  return { name: rows[0].name, document: rows[0].document || '' };
}

function safeFileName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'contrato-preview';
}

function sendError(res: Response, error: unknown): void {
  if (
    error instanceof PreviewValidationError ||
    error instanceof ContractDocxSourceError ||
    error instanceof ContractDocxTemplateError ||
    error instanceof AttachmentStorageValidationError
  ) {
    res.status(400).json({ error: 'Invalid DOCX contract preview request' });
    return;
  }
  if (
    error instanceof PreviewNotFoundError ||
    error instanceof ContractDocxPreviewNotFoundError ||
    error instanceof AttachmentStorageNotFoundError
  ) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (error instanceof PreviewConflictError || error instanceof ContractDocxPreviewConflictError) {
    res.status(409).json({ error: 'DOCX contract preview conflict' });
    return;
  }
  if (error instanceof AttachmentStorageUnavailableError) {
    res.status(503).json({ error: 'Attachment storage unavailable' });
    return;
  }
  console.error('AUTOERP_CONTRACT_DOCX_PREVIEW_FAILURE', error);
  res.status(500).json({ error: 'DOCX contract preview failed' });
}

export function registerContractDocxPreviewRoutes(app: Express): void {
  app.post('/api/contracts/:id/preview-docx', async (req: Request, res: Response) => {
    const principal = requirePrincipal(req, res, 'GENERATE_CONTRACT_PDF');
    if (!principal) return;

    try {
      const templateId = requestedTemplateId(bodyOf(req));
      const company = await companyFor(principal.companyId);
      const prepared = await UnitOfWork.run(principal.companyId, async (tx) => {
        const contract = await tx.getContractRepo().findByIdForCompany(principal.companyId, req.params.id);
        if (!contract || contract.isArchived) throw new PreviewNotFoundError();
        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {
          throw new PreviewConflictError();
        }
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, contract.driverId);
        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, contract.vehicleId);
        if (!driver || driver.isArchived || !vehicle || vehicle.isArchived) throw new PreviewNotFoundError();
        return { contract, driver, vehicle };
      });

      const values = {
        'company.name': company.name,
        'company.document': company.document,
        'contract.number': prepared.contract.contractNumber,
        'contract.startDate': prepared.contract.startDate,
        'contract.endDate': prepared.contract.endDate || 'Prazo indeterminado',
        'contract.rentalAmount': formatMoney(prepared.contract.rentalAmount),
        'contract.billingPeriodicity': prepared.contract.billingPeriodicity,
        'contract.securityDepositAmount': formatMoney(prepared.contract.securityDepositAmount),
        'contract.franchiseKm': String(prepared.contract.franchiseKm),
        'contract.excessKmRate': formatMoney(prepared.contract.excessKmRate),
        'driver.name': prepared.driver.fullName,
        'driver.cpf': prepared.driver.cpf,
        'driver.cnh': prepared.driver.cnhNumber,
        'driver.cnhExpiration': prepared.driver.cnhExpiration,
        'driver.address.street': prepared.driver.address.street,
        'driver.address.number': prepared.driver.address.number,
        'driver.address.complement': prepared.driver.address.complement || '',
        'driver.address.neighborhood': prepared.driver.address.neighborhood,
        'driver.address.city': prepared.driver.address.city,
        'driver.address.state': prepared.driver.address.state,
        'driver.address.zipCode': prepared.driver.address.zipCode,
        'driver.address.full': fullDriverAddress(prepared.driver),
        'vehicle.plate': prepared.vehicle.plate,
        'vehicle.brand': prepared.vehicle.brand,
        'vehicle.model': prepared.vehicle.model,
        'vehicle.renavam': prepared.vehicle.renavam,
      };

      const docx = await renderContractDocxPreview(principal.companyId, templateId, values);
      const fileName = `${safeFileName(prepared.contract.contractNumber)}-preview.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(docx);
    } catch (error) {
      sendError(res, error);
    }
  });
}
