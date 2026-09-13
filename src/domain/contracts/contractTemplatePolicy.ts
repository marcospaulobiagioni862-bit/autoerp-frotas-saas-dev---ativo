import type { ContractTemplate, FileAttachment } from '../../types/entities';
import { getMoveFlexApprovedContractMaster, MOVEFLEX_APPROVED_CONTRACT_MASTERS } from './moveflexApprovedContractMaster';

export type ContractGenerationMode = 'PDF' | 'DOCX';

// Read the server's source validation result; absence must fail closed.
export function contractTemplateGenerationMode(template: ContractTemplate): ContractGenerationMode | null {
  const mode = (template as ContractTemplate & { generationMode?: unknown }).generationMode;
  return template.isCurrent && template.isActive && !template.isArchived && (mode === 'PDF' || mode === 'DOCX') ? mode : null;
}

export function classifyContractTemplateSource(template: ContractTemplate, attachments: FileAttachment[]) {
  if (!template.isCurrent || !template.isActive || template.isArchived) return null;
  const keyedMaster = getMoveFlexApprovedContractMaster(template.templateKey);
  if (template.contentMarkdown.trim()) {
    if (keyedMaster) return null;
    try { validateContractTemplateContent(template.contentMarkdown); } catch { return null; }
    return { mode: 'PDF' as const, master: undefined, source: undefined };
  }
  const sources = attachments.filter((item) => !item.isArchived && item.entityType === 'ContractTemplate' &&
    item.companyId === template.companyId && item.entityId === template.id &&
    item.documentType === 'CONTRACT_TEMPLATE_SOURCE' && item.contentState === 'AVAILABLE');
  if (sources.length !== 1) return null;
  const source = sources[0];
  if (source.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      !source.storageKey || !source.checksum || !source.fileSize) return null;
  // Imports with a sequential key still represent the same immutable master.
  const master = MOVEFLEX_APPROVED_CONTRACT_MASTERS.find((item) => item.sha256 === source.checksum && item.fileSize === source.fileSize);
  if (keyedMaster && master?.sha256 !== keyedMaster.sha256) return null;
  return { mode: master ? 'PDF' as const : 'DOCX' as const, master, source };
}

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9.]+)\s*}}/g;

export const CONTRACT_TEMPLATE_PLACEHOLDERS = new Set([
  'company.name',
  'company.tradeName',
  'company.document',
  'company.email',
  'company.phone',
  'company.whatsapp',
  'company.address.street',
  'company.address.number',
  'company.address.complement',
  'company.address.neighborhood',
  'company.address.city',
  'company.address.state',
  'company.address.zipCode',
  'company.address.full',
  'company.legalRepresentative.name',
  'company.legalRepresentative.cpf',
  'contract.number',
  'contract.startDate',
  'contract.endDate',
  'contract.rentalAmount',
  'contract.billingPeriodicity',
  'contract.securityDepositAmount',
  'contract.franchiseKm',
  'contract.excessKmRate',
  'driver.name',
  'driver.cpf',
  'driver.rg',
  'driver.birthDate',
  'driver.phone',
  'driver.whatsapp',
  'driver.email',
  'driver.maritalStatus',
  'driver.profession',
  'driver.motherName',
  'driver.pixKey',
  'driver.cnh',
  'driver.cnhCategory',
  'driver.cnhExpiration',
  'driver.address.street',
  'driver.address.number',
  'driver.address.complement',
  'driver.address.neighborhood',
  'driver.address.city',
  'driver.address.state',
  'driver.address.zipCode',
  'driver.address.full',
  'vehicle.plate',
  'vehicle.brand',
  'vehicle.model',
  'vehicle.version',
  'vehicle.brandModel',
  'vehicle.yearFabrication',
  'vehicle.yearModel',
  'vehicle.yearDisplay',
  'vehicle.color',
  'vehicle.renavam',
  'vehicle.chassis',
  'vehicle.currentKm',
  'vehicle.insurance.company',
  'vehicle.insurance.policyNumber',
  'vehicle.insurance.coverageDetails',
  'vehicle.insurance.deductibleAmount',
  'vehicle.insurance.startDate',
  'vehicle.insurance.endDate',
  'vehicle.tracker.model',
  'vehicle.tracker.imei',
  'vehicle.tracker.serialNumber',
  'vehicle.tracker.chipCarrier',
  'vehicle.tracker.chipNumber',
  'vehicle.tracker.installationDate',
]);

export class ContractTemplatePolicyError extends Error {}

export function validateContractTemplateContent(contentMarkdown: string): void {
  if (typeof contentMarkdown !== 'string') throw new ContractTemplatePolicyError('Invalid template content');
  const clean = contentMarkdown.trim();
  if (clean.length < 10 || clean.length > 100_000) throw new ContractTemplatePolicyError('Invalid template content');
  if (/<\s*script\b/i.test(clean) || /javascript\s*:/i.test(clean) || /<\s*iframe\b/i.test(clean)) {
    throw new ContractTemplatePolicyError('Executable markup is not allowed');
  }
  for (const match of clean.matchAll(PLACEHOLDER_PATTERN)) {
    if (!CONTRACT_TEMPLATE_PLACEHOLDERS.has(match[1])) {
      throw new ContractTemplatePolicyError(`Unknown contract placeholder: ${match[1]}`);
    }
  }
  const withoutKnown = clean.replace(PLACEHOLDER_PATTERN, '');
  if (/{{|}}/.test(withoutKnown)) throw new ContractTemplatePolicyError('Malformed contract placeholder');
}

export type ContractTemplateValues = Record<string, string>;

export function renderContractTemplate(contentMarkdown: string, values: ContractTemplateValues): string {
  validateContractTemplateContent(contentMarkdown);
  return contentMarkdown.replace(PLACEHOLDER_PATTERN, (_full, key: string) => {
    if (!CONTRACT_TEMPLATE_PLACEHOLDERS.has(key)) throw new ContractTemplatePolicyError(`Unknown contract placeholder: ${key}`);
    if (!Object.prototype.hasOwnProperty.call(values, key)) throw new ContractTemplatePolicyError(`Missing contract placeholder value: ${key}`);
    return values[key];
  });
}
