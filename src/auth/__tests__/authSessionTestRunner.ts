import {
  createAuthSessionClient,
  mapTrustedServerPrincipal,
  resolveEmbeddedAuthUser,
} from '../../hooks/useAuth';

interface AuthSessionTestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function expectRejected(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error('Expected operation to be rejected');
  }
}

export class AuthSessionTestRunner {
  static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    tests: AuthSessionTestResult[];
  }> {
    const tests: AuthSessionTestResult[] = [];
    const run = async (id: string, name: string, action: () => Promise<void>) => {
      try {
        await action();
        tests.push({ id, name, passed: true });
      } catch (error) {
        tests.push({
          id,
          name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const principal = {
      userId: 'server-user-1',
      companyId: 'company-1',
      name: 'Server User',
      role: 'ADMIN',
      permissions: ['*'],
    };

    await run('AS01', 'Trusted server principal maps to compatible AuthUser', async () => {
      const user = mapTrustedServerPrincipal(principal);
      if (!user || user.id !== principal.userId || user.userId !== principal.userId) {
        throw new Error('Trusted principal mapping failed');
      }
      if (user.active !== true || user.companyId !== principal.companyId) {
        throw new Error('Mapped AuthUser lost trusted principal properties');
      }
    });

    await run('AS02', 'Malformed server principal is rejected', async () => {
      const invalidPrincipals = [
        null,
        {},
        { ...principal, userId: '' },
        { ...principal, companyId: '' },
        { ...principal, permissions: ['*', ''] },
        { ...principal, permissions: 'all' },
      ];
      for (const value of invalidPrincipals) {
        if (mapTrustedServerPrincipal(value) !== null) {
          throw new Error('Malformed principal was accepted');
        }
      }
    });

    await run('AS03', 'Session restore uses credentials include and returns trusted user', async () => {
      let seenInput = '';
      let seenInit: RequestInit | undefined;
      const client = createAuthSessionClient(async (input, init) => {
        seenInput = String(input);
        seenInit = init;
        return jsonResponse({ user: principal });
      });

      const user = await client.restore();
      if (!user || user.userId !== principal.userId) {
        throw new Error('Session restore did not return trusted user');
      }
      if (seenInput !== '/api/auth/me' || seenInit?.method !== 'GET' || seenInit?.credentials !== 'include') {
        throw new Error('Session restore did not use secure cookie transport');
      }
    });

    await run('AS04', '401 session restore returns unauthenticated without fallback', async () => {
      const client = createAuthSessionClient(async () => jsonResponse({ error: 'Unauthorized' }, 401));
      if ((await client.restore()) !== null) {
        throw new Error('401 session restore produced an authenticated user');
      }
      if (resolveEmbeddedAuthUser(false) !== null) {
        throw new Error('Production fallback principal was available');
      }
    });

    await run('AS05', 'Login normalizes identity and uses credentials include without token storage', async () => {
      let seenInit: RequestInit | undefined;
      const client = createAuthSessionClient(async (input, init) => {
        if (String(input) !== '/api/auth/login') {
          throw new Error('Unexpected login endpoint');
        }
        seenInit = init;
        return jsonResponse({ user: principal, expiresInSeconds: 900 });
      });

      const user = await client.login({
        companyDocument: ' 12345678000199 ',
        email: ' USER@EXAMPLE.COM ',
        password: 'Secret-Passphrase-2026',
      });
      if (user.userId !== principal.userId || seenInit?.credentials !== 'include' || seenInit?.method !== 'POST') {
        throw new Error('Login did not use secure session transport');
      }

      const body = JSON.parse(String(seenInit?.body));
      if (body.companyDocument !== '12345678000199' || body.email !== 'user@example.com') {
        throw new Error('Login identity was not normalized');
      }
      if (body.password !== 'Secret-Passphrase-2026') {
        throw new Error('Login password changed unexpectedly before transport');
      }
    });

    await run('AS06', 'Failed login never returns an authenticated user', async () => {
      const client = createAuthSessionClient(async () => jsonResponse({ error: 'Invalid credentials' }, 401));
      await expectRejected(() => client.login({
        companyDocument: '123',
        email: 'missing@example.com',
        password: 'Wrong-Passphrase-2026',
      }));
    });

    await run('AS07', 'Logout calls server with credentials include', async () => {
      let seenInput = '';
      let seenInit: RequestInit | undefined;
      const client = createAuthSessionClient(async (input, init) => {
        seenInput = String(input);
        seenInit = init;
        return new Response(null, { status: 204 });
      });
      await client.logout();
      if (seenInput !== '/api/auth/logout' || seenInit?.method !== 'POST' || seenInit?.credentials !== 'include') {
        throw new Error('Logout did not clear the server cookie through secure transport');
      }
    });

    await run('AS08', 'Invalid successful response fails closed', async () => {
      const client = createAuthSessionClient(async () => jsonResponse({ user: { role: 'ADMIN' } }, 200));
      await expectRejected(() => client.restore());
    });

    const passed = tests.filter((test) => test.passed).length;
    return {
      total: tests.length,
      passed,
      failed: tests.length - passed,
      tests,
    };
  }
}
