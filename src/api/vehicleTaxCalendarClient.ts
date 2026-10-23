import { cachedRead, invalidateCache } from './requestCache';

export type VehicleTaxType = 'IPVA_COTA_UNICA' | 'IPVA_PARCELADO' | 'LICENCIAMENTO';

export interface VehicleTaxCalendarEntry {
  id: string;
  uf: string;
  referenceYear: number;
  plateLastDigit: number;
  taxType: VehicleTaxType;
  installment: number;
  dueDate: string;
  notes: string | null;
}

export interface VehicleTaxSchedule {
  plateLastDigit: number | null;
  entries: VehicleTaxCalendarEntry[];
}

export const VEHICLE_TAX_TYPE_LABELS: Record<VehicleTaxType, string> = {
  IPVA_COTA_UNICA: 'IPVA — cota única',
  IPVA_PARCELADO: 'IPVA — parcelado',
  LICENCIAMENTO: 'Licenciamento',
};

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) throw new Error(`Vehicle tax calendar request failed (${response.status})`);
  return await response.json();
}

export class VehicleTaxCalendarClient {
  static async list(filters: { uf?: string; referenceYear?: number } = {}): Promise<VehicleTaxCalendarEntry[]> {
    return cachedRead(`vehicle-tax-calendar:${JSON.stringify(filters)}`, async () => {
      const query = new URLSearchParams();
      if (filters.uf) query.set('uf', filters.uf);
      if (filters.referenceYear) query.set('referenceYear', String(filters.referenceYear));
      const body = await request(`/api/vehicle-tax-calendar${query.size ? `?${query}` : ''}`);
      return (body.items || []) as VehicleTaxCalendarEntry[];
    });
  }

  static async forVehicle(plate: string, uf: string, referenceYear: number): Promise<VehicleTaxSchedule> {
    const query = new URLSearchParams({ plate, uf, referenceYear: String(referenceYear) });
    const body = await request(`/api/vehicle-tax-calendar/vehicle?${query}`);
    return { plateLastDigit: body.plateLastDigit ?? null, entries: (body.entries || []) as VehicleTaxCalendarEntry[] };
  }

  static async upsert(input: Omit<VehicleTaxCalendarEntry, 'id'>): Promise<VehicleTaxCalendarEntry> {
    invalidateCache('vehicle-tax-calendar');
    const body = await request('/api/vehicle-tax-calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return body.item as VehicleTaxCalendarEntry;
  }

  static async applyOfficialSpPreset(referenceYear: number, uf = 'SP'): Promise<{ appliedCount: number; referenceYear: number }> {
    invalidateCache('vehicle-tax-calendar');
    const body = await request('/api/vehicle-tax-calendar/preset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenceYear, uf }),
    });
    return body;
  }

  static async generatePayables(
    vehicleId: string,
    input: { referenceYear: number; taxType: VehicleTaxType; totalAmount: number },
  ): Promise<{ items: any[] }> {
    const body = await request(`/api/vehicle-tax-calendar/vehicle/${encodeURIComponent(vehicleId)}/generate-payables`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return body;
  }
}
