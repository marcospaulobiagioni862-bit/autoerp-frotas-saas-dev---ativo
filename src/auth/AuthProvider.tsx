import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { LoginView } from '../components/auth/LoginView';
import {
  AuthContext,
  AuthUser,
  createAuthSessionClient,
  LoginCredentials,
  resolveEmbeddedAuthUser,
} from '../hooks/useAuth';

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

  const login = useCallback(async (credentials: LoginCredentials) => {
    const authenticatedUser = await client.login(credentials);
    setUser(authenticatedUser);
  }, [client]);

  const logout = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      setUser(null);
    }
  }, [client]);

  if (isRestoring) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6" aria-live="polite">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Verificando sessão segura...
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginView onLogin={login} />;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authMode: embeddedDevelopmentUser ? 'development-mock' : 'server-session',
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
