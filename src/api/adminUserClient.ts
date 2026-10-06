export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid user administration response');
  }
  return value as JsonRecord;
}

function parseUser(value: unknown): AdminUserDto {
  const row = record(value);
  if (
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.email !== 'string' ||
    typeof row.role !== 'string' ||
    typeof row.active !== 'boolean' ||
    !Array.isArray(row.permissions) ||
    !row.permissions.every((item) => typeof item === 'string') ||
    typeof row.createdAt !== 'string' ||
    typeof row.updatedAt !== 'string'
  ) {
    throw new Error('Invalid user administration response');
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    permissions: [...row.permissions] as string[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `User administration request failed (${response.status})`;
    try {
      const payload = record(await response.json());
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      // Fail closed: keep transport/status-derived message.
    }
    throw new Error(message);
  }
  return response.json();
}

export class AdminUserClient {
  static async listUsers(): Promise<AdminUserDto[]> {
    const payload = record(await request('/api/admin/users'));
    if (!Array.isArray(payload.items)) throw new Error('Invalid user administration response');
    return payload.items.map(parseUser);
  }

  static async setUserActive(id: string, active: boolean): Promise<AdminUserDto> {
    const payload = record(
      await request(`/api/admin/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
    );
    return parseUser(payload.item);
  }

  static async updateUserPermissions(
    id: string,
    data: { role: string; permissions: string[] }
  ): Promise<AdminUserDto> {
    const payload = record(
      await request(`/api/admin/users/${encodeURIComponent(id)}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    );
    return parseUser(payload.item);
  }
}
