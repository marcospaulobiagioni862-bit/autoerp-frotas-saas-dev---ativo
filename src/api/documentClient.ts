import type { DocumentRecord, DocumentSubjectType } from '../types/entities';
import { DocumentStatus } from '../types/enums';

export class DocumentApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'DocumentApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid document payload');
  return value as JsonRecord;
}

const SUBJECT_TYPES = new Set(['VEHICLE', 'DRIVER']);
const ALERT_STAGES = new Set(['POST_DUE', 'DUE_TODAY', 'D7', 'D15', 'D30', 'D60', 'D90', 'NONE']);
const STATUSES = new Set(Object.values(DocumentStatus));

function validateDocument(value: unknown): DocumentRecord {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.subjectType !== 'string' || !SUBJECT_TYPES.has(item.subjectType) ||
    typeof item.subjectId !== 'string' ||
    typeof item.documentType !== 'string' ||
    typeof item.versionNumber !== 'number' || !Number.isInteger(item.versionNumber) || item.versionNumber < 1 ||
    typeof item.isCurrent !== 'boolean' ||
    typeof item.isArchived !== 'boolean' ||
    typeof item.cost !== 'number' || !Number.isFinite(item.cost) || item.cost < 0 ||
    typeof item.createdBy !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string' ||
    typeof item.complianceStatus !== 'string' || !STATUSES.has(item.complianceStatus as DocumentStatus) ||
    typeof item.alertStage !== 'string' || !ALERT_STAGES.has(item.alertStage)
  ) throw new Error('Invalid document payload');

  if (item.referenceYear !== undefined && (typeof item.referenceYear !== 'number' || !Number.isInteger(item.referenceYear))) {
    throw new Error('Invalid document payload');
  }
  if (item.daysToExpiration !== undefined && (typeof item.daysToExpiration !== 'number' || !Number.isInteger(item.daysToExpiration))) {
    throw new Error('Invalid document payload');
  }
  for (const key of ['documentNumber','issueDate','expirationDate','attachmentId','supersedesDocumentId','payableId','notes'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid document payload');
  }
  return item as unknown as DocumentRecord;
}

async function apiError(response: Response): Promise<DocumentApiError> {
  let message = `Document request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Fail closed with status if the body is malformed.
  }
  return new DocumentApiError(response.status, message);
}

async function jsonRequest(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) throw await apiError(response);
  return asRecord(await response.json());
}

export interface DocumentListFilters {
  subjectType?: DocumentSubjectType;
  subjectId?: string;
  documentType?: string;
  status?: DocumentStatus;
  referenceYear?: number;
  currentOnly?: boolean;
  includeArchived?: boolean;
}

export interface CreateDocumentInput {
  subjectType: DocumentSubjectType;
  subjectId: string;
  documentType: string;
  documentNumber?: string;
  referenceYear?: number;
  issueDate?: string;
  expirationDate?: string;
  attachmentId?: string;
  cost?: number;
  notes?: string;
  generatePayable?: boolean;
  categoryId?: string;
}

export interface VersionDocumentInput {
  documentNumber?: string;
  issueDate?: string;
  expirationDate?: string;
  attachmentId?: string;
  cost?: number;
  notes?: string;
  generatePayable?: boolean;
  categoryId?: string;
}

export class DocumentClient {
  static async list(filters: DocumentListFilters = {}): Promise<DocumentRecord[]> {
    const params = new URLSearchParams();
    if (filters.subjectType) params.set('subjectType', filters.subjectType);
    if (filters.subjectId) params.set('subjectId', filters.subjectId);
    if (filters.documentType) params.set('documentType', filters.documentType);
    if (filters.status) params.set('status', filters.status);
    if (filters.referenceYear !== undefined) params.set('referenceYear', String(filters.referenceYear));
    if (filters.currentOnly !== undefined) params.set('currentOnly', String(filters.currentOnly));
    if (filters.includeArchived !== undefined) params.set('includeArchived', String(filters.includeArchived));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = await jsonRequest(`/api/documents${suffix}`);
    if (!Array.isArray(payload.items)) throw new Error('Invalid document list payload');
    return payload.items.map(validateDocument);
  }

  static async alerts(): Promise<DocumentRecord[]> {
    const payload = await jsonRequest('/api/documents/alerts');
    if (!Array.isArray(payload.items)) throw new Error('Invalid document alerts payload');
    return payload.items.map(validateDocument);
  }

  static async get(id: string): Promise<DocumentRecord> {
    const payload = await jsonRequest(`/api/documents/${encodeURIComponent(id)}`);
    return validateDocument(payload.item);
  }

  static async versions(id: string): Promise<DocumentRecord[]> {
    const payload = await jsonRequest(`/api/documents/${encodeURIComponent(id)}/versions`);
    if (!Array.isArray(payload.items)) throw new Error('Invalid document versions payload');
    return payload.items.map(validateDocument);
  }

  static async create(input: CreateDocumentInput): Promise<DocumentRecord> {
    const payload = await jsonRequest('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return validateDocument(payload.item);
  }

  static async version(id: string, input: VersionDocumentInput): Promise<DocumentRecord> {
    const payload = await jsonRequest(`/api/documents/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return validateDocument(payload.item);
  }

  private static async lifecycle(id: string, action: 'archive' | 'restore'): Promise<DocumentRecord> {
    const payload = await jsonRequest(`/api/documents/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return validateDocument(payload.item);
  }

  static async archive(id: string): Promise<DocumentRecord> {
    return await this.lifecycle(id, 'archive');
  }

  static async restore(id: string): Promise<DocumentRecord> {
    return await this.lifecycle(id, 'restore');
  }
}
