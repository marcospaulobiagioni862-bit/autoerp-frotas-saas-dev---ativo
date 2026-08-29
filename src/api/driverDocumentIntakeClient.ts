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
}
