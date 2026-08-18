export interface AuthUser {
  id: string;
  userId: string;
  name: string;
  role: string;
  active: boolean;
  companyId: string;
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

/**
 * Resolves the built-in development principal.
 *
 * Production must never receive an embedded trusted identity. A real session
 * provider will replace this development-only path in the next SECURITY-2 wave.
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

function isViteDevelopmentRuntime(): boolean {
  const viteImportMeta = import.meta as ImportMeta & {
    env?: {
      DEV?: boolean;
    };
  };

  return viteImportMeta.env?.DEV === true;
}

export function useAuth() {
  const user = resolveEmbeddedAuthUser(isViteDevelopmentRuntime());

  if (!user) {
    throw new Error(
      'AUTHENTICATION_REQUIRED: embedded ADMIN authentication is disabled outside development; a trusted production session provider is required.'
    );
  }

  return {
    user,
    authMode: 'development-mock' as const,
  };
}
