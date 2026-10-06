import {
  authenticateTokenPrincipal,
  AuthenticatedUserRecord,
} from '../auth';
import {
  authenticatePasswordLogin,
  InvalidLoginError,
} from '../login';
import { hashPassword } from '../password';
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  extractSessionTokenFromCookie,
  issueSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../session';

interface SessionLoginTestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

const JWT_CONFIG = {
  secret: 'security-2f2a-session-secret-at-least-32-bytes',
  issuer: 'autoerp-session-test',
  audience: 'autoerp-users',
};

async function expectInvalidLogin(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof InvalidLoginError && error.message === 'INVALID_CREDENTIALS') {
      return;
    }
    throw error;
  }
  throw new Error('Expected INVALID_CREDENTIALS');
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

export class SessionLoginTestRunner {
  static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    tests: SessionLoginTestResult[];
  }> {
    const tests: SessionLoginTestResult[] = [];
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

    const password = 'AutoERP-Session-Passphrase-2026';
    const passwordHash = await hashPassword(password);
    const activeUser: AuthenticatedUserRecord = {
      id: 'session-user-1',
      companyId: 'company-1',
      name: 'Session User',
      role: 'OPERATIONAL_MANAGER',
      active: true,
      permissions: ['VIEW_DRIVER_HEALTH'],
    };
    const sessionIdentity = {
      userId: activeUser.id,
      companyId: activeUser.companyId,
    };

    await run('SL01', 'Valid credential returns the current database principal', async () => {
      const principal = await authenticatePasswordLogin(
        {
          companyDocument: ' 12345678000199 ',
          email: ' Session.User@Example.COM ',
          password,
        },
        async (identity) => {
          if (identity.companyDocument !== '12345678000199') {
            throw new Error('Company document was not normalized');
          }
          if (identity.email !== 'session.user@example.com') {
            throw new Error('Email was not normalized');
          }
          return { user: activeUser, passwordHash };
        }
      );

      if (
        principal.userId !== activeUser.id ||
        principal.companyId !== activeUser.companyId ||
        principal.role !== activeUser.role ||
        !principal.permissions.includes('VIEW_DRIVER_HEALTH')
      ) {
        throw new Error('Login did not preserve the current database principal');
      }
    });

    await run('SL02', 'Unknown company/user path fails with uniform invalid credentials', async () => {
      await expectInvalidLogin(() =>
        authenticatePasswordLogin(
          { companyDocument: 'missing', email: 'missing@example.com', password },
          async () => null
        )
      );
    });

    await run('SL03', 'Missing credential fails with uniform invalid credentials', async () => {
      await expectInvalidLogin(() =>
        authenticatePasswordLogin(
          { companyDocument: '123', email: 'session.user@example.com', password },
          async () => ({ user: activeUser, passwordHash: null })
        )
      );
    });

    await run('SL04', 'Inactive user fails with uniform invalid credentials', async () => {
      await expectInvalidLogin(() =>
        authenticatePasswordLogin(
          { companyDocument: '123', email: 'session.user@example.com', password },
          async () => ({ user: { ...activeUser, active: false }, passwordHash })
        )
      );
    });

    await run('SL05', 'Wrong password fails with uniform invalid credentials', async () => {
      await expectInvalidLogin(() =>
        authenticatePasswordLogin(
          {
            companyDocument: '123',
            email: 'session.user@example.com',
            password: 'AutoERP-Wrong-Passphrase-2026',
          },
          async () => ({ user: activeUser, passwordHash })
        )
      );
    });

    await run('SL06', 'Issued session token is revalidated against current database user', async () => {
      const token = await issueSessionToken(sessionIdentity, JWT_CONFIG, 300);
      const currentUser = {
        ...activeUser,
        role: 'ADMIN',
        permissions: ['*'],
      };
      const principal = await authenticateTokenPrincipal(
        token,
        JWT_CONFIG,
        async (userId, companyId) =>
          userId === currentUser.id && companyId === currentUser.companyId
            ? currentUser
            : null
      );

      if (principal.role !== 'ADMIN' || principal.permissions[0] !== '*') {
        throw new Error('Session trusted stale token authorization instead of current DB user');
      }
    });

    await run('SL07', 'Session token signed with wrong secret is rejected', async () => {
      const token = await issueSessionToken(sessionIdentity, JWT_CONFIG, 300);
      await expectRejected(() =>
        authenticateTokenPrincipal(
          token,
          { ...JWT_CONFIG, secret: 'different-session-secret-at-least-32-bytes' },
          async () => activeUser
        )
      );
    });

    await run('SL08', 'Session cookie is HttpOnly, Strict and API-scoped', async () => {
      const cookie = buildSessionCookie('token-value', {
        secure: false,
        maxAgeSeconds: SESSION_TTL_SECONDS,
      });
      for (const requiredPart of [
        `${SESSION_COOKIE_NAME}=token-value`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/api',
        `Max-Age=${SESSION_TTL_SECONDS}`,
      ]) {
        if (!cookie.includes(requiredPart)) {
          throw new Error(`Session cookie missing ${requiredPart}`);
        }
      }
      if (cookie.includes('Secure')) {
        throw new Error('Non-production cookie unexpectedly marked Secure');
      }
    });

    await run('SL09', 'Production session cookie is Secure', async () => {
      const cookie = buildSessionCookie('token-value', { secure: true });
      if (!cookie.includes('Secure')) {
        throw new Error('Production session cookie is not Secure');
      }
    });

    await run('SL10', 'Cookie parser extracts only the AutoERP session token', async () => {
      const token = extractSessionTokenFromCookie(
        `theme=dark; ${SESSION_COOKIE_NAME}=session-token-123; other=value`
      );
      if (token !== 'session-token-123') {
        throw new Error(`Unexpected parsed session token: ${token}`);
      }
    });

    await run('SL11', 'Logout cookie expires the HttpOnly session', async () => {
      const cookie = buildExpiredSessionCookie(true);
      for (const requiredPart of [
        `${SESSION_COOKIE_NAME}=`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/api',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'Secure',
      ]) {
        if (!cookie.includes(requiredPart)) {
          throw new Error(`Expired cookie missing ${requiredPart}`);
        }
      }
    });

    await run('SL12', 'Invalid session TTL is rejected', async () => {
      await expectRejected(() => issueSessionToken(sessionIdentity, JWT_CONFIG, 0));
      await expectRejected(() => issueSessionToken(sessionIdentity, JWT_CONFIG, 3601));
    });

    await run('SL13', 'Authenticated API responses must not be cacheable', async () => {
      const serverSource = await import('node:fs/promises').then(({ readFile }) =>
        readFile(new URL('../../../server.ts', import.meta.url), 'utf8')
      );
      if (!serverSource.includes("app.use('/api'")) {
        throw new Error('API no-store middleware is missing');
      }
      if (!serverSource.includes("res.setHeader('Cache-Control', 'private, no-store')")) {
        throw new Error('Authenticated API responses are cacheable');
      }
      if (!serverSource.includes("res.setHeader('Pragma', 'no-cache')")) {
        throw new Error('Legacy no-cache header is missing');
      }
    });

    await run('SL14', 'Company login resolves CNPJ or unique trade-name alias and fails closed on ambiguity', async () => {
      const serverSource = await import('node:fs/promises').then(({ readFile }) =>
        readFile(new URL('../../../server.ts', import.meta.url), 'utf8')
      );
      for (const requiredSource of [
        'const companyIdentifier = companyDocument.trim().toLowerCase();',
        'lower(${companies.document}) = ${companyIdentifier}',
        "lower(coalesce(${companies.tradeName}, '')) = ${companyIdentifier}",
        '.limit(2);',
        'if (companyRows.length !== 1)',
      ]) {
        if (!serverSource.includes(requiredSource)) {
          throw new Error(`Company alias login invariant missing: ${requiredSource}`);
        }
      }
    });

    await run('SL15', 'Login UI accepts textual company alias as well as CNPJ', async () => {
      const loginViewSource = await import('node:fs/promises').then(({ readFile }) =>
        readFile(new URL('../../components/auth/LoginView.tsx', import.meta.url), 'utf8')
      );
      for (const requiredSource of [
        'Empresa ou CNPJ',
        'inputMode="text"',
        'Minha Locadora ou 00.000.000/0001-00',
      ]) {
        if (!loginViewSource.includes(requiredSource)) {
          throw new Error(`Company alias login UI invariant missing: ${requiredSource}`);
        }
      }
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
