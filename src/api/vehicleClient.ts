import type { Vehicle } from '../types/entities';
import { VehicleStatus } from '../types/enums';

export class VehicleApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'VehicleApiError';
  }
}

type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vehicle response');
  return value as JsonRecord;
}

function validateVehicle(value: unknown): Vehicle {
  const item = asRecord(value);
  const status = typeof item.status === 'string' ? item.status : '';
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.plate !== 'string' ||
    typeof item.renavam !== 'string' || typeof item.brand !== 'string' || typeof item.model !== 'string' ||
    !Object.values(VehicleStatus).includes(status as VehicleStatus) ||
    !Number.isFinite(item.currentKm) || !Number.isFinite(item.acquisitionValue) ||
    !Number.isFinite(item.currentValue) || !Number.isFinite(item.rentalValueBase) ||
    typeof item.isArchived !== 'boolean' || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string'
  ) throw new Error('Invalid vehicle payload');
  return item as unknown as Vehicle;
}

async function apiError(response: Response): Promise<VehicleApiError> {
  let message = `Vehicle request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {}
  return new VehicleApiError(response.status, message);
}

export interface VehicleWriteInput {
  plate?: string;
  renavam?: string;
  brand?: string;
  model?: string;
  version?: string;
  yearFabrication?: number;
  yearModel?: number;
  color?: string;
  chassis?: string;
  currentKm?: number;
  nextMaintenanceKm?: number;
  fuelType?: string;
  category?: string;
  acquisitionValue?: number;
  currentValue?: number;
  rentalValueBase?: number;
  notes?: string;
}

export type VehicleCreateInput = VehicleWriteInput & Required<Pick<VehicleWriteInput,
  'plate' | 'renavam' | 'brand' | 'model' | 'currentKm' | 'acquisitionValue' | 'currentValue' | 'rentalValueBase'
>>;

export class VehicleClient {
  static async list(): Promise<Vehicle[]> {
    const response = await fetch('/api/fleet/vehicles', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid vehicle list');
    return payload.items.map(validateVehicle);
  }

  static async get(id: string): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async create(input: VehicleCreateInput): Promise<Vehicle> {
    const response = await fetch('/api/fleet/vehicles', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async update(id: string, input: VehicleWriteInput): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async changeStatus(id: string, status: VehicleStatus, reason?: string): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, reason }),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }
}
