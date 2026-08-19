const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9.]+)\s*}}/g;

export const CONTRACT_TEMPLATE_PLACEHOLDERS = new Set([
  'company.name',
  'company.document',
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
  'driver.cnh',
  'driver.cnhExpiration',
  'vehicle.plate',
  'vehicle.brand',
  'vehicle.model',
  'vehicle.renavam',
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
