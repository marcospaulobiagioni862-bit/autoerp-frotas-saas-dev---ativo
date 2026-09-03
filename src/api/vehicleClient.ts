import type { Vehicle, KmRecord } from '../types/entities';
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

const KM_TYPES = new Set(['CHECK_IN', 'CHECK_OUT', 'PERIODIC', 'MAINTENANCE']);
function validateKmRecord(value: unknown): KmRecord {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' || typeof item.companyId !== 'string' || typeof item.vehicleId !== 'string' ||
    !Number.isInteger(item.kmValue) || Number(item.kmValue) < 0 || typeof item.recordDate !== 'string' ||
    typeof item.readingType !== 'string' || !KM_TYPES.has(item.readingType) || typeof item.createdAt !== 'string'
  ) throw new Error('Invalid KM record payload');
  return item as unknown as KmRecord;
}

async function apiError(response: Response): Promise<VehicleApiError> {
  let message = `Vehicle request failed (${response.status})`;
  try {
    const payload = asRecord(await response.json());
    if (typeof payload.error === 'string' && payload.error) message = payload.error;
  } catch {}
  return new VehicleApiError(response.status, message);
}

export interface VehicleUpdateInput {
  plate?: string;
  renavam?: string;
  brand?: string;
  model?: string;
  version?: string;
  yearFabrication?: number;
  yearModel?: number;
  color?: string;
  chassis?: string;
  nextMaintenanceKm?: number;
  fuelType?: string;
  category?: string;
  acquisitionValue?: number;
  currentValue?: number;
  rentalValueBase?: number;
  notes?: string;
}

export type VehicleCreateInput = VehicleUpdateInput & {
  plate: string;
  renavam: string;
  brand: string;
  model: string;
  currentKm: number;
  acquisitionValue: number;
  currentValue: number;
  rentalValueBase: number;
};

export interface VehicleKmInput {
  kmValue: number;
  readingType: KmRecord['readingType'];
  notes?: string;
}

export interface VehicleKmResult {
  record: KmRecord;
  vehicle: Vehicle;
}

export interface VehicleCrlvApplyResult {
  item: Vehicle;
  appliedFields: string[];
}

export interface VehicleCrlvMaintenanceHandoffResult {
  vehicleId: string;
  attachmentId: string;
  reused: boolean;
}

export interface VehicleSaleInput {
  saleDate: string;
  reason: string;
  disposalType: string;
  saleValue: number;
  finalKm: number;
  notes: string;
  buyerName?: string;
  buyerDocument?: string;
}

export interface VehicleArchiveInput {
  archiveDate: string;
  reason: string;
}

