export type DriverDocumentIntakeStatus =
  | 'DRAFT'
  | 'DOCUMENT_UPLOADED'
  | 'EXTRACTING'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'CONSUMED'
  | 'FAILED'
  | 'ARCHIVED';

export interface DriverDocumentIntake {
  id: string;
  companyId: string;
  createdBy: string;
  status: DriverDocumentIntakeStatus;
  idempotencyKey: string;
  attachmentId?: string;
  approvedExtractionId?: string;
  driverId?: string;
  expiresAt: string;
  consumedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocumentIntakeExtractionSummary {
  id: string;
  attachmentId: string;
  attachmentChecksum: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedCnhDriverDraft {
  fullName?: string;
  cpf?: string;
  rg?: string;
  birthDate?: string;
  cnhNumber?: string;
  cnhCategory?: string;
  cnhExpiration?: string;
}

export interface DriverDocumentIntakePromotionResult {
  driverId: string;
  attachmentId: string;
  promoted: boolean;
}

export interface DriverDocumentIntakeMaterializationResult {
  driverId: string;
  attachmentId: string;
  created: boolean;
}

const STATUSES = new Set<DriverDocumentIntakeStatus>([
  'DRAFT',
  'DOCUMENT_UPLOADED',
  'EXTRACTING',
  'REVIEW_REQUIRED',
  'APPROVED',
  'CONSUMED',
  'FAILED',
  'ARCHIVED',
]);

const DRAFT_KEYS = new Set(['fullName', 'cpf', 'rg', 'birthDate', 'cnhNumber', 'cnhCategory', 'cnhExpiration']);
const CNH_CATEGORIES = new Set(['A', 'B', 'AB', 'C', 'D', 'E']);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid driver document intake payload');
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('Invalid driver document intake payload');
  return value;
}

function validate(value: unknown): DriverDocumentIntake {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.createdBy !== 'string' ||
    typeof item.status !== 'string' || !STATUSES.has(item.status as DriverDocumentIntakeStatus) ||
    typeof item.idempotencyKey !== 'string' ||
    typeof item.expiresAt !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid driver document intake payload');

  for (const key of ['attachmentId', 'approvedExtractionId', 'driverId', 'consumedAt', 'archivedAt'] as const) {
    optionalString(item[key]);
  }

  return item as unknown as DriverDocumentIntake;
}

function validateExtractionSummary(value: unknown): DriverDocumentIntakeExtractionSummary {
  const item = asRecord(value);
  for (const key of ['id', 'attachmentId', 'attachmentChecksum', 'status', 'createdAt', 'updatedAt'] as const) {
    if (typeof item[key] !== 'string' || !String(item[key]).trim()) {
      throw new Error('Invalid driver document intake extraction payload');
    }
  }
  if (!/^[a-f0-9]{64}$/.test(String(item.attachmentChecksum))) {
    throw new Error('Invalid driver document intake extraction payload');
  }
  return item as unknown as DriverDocumentIntakeExtractionSummary;
}

function validatePromotionResult(value: unknown): DriverDocumentIntakePromotionResult {
  const item = asRecord(value);
  if (
    typeof item.driverId !== 'string' || !item.driverId.trim() ||
    typeof item.attachmentId !== 'string' || !item.attachmentId.trim() ||
    typeof item.promoted !== 'boolean' ||
    !Object.keys(item).every((key) => ['driverId', 'attachmentId', 'promoted'].includes(key))
  ) throw new Error('Invalid driver document intake promotion payload');
  return item as unknown as DriverDocumentIntakePromotionResult;
}

function validateMaterializationResult(value: unknown): DriverDocumentIntakeMaterializationResult {
  const item = asRecord(value);
  if (
    typeof item.driverId !== 'string' || !item.driverId.trim() ||
    typeof item.attachmentId !== 'string' || !item.attachmentId.trim() ||
    typeof item.created !== 'boolean' ||
    !Object.keys(item).every((key) => ['driverId', 'attachmentId', 'created'].includes(key))
  ) throw new Error('Invalid driver document intake materialization payload');
  return item as unknown as DriverDocumentIntakeMaterializationResult;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateApprovedCnhDraft(value: unknown): ApprovedCnhDriverDraft {
  const item = asRecord(value);
  if (!Object.keys(item).every((key) => DRAFT_KEYS.has(key)) || Object.keys(item).length === 0) {
    throw new Error('Invalid approved CNH draft payload');
  }
  for (const [key, raw] of Object.entries(item)) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Invalid approved CNH draft payload');
    if ((key === 'cpf' || key === 'cnhNumber') && !/^\d{11}$/.test(raw)) {
      throw new Error('Invalid approved CNH draft payload');
    }
    if ((key === 'birthDate' || key === 'cnhExpiration') && !validIsoDate(raw)) {
      throw new Error('Invalid approved CNH draft payload');
    }
    if (key === 'cnhCategory' && !CNH_CATEGORIES.has(raw)) {
      throw new Error('Invalid approved CNH draft payload');
    }
    if (key === 'fullName' && raw.length > 160) throw new Error('Invalid approved CNH draft payload');
    if (key === 'rg' && raw.length > 32) throw new Error('Invalid approved CNH draft payload');
  }
  return item as ApprovedCnhDriverDraft;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') return payload.error;
  } catch {
    // Fail closed with HTTP status if the body is not JSON.
  }
  return `Driver document intake request failed (${response.status})`;
}

export class DriverDocumentIntakeClient {
  static async create(idempotencyKey: string): Promise<DriverDocumentIntake> {
    const response = await fetch('/api/driver-document-intakes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validate(asRecord(await response.json()).item);
  }

  static async get(id: string): Promise<DriverDocumentIntake> {
    const response = await fetch(`/api/driver-document-intakes/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validate(asRecord(await response.json()).item);
  }

  static async requestDocumentAi(id: string): Promise<{ item: DriverDocumentIntakeExtractionSummary; created: boolean }> {
    const response = await fetch(`/api/driver-document-intakes/${encodeURIComponent(id)}/document-ai`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = asRecord(await response.json());
    if (typeof payload.created !== 'boolean') throw new Error('Invalid driver document intake extraction payload');
    return { item: validateExtractionSummary(payload.item), created: payload.created };
  }

  static async getApprovedCnhDraft(id: string): Promise<ApprovedCnhDriverDraft> {
    const response = await fetch(`/api/driver-document-intakes/${encodeURIComponent(id)}/approved-cnh-draft`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validateApprovedCnhDraft(asRecord(await response.json()).draft);
  }

  static async materializeApprovedCnh(id: string): Promise<DriverDocumentIntakeMaterializationResult> {
    const response = await fetch(`/api/driver-document-intakes/${encodeURIComponent(id)}/materialize-driver`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validateMaterializationResult(asRecord(await response.json()).item);
  }

  static async promote(id: string, driverId: string): Promise<DriverDocumentIntakePromotionResult> {
    const response = await fetch(`/api/driver-document-intakes/${encodeURIComponent(id)}/promote`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ driverId }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return validatePromotionResult(asRecord(await response.json()).item);
  }
}
