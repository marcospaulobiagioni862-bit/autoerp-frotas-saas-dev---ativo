import type { AuditLog, CommunicationLog } from '../types/entities';

export class DetailAuthorityApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'DetailAuthorityApiError';
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid detail-authority payload');
  }
  return value as JsonRecord;
}

function requiredString(item: JsonRecord, key: string): string {
  const value = item[key];
  if (typeof value !== 'string' || !value) throw new Error(`Invalid detail-authority field: ${key}`);
  return value;
}

function optionalString(item: JsonRecord, key: string): string | undefined {
  const value = item[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid detail-authority field: ${key}`);
  return value;
}

function validateAudit(value: unknown): AuditLog {
  const item = asRecord(value);
  return {
    id: requiredString(item, 'id'),
    companyId: requiredString(item, 'companyId'),
    entityName: requiredString(item, 'entityName'),
    entityId: requiredString(item, 'entityId'),
    action: requiredString(item, 'action') as AuditLog['action'],
    previousState: optionalString(item, 'previousState'),
    newState: optionalString(item, 'newState'),
    userId: requiredString(item, 'userId'),
    userName: requiredString(item, 'userName'),
    ipAddress: optionalString(item, 'ipAddress'),
    timestamp: requiredString(item, 'timestamp'),
  };
}

const COMMUNICATION_TYPES = new Set(['RENT_CHARGE', 'DUE_REMINDER', 'TICKET_ALERT', 'MAINTENANCE_ALERT', 'CUSTOM']);
const COMMUNICATION_STATUSES = new Set(['DRAFT', 'OPENED_IN_WHATSAPP', 'MANUALLY_CONFIRMED_SENT']);

function validateCommunication(value: unknown): CommunicationLog {
  const item = asRecord(value);
  const type = requiredString(item, 'type');
  const status = requiredString(item, 'status');
  if (!COMMUNICATION_TYPES.has(type) || !COMMUNICATION_STATUSES.has(status)) {
    throw new Error('Invalid communication-log payload');
  }
  return {
    id: requiredString(item, 'id'),
    companyId: requiredString(item, 'companyId'),
    driverId: requiredString(item, 'driverId'),
    type: type as CommunicationLog['type'],
    phone: requiredString(item, 'phone'),
    message: requiredString(item, 'message'),
    relatedRef: optionalString(item, 'relatedRef'),
    user: requiredString(item, 'user'),
    dateTime: requiredString(item, 'dateTime'),
    status: status as CommunicationLog['status'],
  };
}

async function apiError(response: Response): Promise<DetailAuthorityApiError> {
  let message = `Detail authority request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {
    // Fail closed. There is deliberately no browser/local fallback.
  }
  return new DetailAuthorityApiError(response.status, message);
}

async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) throw await apiError(response);
  return asRecord(await response.json());
}

export class DetailAuthorityClient {
  static async listAudit(entityName: string, entityId: string): Promise<AuditLog[]> {
    const params = new URLSearchParams({ entityName, entityId });
    const payload = await request(`/api/detail-audit?${params.toString()}`);
    if (!Array.isArray(payload.items)) throw new Error('Invalid detail audit list');
    return payload.items.map(validateAudit);
  }

  static async listDriverCommunications(driverId: string): Promise<CommunicationLog[]> {
    const payload = await request(`/api/drivers/${encodeURIComponent(driverId)}/communications`);
    if (!Array.isArray(payload.items)) throw new Error('Invalid communication list');
    return payload.items.map(validateCommunication);
  }

  static async createDriverCommunication(
    driverId: string,
    input: Pick<CommunicationLog, 'type' | 'message'>
  ): Promise<CommunicationLog> {
    const payload = await request(`/api/drivers/${encodeURIComponent(driverId)}/communications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return validateCommunication(payload.item);
  }

  static async confirmCommunicationSent(id: string): Promise<CommunicationLog> {
    const payload = await request(`/api/communications/${encodeURIComponent(id)}/confirm-sent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return validateCommunication(payload.item);
  }
}