export interface VehicleLifecycleEvent {
  id: string;
  action: 'SOLD' | 'ARCHIVED';
  effectiveDate: string;
  reason: string;
  disposalType?: string;
  saleValue?: number;
  buyerName?: string;
  buyerDocument?: string;
  finalKm?: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface VehicleSaleResult {
  item: Vehicle;
  lifecycle: VehicleLifecycleEvent;
}

export interface VehicleArchiveResult {
  item: Vehicle;
  lifecycle: VehicleLifecycleEvent;
}

export interface VehicleLifecycleHistoryResult {
  item: Vehicle;
  lifecycle: VehicleLifecycleEvent[];
}

function validateLifecycle(value: unknown): VehicleLifecycleEvent {
  const item = asRecord(value);
  if (
    typeof item.id !== 'string' ||
    (item.action !== 'SOLD' && item.action !== 'ARCHIVED') ||
    typeof item.effectiveDate !== 'string' ||
    typeof item.reason !== 'string' ||
    typeof item.createdAt !== 'string'
  ) throw new Error('Invalid vehicle lifecycle payload');

  if (item.action === 'SOLD') {
    if (typeof item.disposalType !== 'string' || !Number.isFinite(item.saleValue) || !Number.isInteger(item.finalKm) || typeof item.notes !== 'string') {
      throw new Error('Invalid vehicle sale lifecycle payload');
    }
  }
  if (item.disposalType !== undefined && typeof item.disposalType !== 'string') throw new Error('Invalid vehicle lifecycle payload');
  if (item.saleValue !== undefined && !Number.isFinite(item.saleValue)) throw new Error('Invalid vehicle lifecycle payload');
  if (item.finalKm !== undefined && !Number.isInteger(item.finalKm)) throw new Error('Invalid vehicle lifecycle payload');
  if (item.buyerName !== undefined && typeof item.buyerName !== 'string') throw new Error('Invalid vehicle lifecycle payload');
  if (item.buyerDocument !== undefined && typeof item.buyerDocument !== 'string') throw new Error('Invalid vehicle lifecycle payload');
  if (item.notes !== undefined && typeof item.notes !== 'string') throw new Error('Invalid vehicle lifecycle payload');
  if (item.createdBy !== undefined && typeof item.createdBy !== 'string') throw new Error('Invalid vehicle lifecycle payload');
  return item as unknown as VehicleLifecycleEvent;
}

export class VehicleClient {
  static async list(): Promise<Vehicle[]> {
    const response = await fetch('/api/fleet/vehicles', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid vehicle list');
    return payload.items.map(validateVehicle);
  }

  static async listArchived(): Promise<Vehicle[]> {
    const response = await fetch('/api/fleet/vehicles/archived', { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid archived vehicle list');
    return payload.items.map(validateVehicle);
  }

  static async get(id: string): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async lifecycle(id: string): Promise<VehicleLifecycleHistoryResult> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/lifecycle`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.lifecycle)) throw new Error('Invalid vehicle lifecycle history');
    return { item: validateVehicle(payload.item), lifecycle: payload.lifecycle.map(validateLifecycle) };
  }

  static async create(input: VehicleCreateInput): Promise<Vehicle> {
    const response = await fetch('/api/fleet/vehicles', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async update(id: string, input: VehicleUpdateInput): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async reuseMaintenanceCrlv(workOrderId: string, attachmentId: string): Promise<VehicleCrlvMaintenanceHandoffResult> {
    const response = await fetch('/api/fleet/vehicles/crlv-from-maintenance', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workOrderId, attachmentId }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (typeof payload.vehicleId !== 'string' || typeof payload.attachmentId !== 'string' || typeof payload.reused !== 'boolean') {
      throw new Error('Invalid maintenance CRLV handoff response');
    }
    return { vehicleId: payload.vehicleId, attachmentId: payload.attachmentId, reused: payload.reused };
  }

  static async applyApprovedCrlv(id: string, extractionId: string, fields: string[]): Promise<VehicleCrlvApplyResult> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/crlv-apply`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ extractionId, fields }),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.appliedFields) || payload.appliedFields.some((field) => typeof field !== 'string')) {
      throw new Error('Invalid CRLV apply response');
    }
    return { item: validateVehicle(payload.item), appliedFields: payload.appliedFields as string[] };
  }

  static async changeStatus(id: string, status: VehicleStatus, reason?: string): Promise<Vehicle> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, reason }),
    });
    if (!response.ok) throw await apiError(response);
    return validateVehicle(asRecord(await response.json()).item);
  }

  static async markSold(id: string, input: VehicleSaleInput): Promise<VehicleSaleResult> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/sale`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return { item: validateVehicle(payload.item), lifecycle: validateLifecycle(payload.lifecycle) };
  }

  static async archive(id: string, input: VehicleArchiveInput): Promise<VehicleArchiveResult> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(id)}/archive`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return { item: validateVehicle(payload.item), lifecycle: validateLifecycle(payload.lifecycle) };
  }

  static async listKm(vehicleId: string): Promise<KmRecord[]> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/km-records`, { credentials: 'include' });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    if (!Array.isArray(payload.items)) throw new Error('Invalid KM record list');
    return payload.items.map(validateKmRecord);
  }

  static async recordKm(vehicleId: string, input: VehicleKmInput): Promise<VehicleKmResult> {
    const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/km-records`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw await apiError(response);
    const payload = asRecord(await response.json());
    return { record: validateKmRecord(payload.record), vehicle: validateVehicle(payload.vehicle) };
  }
}