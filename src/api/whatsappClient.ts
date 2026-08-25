export type WhatsappConsentStatus = 'GRANTED' | 'REVOKED';
export type WhatsappOutboxStatus = 'HELD_PROVIDER_DISABLED' | 'CANCELLED';

export interface WhatsappConsent {
  driverId: string;
  status: WhatsappConsentStatus;
  consentSource: 'ERP_MANUAL';
  phoneMasked: string;
  grantedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

export interface WhatsappOutboxItem {
  id: string;
  driverId: string;
  templateKey: 'DRIVER_CNH_EXPIRY';
  templateVersion: number;
  templateParameters: {
    driverName: string;
    cnhExpiration: string;
  };
  referenceType: 'DRIVER';
  referenceId: string;
  status: WhatsappOutboxStatus;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  providerCallApplied: false;
}

type JsonRecord = Record<string, unknown>;
const OUTBOX_ID = /^wao_[a-f0-9]{32}$/;

function invalid(): never {
  throw new Error('Resposta inválida da autoridade de WhatsApp.');
}

function exactRecord(value: unknown, allowed: readonly string[]): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as JsonRecord;
  const allowlist = new Set(allowed);
  if (Object.keys(record).some((key) => !allowlist.has(key))) invalid();
  return record;
}

function nullableIso(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) invalid();
  return value;
}

function requiredIso(value: unknown): string {
  const parsed = nullableIso(value);
  if (!parsed) invalid();
  return parsed;
}

export function parseWhatsappConsent(value: unknown): WhatsappConsent {
  const item = exactRecord(value, [
    'driverId', 'status', 'consentSource', 'phoneMasked',
    'grantedAt', 'revokedAt', 'updatedAt',
  ]);
  if (
    typeof item.driverId !== 'string' ||
    (item.status !== 'GRANTED' && item.status !== 'REVOKED') ||
    item.consentSource !== 'ERP_MANUAL' ||
    typeof item.phoneMasked !== 'string' ||
    !/^\+55•{7}\d{4}$/.test(item.phoneMasked)
  ) invalid();
  return {
    driverId: item.driverId,
    status: item.status,
    consentSource: item.consentSource,
    phoneMasked: item.phoneMasked,
    grantedAt: nullableIso(item.grantedAt),
    revokedAt: nullableIso(item.revokedAt),
    updatedAt: requiredIso(item.updatedAt),
  };
}

export function parseWhatsappOutboxItem(value: unknown): WhatsappOutboxItem {
  const item = exactRecord(value, [
    'id', 'driverId', 'templateKey', 'templateVersion', 'templateParameters', 'referenceType',
    'referenceId', 'status', 'cancellationReason', 'createdAt', 'updatedAt',
    'cancelledAt', 'providerCallApplied',
  ]);
  const parameters = exactRecord(item.templateParameters, ['driverName', 'cnhExpiration']);
  if (
    typeof item.id !== 'string' || !OUTBOX_ID.test(item.id) ||
    typeof item.driverId !== 'string' ||
    item.templateKey !== 'DRIVER_CNH_EXPIRY' ||
    typeof item.templateVersion !== 'number' || !Number.isInteger(item.templateVersion) || item.templateVersion < 1 ||
    typeof parameters.driverName !== 'string' ||
    typeof parameters.cnhExpiration !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(parameters.cnhExpiration) ||
    item.referenceType !== 'DRIVER' ||
    item.referenceId !== item.driverId ||
    (item.status !== 'HELD_PROVIDER_DISABLED' && item.status !== 'CANCELLED') ||
    (item.cancellationReason !== null && typeof item.cancellationReason !== 'string') ||
    item.providerCallApplied !== false
  ) invalid();
  return {
    id: item.id,
    driverId: item.driverId,
    templateKey: item.templateKey,
    templateVersion: item.templateVersion,
    templateParameters: {
      driverName: parameters.driverName,
      cnhExpiration: parameters.cnhExpiration,
    },
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    status: item.status,
    cancellationReason: item.cancellationReason as string | null,
    createdAt: requiredIso(item.createdAt),
    updatedAt: requiredIso(item.updatedAt),
    cancelledAt: nullableIso(item.cancelledAt),
    providerCallApplied: false,
  };
}

async function responseError(response: Response): Promise<Error> {
  let message = `Falha na autoridade de WhatsApp (${response.status}).`;
  try {
    const payload = exactRecord(await response.json(), ['error']);
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve the status-only message for malformed failures.
  }
  return new Error(message);
}

export class WhatsappClient {
  static async getConsent(driverId: string): Promise<WhatsappConsent | null> {
    const response = await fetch(`/api/whatsapp/consents/${encodeURIComponent(driverId)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item']);
    return payload.item === null ? null : parseWhatsappConsent(payload.item);
  }

  static async decideConsent(
    driverId: string,
    decision: 'GRANT' | 'REVOKE',
  ): Promise<{ item: WhatsappConsent; changed: boolean; cancelledHeldItems: number }> {
    const response = await fetch(`/api/whatsapp/consents/${encodeURIComponent(driverId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item', 'changed', 'cancelledHeldItems']);
    if (typeof payload.changed !== 'boolean' || typeof payload.cancelledHeldItems !== 'number' || !Number.isInteger(payload.cancelledHeldItems) || payload.cancelledHeldItems < 0) invalid();
    return {
      item: parseWhatsappConsent(payload.item),
      changed: payload.changed,
      cancelledHeldItems: Number(payload.cancelledHeldItems),
    };
  }

  static async createCnhReminder(driverId: string): Promise<{ item: WhatsappOutboxItem; created: boolean }> {
    const response = await fetch('/api/whatsapp/outbox', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, templateKey: 'DRIVER_CNH_EXPIRY' }),
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['item', 'created']);
    if (typeof payload.created !== 'boolean') invalid();
    return { item: parseWhatsappOutboxItem(payload.item), created: payload.created };
  }

  static async listForDriver(driverId: string): Promise<WhatsappOutboxItem[]> {
    const response = await fetch('/api/whatsapp/outbox', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await responseError(response);
    const payload = exactRecord(await response.json(), ['items']);
    if (!Array.isArray(payload.items)) invalid();
    return payload.items.map(parseWhatsappOutboxItem).filter((item) => item.driverId === driverId);
  }
}
