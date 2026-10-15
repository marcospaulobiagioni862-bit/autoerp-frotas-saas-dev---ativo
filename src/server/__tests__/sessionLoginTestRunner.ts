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
  evaluateSessionRenewal,
  extractSessionTokenFromCookie,
  issueSessionToken,
  processSlidingSessionRenewal,
  SESSION_COOKIE_NAME,
  SESSION_MAX_LIFETIME_SECONDS,
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

    await run('SL15', 'Login UI provides clean email and password authentication with multi-tenant company selection support', async () => {
      const loginViewSource = await import('node:fs/promises').then(({ readFile }) =>
        readFile(new URL('../../components/auth/LoginView.tsx', import.meta.url), 'utf8')
      );
      for (const requiredSource of [
        'type="email"',
        'autoComplete="username"',
        'autoComplete="current-password"',
        'Selecione a empresa',
        'Conexão criptografada ponta a ponta',
      ]) {
        if (!loginViewSource.includes(requiredSource)) {
          throw new Error(`Login UI invariant missing: ${requiredSource}`);
        }
      }
    });

    await run('SL16', 'Token with >30min left does not renew to prevent cookie pollution', async () => {
      const now = Math.floor(Date.now() / 1000);
      const sessionExp = now + 2500; // > 1800s remaining
      const decision = evaluateSessionRenewal(sessionExp, now, now);
      if (decision.shouldRenew) {
        throw new Error('Expected session with >30min left NOT to renew');
      }
      if (decision.reason !== 'NOT_IN_RENEWAL_WINDOW') {
        throw new Error(`Unexpected reason: ${decision.reason}`);
      }
      const result = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: now },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/fleet/vehicles',
        secure: false,
        nowSeconds: now,
      });
      if (result.renewed || result.cookie) {
        throw new Error('processSlidingSessionRenewal renewed token outside renewal window');
      }
    });

    await run('SL17', 'Token with <30min left renews with extended 1h expiration', async () => {
      const now = Math.floor(Date.now() / 1000);
      const sessionExp = now + 1200; // 20 min remaining (< 30 min)
      const decision = evaluateSessionRenewal(sessionExp, now - 1800, now);
      if (!decision.shouldRenew) {
        throw new Error('Expected session with <30min left to renew');
      }
      const result = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: now - 1800 },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/fleet/vehicles',
        secure: false,
        nowSeconds: now,
      });
      if (!result.renewed || !result.token || !result.cookie) {
        throw new Error('processSlidingSessionRenewal failed to produce renewed token and cookie');
      }
      const principal = await authenticateTokenPrincipal(
        result.token,
        JWT_CONFIG,
        async () => activeUser
      );
      if (!principal.sessionExp || principal.sessionExp <= sessionExp) {
        throw new Error(`Renewed sessionExp (${principal.sessionExp}) was not extended beyond ${sessionExp}`);
      }
      if (Math.abs(principal.sessionExp - (now + SESSION_TTL_SECONDS)) > 2) {
        throw new Error(`Renewed sessionExp (${principal.sessionExp}) did not advance by 1 hour`);
      }
    });

    await run('SL18', 'Renewed token strictly preserves original authenticated userId and companyId', async () => {
      const now = Math.floor(Date.now() / 1000);
      const sessionExp = now + 600;
      const originalAuthTime = now - 3000;
      const result = await processSlidingSessionRenewal({
        principal: { userId: 'user-xyz', companyId: 'company-abc', sessionExp, authTime: originalAuthTime },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/any',
        secure: false,
        nowSeconds: now,
      });
      if (!result.renewed || !result.token) {
        throw new Error('Expected renewal');
      }
      const verified = await authenticateTokenPrincipal(
        result.token,
        JWT_CONFIG,
        async (uId, cId) => ({
          id: uId,
          companyId: cId,
          name: 'Target User',
          role: 'ADMIN',
          active: true,
        })
      );
      if (verified.userId !== 'user-xyz' || verified.companyId !== 'company-abc') {
        throw new Error('Renewed token identity diverged from authenticated principal');
      }
    });

    await run('SL19', 'Renewed token preserves original authTime across multiple renewals', async () => {
      const baseNow = Math.floor(Date.now() / 1000);
      const initialAuthTime = baseNow - 4000;
      const token1 = await issueSessionToken(
        { userId: activeUser.id, companyId: activeUser.companyId, authTime: initialAuthTime },
        JWT_CONFIG,
        1200
      );
      const principal1 = await authenticateTokenPrincipal(token1, JWT_CONFIG, async () => activeUser);
      if (principal1.authTime !== initialAuthTime) {
        throw new Error(`Initial token authTime mismatch: got ${principal1.authTime}, expected ${initialAuthTime}`);
      }

      const renewal1 = await processSlidingSessionRenewal({
        principal: principal1,
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/test',
        secure: false,
        nowSeconds: baseNow,
      });
      if (!renewal1.renewed || !renewal1.token) throw new Error('Renewal 1 failed');
      const principal2 = await authenticateTokenPrincipal(renewal1.token, JWT_CONFIG, async () => activeUser);
      if (principal2.authTime !== initialAuthTime) {
        throw new Error(`Renewal 1 did not preserve authTime: got ${principal2.authTime}, expected ${initialAuthTime}`);
      }

      const now2 = baseNow + 2400;
      const renewal2 = await processSlidingSessionRenewal({
        principal: principal2,
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/test',
        secure: false,
        nowSeconds: now2,
      });
      if (!renewal2.renewed || !renewal2.token) throw new Error('Renewal 2 failed');
      const principal3 = await authenticateTokenPrincipal(renewal2.token, JWT_CONFIG, async () => activeUser);
      if (principal3.authTime !== initialAuthTime) {
        throw new Error(`Renewal 2 did not preserve authTime: got ${principal3.authTime}, expected ${initialAuthTime}`);
      }
    });

    await run('SL20', 'Token past 12h absolute ceiling from authTime ceases renewal', async () => {
      const initialAuthTime = 1700000000;
      const nowBeyondCeiling = initialAuthTime + SESSION_MAX_LIFETIME_SECONDS + 1; // 12h + 1s
      const sessionExp = nowBeyondCeiling + 600;

      const decision = evaluateSessionRenewal(sessionExp, initialAuthTime, nowBeyondCeiling);
      if (decision.shouldRenew) {
        throw new Error('Expected session past 12h ceiling NOT to renew');
      }
      if (decision.reason !== 'MAX_LIFETIME_EXCEEDED') {
        throw new Error(`Expected MAX_LIFETIME_EXCEEDED, got: ${decision.reason}`);
      }

      const result = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: initialAuthTime },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/fleet/vehicles',
        secure: false,
        nowSeconds: nowBeyondCeiling,
      });
      if (result.renewed || result.cookie) {
        throw new Error('Session past 12h ceiling was unexpectedly renewed');
      }
    });

    await run('SL21', 'Bearer requests and logout routes are not eligible for sliding renewal', async () => {
      const now = Math.floor(Date.now() / 1000);
      const sessionExp = now + 600;

      const bearerResult = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: now - 3000 },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: false,
        reqPath: '/api/fleet/vehicles',
        secure: false,
        nowSeconds: now,
      });
      if (bearerResult.renewed || bearerResult.cookie || bearerResult.reason !== 'BEARER_NOT_ELIGIBLE') {
        throw new Error(`Bearer transport unexpectedly renewed or gave wrong reason: ${bearerResult.reason}`);
      }

      const logoutResult = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: now - 3000 },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/auth/logout',
        secure: false,
        nowSeconds: now,
      });
      if (logoutResult.renewed || logoutResult.cookie || logoutResult.reason !== 'LOGOUT_ROUTE') {
        throw new Error(`Logout route unexpectedly renewed or gave wrong reason: ${logoutResult.reason}`);
      }
    });

    await run('SL22', 'Inactive user fails authentication and cannot be renewed', async () => {
      const token = await issueSessionToken(sessionIdentity, JWT_CONFIG, 1200);
      await expectRejected(() =>
        authenticateTokenPrincipal(
          token,
          JWT_CONFIG,
          async () => ({ ...activeUser, active: false })
        )
      );
    });

    await run('SL23', 'Renewed cookie maintains HttpOnly, SameSite=Strict, Path=/api and Secure flags', async () => {
      const now = Math.floor(Date.now() / 1000);
      const sessionExp = now + 600;

      const prodResult = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: now - 3000 },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/fleet/vehicles',
        secure: true,
        nowSeconds: now,
      });

      if (!prodResult.renewed || !prodResult.cookie) {
        throw new Error('Production renewal failed');
      }

      for (const requiredPart of [
        `${SESSION_COOKIE_NAME}=`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/api',
        `Max-Age=${SESSION_TTL_SECONDS}`,
        'Secure',
      ]) {
        if (!prodResult.cookie.includes(requiredPart)) {
          throw new Error(`Renewed production cookie missing required flag: ${requiredPart}`);
        }
      }

      const devResult = await processSlidingSessionRenewal({
        principal: { userId: activeUser.id, companyId: activeUser.companyId, sessionExp, authTime: now - 3000 },
        jwtConfig: JWT_CONFIG,
        isCookieTransport: true,
        reqPath: '/api/fleet/vehicles',
        secure: false,
        nowSeconds: now,
      });

      if (!devResult.renewed || !devResult.cookie) {
        throw new Error('Dev renewal failed');
      }
      if (devResult.cookie.includes('Secure')) {
        throw new Error('Non-production renewed cookie unexpectedly contains Secure flag');
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

if (process.argv[1]?.includes('sessionLoginTestRunner')) {
  SessionLoginTestRunner.runAllTests()
    .then((result) => {
      console.log(`SessionLoginTestRunner: ${result.passed}/${result.total} passed`);
      if (result.failed > 0) {
        console.error('Failed tests:', result.tests.filter((t) => !t.passed));
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Unexpected runner error:', err);
      process.exit(1);
    });
}
