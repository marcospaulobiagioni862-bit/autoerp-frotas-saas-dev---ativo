import { confirmDiscardUnsavedChanges, clearAllUnsavedChanges } from '../app/unsavedChangesAuthority';
import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { LoginView } from '../components/auth/LoginView';
import {
  AuthContext,
  AuthUser,
  createAuthSessionClient,
  LoginCredentials,
  LoginResult,
  resolveEmbeddedAuthUser,
} from '../hooks/useAuth';
import { createSessionAwareFetch } from './sessionExpiry';

interface AuthProviderProps {
  children: ReactNode;
}

function isViteDevelopmentRuntime(): boolean {
  const viteImportMeta = import.meta as ImportMeta & {
    env?: {
      DEV?: boolean;
    };
  };
  return viteImportMeta.env?.DEV === true;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const embeddedDevelopmentUser = useMemo(
    () => resolveEmbeddedAuthUser(isViteDevelopmentRuntime()),
    []
  );
  const client = useMemo(
    () => createAuthSessionClient(globalThis.fetch.bind(globalThis)),
    []
  );
  const [user, setUser] = useState<AuthUser | null>(embeddedDevelopmentUser);
  const [isRestoring, setIsRestoring] = useState(embeddedDevelopmentUser === null);

  useEffect(() => {
    if (embeddedDevelopmentUser) {
      return;
    }

    let cancelled = false;
    const restore = async () => {
      try {
        const restoredUser = await client.restore();
        if (!cancelled) {
          setUser(restoredUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [client, embeddedDevelopmentUser]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<LoginResult> => {
    const result = await client.login(credentials);
    if (!('requiresCompanySelection' in result && result.requiresCompanySelection)) {
      setUser(result as AuthUser);
    }
    return result;
  }, [client]);

  const logout = useCallback(async () => {
    if (!confirmDiscardUnsavedChanges()) return;
    clearAllUnsavedChanges();
    try {
      await client.logout();
    } finally {
      setUser(null);
    }
  }, [client]);

  useEffect(() => {
    if (embeddedDevelopmentUser || !user) {
      return;
    }

    const originalFetch = globalThis.fetch;
    const sessionAwareFetch = createSessionAwareFetch(
      originalFetch.bind(globalThis),
      () => setUser(null)
    ) as typeof globalThis.fetch;

    globalThis.fetch = sessionAwareFetch;
    return () => {
      if (globalThis.fetch === sessionAwareFetch) {
        globalThis.fetch = originalFetch;
      }
    };
  }, [embeddedDevelopmentUser, user?.userId]);

  if (isRestoring) {
    return (
      <main className="min-h-screen bg-graphite-50 flex items-center justify-center p-6" aria-live="polite">
        <div className="rounded-xl border border-graphite-200 bg-white px-6 py-5 text-sm text-graphite-600 shadow-sm">
          Verificando sessão segura...
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginView onLogin={login} />;
  }

  const updateUserProfile = (patch: { name?: string; phone?: string | null; avatarUrl?: string | null }) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authMode: embeddedDevelopmentUser ? 'development-mock' : 'server-session',
        logout,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
