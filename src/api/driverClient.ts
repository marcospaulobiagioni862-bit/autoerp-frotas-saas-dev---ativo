import type { Driver } from '../types/entities';
import { DocumentStatus, DriverStatus } from '../types/enums';

export class DriverApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'DriverApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Driver payload');
  return value as JsonRecord;
}

const DRIVER_STATUSES = new Set(Object.values(DriverStatus));
const DOCUMENT_STATUSES = new Set(Object.values(DocumentStatus));
const RESIDENCE_TYPES = new Set(['HOUSE', 'APARTMENT', 'OTHER']);

function validateDriver(value: unknown): Driver {
  const item = asRecord(value);
  const address = asRecord(item.address);
  if (
    typeof item.id !== 'string' ||
    typeof item.companyId !== 'string' ||
    typeof item.fullName !== 'string' || item.fullName.length < 3 ||
    typeof item.cpf !== 'string' ||
    typeof item.birthDate !== 'string' ||
    typeof item.phone !== 'string' ||
    typeof item.whatsapp !== 'string' ||
    typeof item.cnhNumber !== 'string' ||
    typeof item.cnhCategory !== 'string' ||
    typeof item.cnhExpiration !== 'string' ||
    typeof item.cnhStatus !== 'string' || !DOCUMENT_STATUSES.has(item.cnhStatus as DocumentStatus) ||
    !Array.isArray(item.appPlatforms) || item.appPlatforms.some((platform) => typeof platform !== 'string') ||
    typeof item.status !== 'string' || !DRIVER_STATUSES.has(item.status as DriverStatus) ||
    typeof item.isArchived !== 'boolean' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string' ||
    typeof address.street !== 'string' ||
    typeof address.number !== 'string' ||
    typeof address.neighborhood !== 'string' ||
    typeof address.city !== 'string' ||
    typeof address.state !== 'string' ||
    typeof address.zipCode !== 'string'
  ) {
    throw new Error('Invalid Driver payload');
  }
  for (const key of ['currentVehicleId', 'currentContractId', 'rg', 'email', 'photoUrl', 'notes'] as const) {
    if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('Invalid Driver payload');
  }
  if (item.cnhEar !== undefined && typeof item.cnhEar !== 'boolean') throw new Error('Invalid Driver payload');
  for (const key of ['complement', 'residenceTypeOther', 'condominiumName', 'blockTower', 'unit', 'floor', 'reference'] as const) {
    if (address[key] !== undefined && typeof address[key] !== 'string') throw new Error('Invalid Driver payload');
  }
  if (address.residenceType !== undefined && (typeof address.residenceType !== 'string' || !RESIDENCE_TYPES.has(address.residenceType))) {
    throw new Error('Invalid Driver payload');
  }
  return item as unknown as Driver;
}

async function apiError(response: Response): Promise<DriverApiError> {
  let message = `Driver request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string') message = payload.error;
  } catch {
    // Preserve fail-closed status when response body is malformed.
  }
  return new DriverApiError(response.status, message);
}

export interface DriverAddressInput {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  residenceType?: 'HOUSE' | 'APARTMENT' | 'OTHER';
  residenceTypeOther?: string;
  condominiumName?: string;
  blockTower?: string;
  unit?: string;
  floor?: string;
  reference?: string;
}

export interface DriverCreateInput {
  fullName: string;
  cpf: string;
  rg?: string;
  birthDate: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: DriverAddressInput;
  cnhNumber: string;
  cnhCategory?: string;
  cnhExpiration: string;
  cnhEar?: boolean;
  appPlatforms?: string[];
  photoUrl?: string;
  notes?: string;
}

export type DriverUpdateInput = Partial<Omit<DriverCreateInput, 'fullName' | 'cpf' | 'birthDate' | 'phone' | 'cnhNumber' | 'cnhExpiration'>> & {
  fullName?: string;
  cpf?: string;
  birthDate?: string;
  phone?: string;
  cnhNumber?: string;
  cnhExpiration?: string;
};

export class DriverClient {
  static async list(): Promise<Driver[]> {
    const response = await fetch('/api/drivers', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid Driver list payload');
    return payload.items.map(validateDriver);
  }

  static async get(id: string): Promise<Driver> {
    const response = await fetch(`/api/drivers/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    return validateDriver(asRecord(await response.json()).item);
  }

  static async create(input: DriverCreateInput): Promise<Driver> {
    const response = await fetch('/api/drivers', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateDriver(asRecord(await response.json()).item);
  }

  static async update(id: string, input: DriverUpdateInput): Promise<Driver> {
    const response = await fetch(`/api/drivers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateDriver(asRecord(await response.json()).item);
  }

  static async changeStatus(
    id: string,
    status: Exclude<DriverStatus, DriverStatus.ARCHIVED>,
    reason?: string
  ): Promise<Driver> {
    const body = reason?.trim() ? { status, reason: reason.trim() } : { status };
    const response = await fetch(`/api/drivers/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await apiError(response);
    return validateDriver(asRecord(await response.json()).item);
  }

  static async archive(id: string): Promise<Driver> {
    const response = await fetch(`/api/drivers/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw await apiError(response);
    return validateDriver(asRecord(await response.json()).item);
  }
}
