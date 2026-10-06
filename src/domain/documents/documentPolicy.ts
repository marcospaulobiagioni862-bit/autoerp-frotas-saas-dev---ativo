import { DocumentStatus } from '../../types/enums';
import type { DocumentAlertStage } from '../../types/entities';

export class DocumentPolicyValidationError extends Error {}

export const ANNUAL_VEHICLE_DOCUMENT_TYPES = new Set(['IPVA', 'CRLV', 'LICENCIAMENTO']);

export function normalizeDocumentType(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new DocumentPolicyValidationError('Document type is required');
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized || normalized.length > 80) throw new DocumentPolicyValidationError('Invalid document type');
  return normalized;
}

export function isAnnualVehicleDocument(documentType: string): boolean {
  return ANNUAL_VEHICLE_DOCUMENT_TYPES.has(normalizeDocumentType(documentType));
}

export function parseIsoDate(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new DocumentPolicyValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DocumentPolicyValidationError(`Invalid ${field}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new DocumentPolicyValidationError(`Invalid ${field}`);
  return value;
}

export function parseReferenceYear(value: unknown, required = false): number | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new DocumentPolicyValidationError('referenceYear is required');
    return undefined;
  }
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new DocumentPolicyValidationError('Invalid referenceYear');
  return year;
}

export function daysUntilExpiration(expirationDate?: string, now = new Date()): number | undefined {
  if (!expirationDate) return undefined;
  const parsed = parseIsoDate(expirationDate, 'expirationDate', true)!;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expiration = Date.parse(`${parsed}T00:00:00Z`);
  return Math.round((expiration - today) / 86_400_000);
}

export function alertStageForDays(days?: number): DocumentAlertStage {
  if (days === undefined) return 'NONE';
  if (days < 0) return 'POST_DUE';
  if (days === 0) return 'DUE_TODAY';
  if (days === 1) return 'D1';
  if (days <= 7) return 'D7';
  if (days <= 15) return 'D15';
  if (days <= 30) return 'D30';
  if (days <= 60) return 'D60';
  if (days <= 90) return 'D90';
  return 'NONE';
}

export function evaluateDocumentCompliance(
  expirationDate: string | undefined,
  hasAttachment: boolean,
  now = new Date()
): { complianceStatus: DocumentStatus; daysToExpiration?: number; alertStage: DocumentAlertStage } {
  const daysToExpiration = daysUntilExpiration(expirationDate, now);
  const alertStage = alertStageForDays(daysToExpiration);
  if (!hasAttachment) return { complianceStatus: DocumentStatus.PENDING, daysToExpiration, alertStage };
  if (daysToExpiration !== undefined && daysToExpiration < 0) {
    return { complianceStatus: DocumentStatus.EXPIRED, daysToExpiration, alertStage };
  }
  if (daysToExpiration !== undefined && daysToExpiration <= 30) {
    return { complianceStatus: DocumentStatus.EXPIRING_SOON, daysToExpiration, alertStage };
  }
  return { complianceStatus: DocumentStatus.VALID, daysToExpiration, alertStage };
}
