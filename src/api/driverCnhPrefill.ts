import type { DocumentAiExtraction } from './documentAiClient';

export interface DriverCnhDraft {
  fullName?: string;
  cpf?: string;
  rg?: string;
  birthDate?: string;
  cnhNumber?: string;
  cnhCategory?: string;
  cnhExpiration?: string;
}

const CNH_CATEGORIES = new Set(['A', 'B', 'AB', 'C', 'D', 'E']);

type ExtractionFields = Record<string, unknown>;

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return undefined;
  return clean;
}

function isoDate(value: unknown): string | undefined {
  const clean = cleanText(value, 10);
  if (!clean || !/^\d{4}-\d{2}-\d{2}$/.test(clean)) return undefined;
  const timestamp = Date.parse(`${clean}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== clean) return undefined;
  return clean;
}

function digits(value: unknown, min: number, max: number): string | undefined {
  const clean = cleanText(value, 40)?.replace(/\D/g, '');
  if (!clean || clean.length < min || clean.length > max) return undefined;
  return clean;
}

function sourceValue(
  corrections: ExtractionFields,
  proposed: ExtractionFields,
  aliases: readonly string[],
): unknown {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(corrections, key)) return corrections[key];
  }
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(proposed, key)) return proposed[key];
  }
  return undefined;
}

export function buildApprovedCnhDriverDraft(
  extraction: DocumentAiExtraction,
  allowedAttachmentIds: ReadonlySet<string>,
): DriverCnhDraft | null {
  if (
    extraction.status !== 'APPROVED' ||
    extraction.detectedDocumentType?.trim().toUpperCase() !== 'CNH' ||
    !allowedAttachmentIds.has(extraction.attachmentId)
  ) {
    return null;
  }

  const proposed = extraction.proposedFields || {};
  const corrections = extraction.corrections || {};
  const safe: DriverCnhDraft = {};

  safe.fullName = cleanText(sourceValue(corrections, proposed, ['fullName', 'name']), 160);
  safe.cpf = digits(sourceValue(corrections, proposed, ['cpf']), 11, 11);
  safe.rg = cleanText(sourceValue(corrections, proposed, ['rg']), 30);
  safe.birthDate = isoDate(sourceValue(corrections, proposed, ['birthDate']));
  safe.cnhNumber = digits(sourceValue(corrections, proposed, ['cnhNumber', 'registrationNumber']), 9, 20);

  const category = cleanText(sourceValue(corrections, proposed, ['cnhCategory', 'category']), 3)?.toUpperCase();
  if (category && CNH_CATEGORIES.has(category)) safe.cnhCategory = category;

  safe.cnhExpiration = isoDate(sourceValue(corrections, proposed, ['cnhExpiration', 'expirationDate']));

  for (const key of Object.keys(safe) as Array<keyof DriverCnhDraft>) {
    if (safe[key] === undefined) delete safe[key];
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

export function chooseLatestApprovedCnhDraft(
  extractions: readonly DocumentAiExtraction[],
  allowedAttachmentIds: ReadonlySet<string>,
): DriverCnhDraft | null {
  const approved = extractions
    .filter((item) => item.status === 'APPROVED')
    .slice()
    .sort((a, b) => Date.parse(b.approvedAt || b.updatedAt) - Date.parse(a.approvedAt || a.updatedAt));

  for (const extraction of approved) {
    const draft = buildApprovedCnhDriverDraft(extraction, allowedAttachmentIds);
    if (draft) return draft;
  }
  return null;
}
