export interface ApprovedCnhDriverDraft {
  fullName?: string;
  cpf?: string;
  rg?: string;
  birthDate?: string;
  cnhNumber?: string;
  cnhCategory?: string;
  cnhExpiration?: string;
  cnhEar?: boolean;
}

const CNH_CATEGORIES = new Set(['A', 'B', 'AB', 'C', 'D', 'E']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function sourceValue(
  corrections: Record<string, unknown>,
  proposed: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(corrections, alias)) return corrections[alias];
  }
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(proposed, alias)) return proposed[alias];
  }
  return undefined;
}

function normalizedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > maxLength) return undefined;
  return text;
}

function digits(value: unknown, length: number): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const result = String(value).replace(/\D/g, '');
  return result.length === length ? result : undefined;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  let normalized = text;
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (brazilian) normalized = `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return undefined;
  return normalized;
}

function category(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  return CNH_CATEGORIES.has(normalized) ? normalized : undefined;
}

function ear(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'SIM' || normalized === 'YES' || normalized === 'TRUE') return true;
  if (normalized === 'NÃO' || normalized === 'NAO' || normalized === 'NO' || normalized === 'FALSE') return false;
  return undefined;
}

export function projectApprovedCnhDriverDraft(input: {
  status: string;
  detectedDocumentType?: string | null;
  proposedFields?: unknown;
  corrections?: unknown;
}): ApprovedCnhDriverDraft {
  if (input.status !== 'APPROVED' || String(input.detectedDocumentType || '').toUpperCase() !== 'CNH') {
    return {};
  }

  const proposed = record(input.proposedFields);
  const corrections = record(input.corrections);
  const draft: ApprovedCnhDriverDraft = {};

  const fullName = normalizedText(sourceValue(corrections, proposed, ['fullName', 'name']), 160);
  const cpf = digits(sourceValue(corrections, proposed, ['cpf']), 11);
  const rg = normalizedText(sourceValue(corrections, proposed, ['rg']), 32);
  const birthDate = isoDate(sourceValue(corrections, proposed, ['birthDate']));
  const cnhNumber = digits(sourceValue(corrections, proposed, ['cnhNumber', 'registrationNumber']), 11);
  const cnhCategory = category(sourceValue(corrections, proposed, ['cnhCategory', 'category']));
  const cnhExpiration = isoDate(sourceValue(corrections, proposed, ['cnhExpiration', 'expirationDate']));
  const cnhEar = ear(sourceValue(corrections, proposed, ['cnhEar', 'ear']));

  if (fullName) draft.fullName = fullName;
  if (cpf) draft.cpf = cpf;
  if (rg) draft.rg = rg;
  if (birthDate) draft.birthDate = birthDate;
  if (cnhNumber) draft.cnhNumber = cnhNumber;
  if (cnhCategory) draft.cnhCategory = cnhCategory;
  if (cnhExpiration) draft.cnhExpiration = cnhExpiration;
  if (cnhEar !== undefined) draft.cnhEar = cnhEar;

  return draft;
}
