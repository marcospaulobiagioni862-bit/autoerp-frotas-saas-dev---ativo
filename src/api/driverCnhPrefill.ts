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
const ALLOWED_FIELDS = new Set<keyof DriverCnhDraft>([
  'fullName',
  'cpf',
  'rg',
  'birthDate',
  'cnhNumber',
  'cnhCategory',
  'cnhExpiration',
]);

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

  const effective: Record<string, unknown> = {
    ...extraction.proposedFields,
    ...(extraction.corrections || {}),
  };
  const safe: DriverCnhDraft = {};

  for (const key of ALLOWED_FIELDS) {
    const value = effective[key];
    if (key === 'fullName') safe.fullName = cleanText(value, 160);
    if (key === 'cpf') safe.cpf = digits(value, 11, 11);
    if (key === 'rg') safe.rg = cleanText(value, 30);
    if (key === 'birthDate') safe.birthDate = isoDate(value);
    if (key === 'cnhNumber') safe.cnhNumber = digits(value, 9, 20);
    if (key === 'cnhCategory') {
      const category = cleanText(value, 3)?.toUpperCase();
      if (category && CNH_CATEGORIES.has(category)) safe.cnhCategory = category;
    }
    if (key === 'cnhExpiration') safe.cnhExpiration = isoDate(value);
  }

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
