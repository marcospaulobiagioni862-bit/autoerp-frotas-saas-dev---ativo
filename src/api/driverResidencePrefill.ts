import type { DocumentAiExtraction } from './documentAiClient';
import type { FileAttachment } from '../types/entities';
import { lookupCepAddress } from '../utils/cepLookup';

export interface DriverResidenceDraft {
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  residenceType?: 'HOUSE' | 'APARTMENT' | 'OTHER';
}

type ExtractionFields = Record<string, unknown>;

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return undefined;
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
    if (Object.prototype.hasOwnProperty.call(corrections, key) && corrections[key] !== undefined && corrections[key] !== null && corrections[key] !== '') {
      return corrections[key];
    }
  }
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(proposed, key) && proposed[key] !== undefined && proposed[key] !== null && proposed[key] !== '') {
      return proposed[key];
    }
  }
  return undefined;
}

export function buildResidenceDraftFromExtraction(
  extraction: DocumentAiExtraction,
): DriverResidenceDraft | null {
  const proposed = extraction.proposedFields || {};
  const corrections = extraction.corrections || {};
  const draft: DriverResidenceDraft = {};

  draft.zipCode = digits(sourceValue(corrections, proposed, ['zipCode', 'cep', 'postalCode', 'addressZipCode']), 8, 8);
  draft.street = cleanText(sourceValue(corrections, proposed, ['street', 'logradouro', 'rua', 'address', 'addressStreet']), 160);
  draft.number = cleanText(sourceValue(corrections, proposed, ['number', 'numero', 'addressNumber']), 20);
  draft.complement = cleanText(sourceValue(corrections, proposed, ['complement', 'complemento', 'addressComplement']), 60);
  draft.neighborhood = cleanText(sourceValue(corrections, proposed, ['neighborhood', 'bairro', 'addressNeighborhood']), 80);
  draft.city = cleanText(sourceValue(corrections, proposed, ['city', 'cidade', 'municipio', 'addressCity']), 80);

  const rawState = cleanText(sourceValue(corrections, proposed, ['state', 'uf', 'estado', 'addressState']), 2)?.toUpperCase();
  if (rawState && /^[A-Z]{2}$/.test(rawState)) {
    draft.state = rawState;
  }

  const rawResidenceType = cleanText(sourceValue(corrections, proposed, ['residenceType', 'tipoResidencia']), 20)?.toUpperCase();
  if (rawResidenceType === 'HOUSE' || rawResidenceType === 'APARTMENT' || rawResidenceType === 'OTHER') {
    draft.residenceType = rawResidenceType;
  }

  for (const key of Object.keys(draft) as Array<keyof DriverResidenceDraft>) {
    if (draft[key] === undefined) delete draft[key];
  }

  return Object.keys(draft).length > 0 ? draft : null;
}

export async function resolveResidenceDraft(
  extractions: readonly DocumentAiExtraction[],
  driverAttachments: readonly FileAttachment[],
): Promise<DriverResidenceDraft | null> {
  const residenceAttachments = driverAttachments.filter((att) => {
    if (att.isArchived) return false;
    const docType = String(att.documentType || '').toUpperCase();
    const fileName = String(att.fileName || '').toUpperCase();
    return docType.includes('RESID') || docType.includes('COMPROVANTE') || fileName.includes('RESID') || fileName.includes('ENDERECO');
  });

  const residenceAttachmentIds = new Set(residenceAttachments.map((a) => a.id));

  const relevantExtractions = extractions
    .filter((ext) => residenceAttachmentIds.has(ext.attachmentId) || String(ext.detectedDocumentType || '').toUpperCase().includes('RESID'))
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));

  for (const ext of relevantExtractions) {
    const draft = buildResidenceDraftFromExtraction(ext);
    if (draft) {
      if (draft.zipCode && (!draft.street || !draft.neighborhood || !draft.city || !draft.state)) {
        try {
          const cepResult = await lookupCepAddress(draft.zipCode);
          if (cepResult.status === 'OK') {
            if (!draft.street) draft.street = cepResult.address.street;
            if (!draft.neighborhood) draft.neighborhood = cepResult.address.neighborhood;
            if (!draft.city) draft.city = cepResult.address.city;
            if (!draft.state) draft.state = cepResult.address.state;
          }
        } catch {
          // Keep whatever draft has
        }
      }
      return draft;
    }
  }

  return null;
}
