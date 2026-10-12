export interface UserProfileDto {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface UpdateUserProfileInput {
  name?: string;
  phone?: string;
  avatarUrl?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Resposta de perfil inválida');
  }
  return value as JsonRecord;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'include' });
  if (!response.ok) {
    let message = `Falha na requisição (${response.status})`;
    try {
      const payload = record(await response.json());
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      // Fail closed
    }
    throw new Error(message);
  }
  return response.json();
}

export class UserProfileClient {
  static async getProfile(): Promise<UserProfileDto> {
    const payload = record(await request('/api/me/profile'));
    return payload.profile as UserProfileDto;
  }

  static async updateProfile(data: UpdateUserProfileInput): Promise<UserProfileDto> {
    const payload = record(
      await request('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    );
    return payload.profile as UserProfileDto;
  }

  static async changePassword(data: ChangePasswordInput): Promise<{ success: boolean; message: string }> {
    const payload = record(
      await request('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    );
    return {
      success: Boolean(payload.success),
      message: typeof payload.message === 'string' ? payload.message : 'Senha alterada com sucesso',
    };
  }

  static async updateAvatar(avatarUrl: string): Promise<string> {
    const payload = record(
      await request('/api/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl }),
      })
    );
    return payload.avatarUrl as string;
  }

  static async deleteAvatar(): Promise<void> {
    await request('/api/me/avatar', {
      method: 'DELETE',
    });
  }
}
