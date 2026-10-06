export interface TenantProfileDto {
  companyId: string;
  companyName: string;
  document: string;
  timezone: string;
  currency: 'BRL';
  maxVehiclesLimit: number;
  maxDriversLimit: number;
  logoUrl: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface TenantProfileUpdateInput {
  companyName: string;
  timezone: string;
  currency: 'BRL';
  maxVehiclesLimit: number;
  maxDriversLimit: number;
  logoUrl?: string | null;
}

export interface TenantBrandingDto {
  companyId: string;
  companyName: string;
  document: string;
  logoUrl: string | null;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid tenant profile response');
  }
  return value as JsonRecord;
}

function parseProfile(value: unknown): TenantProfileDto {
  const row = record(value);
  if (
    typeof row.companyId !== 'string' ||
    typeof row.companyName !== 'string' ||
    typeof row.document !== 'string' ||
    typeof row.timezone !== 'string' ||
    row.currency !== 'BRL' ||
    typeof row.maxVehiclesLimit !== 'number' || !Number.isInteger(row.maxVehiclesLimit) || row.maxVehiclesLimit < 0 || row.maxVehiclesLimit > 100000 ||
    typeof row.maxDriversLimit !== 'number' || !Number.isInteger(row.maxDriversLimit) || row.maxDriversLimit < 0 || row.maxDriversLimit > 200000 ||
    (row.logoUrl !== null && row.logoUrl !== undefined && typeof row.logoUrl !== 'string') ||
    typeof row.updatedAt !== 'string' ||
    typeof row.updatedBy !== 'string'
  ) {
    throw new Error('Invalid tenant profile response');
  }
  return {
    companyId: row.companyId,
    companyName: row.companyName,
    document: row.document,
    timezone: row.timezone,
    currency: row.currency,
    maxVehiclesLimit: row.maxVehiclesLimit,
    maxDriversLimit: row.maxDriversLimit,
    logoUrl: typeof row.logoUrl === 'string' ? row.logoUrl : null,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

async function request(init?: RequestInit): Promise<unknown> {
  const response = await fetch('/api/admin/tenant-profile', { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Tenant profile request failed (${response.status})`;
    try {
      const payload = record(await response.json());
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      // Fail closed: keep status-derived message.
    }
    throw new Error(message);
  }
  return response.json();
}

export class TenantProfileClient {
  static async get(): Promise<TenantProfileDto> {
    const payload = record(await request());
    return parseProfile(payload.item);
  }

  static async getBranding(): Promise<TenantBrandingDto> {
    const response = await fetch('/api/tenant/branding', { credentials: 'include' });
    if (!response.ok) throw new Error(`Branding request failed (${response.status})`);
    const payload = record(await response.json());
    const row = record(payload.item);
    return {
      companyId: String(row.companyId || ''),
      companyName: String(row.companyName || ''),
      document: String(row.document || ''),
      logoUrl: typeof row.logoUrl === 'string' ? row.logoUrl : null,
    };
  }

  static async update(input: TenantProfileUpdateInput): Promise<TenantProfileDto> {
    const payload = record(await request({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: input.companyName,
        timezone: input.timezone,
        currency: input.currency,
        maxVehiclesLimit: input.maxVehiclesLimit,
        maxDriversLimit: input.maxDriversLimit,
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      }),
    }));
    return parseProfile(payload.item);
  }
}
