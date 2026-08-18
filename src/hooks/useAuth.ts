import { createContext, useContext } from 'react';

export interface AuthUser {
  id: string;
  userId: string;
  name: string;
  role: string;
  active: boolean;
  companyId: string;
  permissions: string[];
}

export interface LoginCredentials {
  companyDocument: string;
  email: string;
  password: string;
}

export interface AuthContextValue {
  user: AuthUser;
  authMode: 'development-mock' | 'server-session';
  logout: () => Promise<void>;
}

export interface AuthSessionClient {
  restore(): Promise<AuthUser | null>;
  login(credentials: LoginCredentials): Promise<AuthUser>;
  logout(): Promise<void>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

interface ServerPrincipalPayload {
  userId: string;
  companyId: string;
  name: string;
  role: string;
  permissions: string[];
}

const DEVELOPMENT_AUTH_USER: AuthUser = {
  id: 'user-admin-1',
  userId: 'user-admin-1',
  name: 'Admin User',
  role: 'ADMIN',
  active: true,
  companyId: 'company-main-uuid',
  permissions: ['*'],
};

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Development-only embedded identity. Production must never receive this
 * principal and instead restores the HttpOnly server session.
 */
export function resolveEmbeddedAuthUser(isDevelopment: boolean): AuthUser | null {
  if (!isDevelopment) {
    return null;
  }

  return {
    ...DEVELOPMENT_AUTH_USER,
    permissions: [...DEVELOPMENT_AUTH_USER.permissions],
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function mapTrustedServerPrincipal(value: unknown): AuthUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ServerPrincipalPayload>;
  if (
    !isNonEmptyString(candidate.userId) ||
    !isNonEmptyString(candidate.companyId) ||
    !isNonEmptyString(candidate.name) ||
    !isNonEmptyString(candidate.role) ||
    !Array.isArray(candidate.permissions) ||
    !candidate.permissions.every(isNonEmptyString)
  ) {
    return null;
  }

  return {
    id: candidate.userId,
    userId: candidate.userId,
    name: candidate.name,
    role: candidate.role,
    active: true,
    companyId: candidate.companyId,
    permissions: [...candidate.permissions],
  };
}

async function parseUserResponse(response: Response): Promise<AuthUser> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('AUTH_SESSION_INVALID_RESPONSE');
  }

  const rawUser = body && typeof body === 'object'
    ? (body as { user?: unknown }).user
    : undefined;
  const user = mapTrustedServerPrincipal(rawUser);
  if (!user) {
    throw new Error('AUTH_SESSION_INVALID_RESPONSE');
  }
  return user;
}

export function createAuthSessionClient(fetchImpl: FetchLike): AuthSessionClient {
  return {
    async restore(): Promise<AuthUser | null> {
      const response = await fetchImpl('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 401) {
        return null;
      }
      if (!response.ok) {
        throw new Error('AUTH_SESSION_RESTORE_FAILED');
      }
      return await parseUserResponse(response);
    },

    async login(credentials: LoginCredentials): Promise<AuthUser> {
      const response = await fetchImpl('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          companyDocument: credentials.companyDocument.trim(),
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        throw new Error('AUTH_LOGIN_FAILED');
      }
      return await parseUserResponse(response);
    },

    async logout(): Promise<void> {
      const response = await fetchImpl('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok && response.status !== 204) {
        throw new Error('AUTH_LOGOUT_FAILED');
      }
    },
  };
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('AUTH_CONTEXT_REQUIRED');
  }
  return context;
}
