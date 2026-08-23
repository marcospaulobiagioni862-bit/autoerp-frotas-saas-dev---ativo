export interface AdminTenantProfileDto {
  companyId: string;
  companyName: string;
  document: string | null;
  timezone: string;
  currency: string;
  maxVehiclesLimit: number;
  maxDriversLimit: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AdminTenantProfilePatchDto {
  companyName?: string;
  timezone?: string;
  currency?: string;
  maxVehiclesLimit?: number;
  maxDriversLimit?: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid tenant profile response');
  return value as JsonRecord;
}

function parseProfile(value: unknown): AdminTenantProfileDto {
  const row = record(value);
  if (
    typeof row.companyId !== 'string' ||
    typeof row.companyName !== 'string' ||
    !(typeof row.document === 'string' || row.document === null) ||
    typeof row.timezone !== 'string' ||
    typeof row.currency !== 'string' ||
    typeof row.maxVehiclesLimit !== 'number' || !Number.isInteger(row.maxVehiclesLimit) ||
    typeof row.maxDriversLimit !== 'number' || !Number.isInteger(row.maxDriversLimit) ||
    typeof row.updatedAt !== 'string' ||
    typeof row.updatedBy !== 'string'
  ) {
    throw new Error('Invalid tenant profile response');
  }
  return {
    companyId: row.companyId,
    companyName: row.companyName,
    document: row.document as string | null,
    timezone: row.timezone,
    currency: row.currency,
    maxVehiclesLimit: row.maxVehiclesLimit,
    maxDriversLimit: row.maxDriversLimit,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Tenant profile request failed (${response.status})`;
    try {
      const payload = record(await response.json());
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      // Fail closed with transport-derived error.
    }
    throw new Error(message);
  }
  return response.json();
}

export class AdminTenantClient {
  static async getProfile(): Promise<AdminTenantProfileDto> {
    const payload = record(await request('/api/admin/tenant-profile'));
    return parseProfile(payload.profile);
  }

  static async updateProfile(patch: AdminTenantProfilePatchDto): Promise<AdminTenantProfileDto> {
    const payload = record(await request('/api/admin/tenant-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }));
    return parseProfile(payload.profile);
  }
}
