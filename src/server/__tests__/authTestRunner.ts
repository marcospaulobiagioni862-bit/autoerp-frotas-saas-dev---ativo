import { SignJWT } from 'jose';
import {
  authenticateBearerPrincipal,
  AuthenticatedUserRecord,
} from '../auth';

interface AuthTestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

const ISSUER = 'autoerp-test';
const AUDIENCE = 'autoerp-users';
const SECRET = 'security-2b-test-secret-at-least-32-bytes';

async function signToken(input: {
  userId: string;
  companyId: string;
  role?: string;
  secret?: string;
  expired?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    userId: input.userId,
    companyId: input.companyId,
    role: input.role || 'USER',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(input.expired ? now - 60 : now + 3600)
    .sign(new TextEncoder().encode(input.secret || SECRET));
}

function createTenantScopedLookup(users: AuthenticatedUserRecord[]) {
  const byId = new Map(users.map((user) => [user.id, user]));
  return async (userId: string, verifiedCompanyId: string) => {
    const user = byId.get(userId) || null;
    if (!user || user.companyId !== verifiedCompanyId) {
      return null;
    }
    return user;
  };
}

async function expectRejected(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error('Expected authentication to be rejected');
  }
}

export class ServerAuthTestRunner {
  static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    tests: AuthTestResult[];
  }> {
    const tests: AuthTestResult[] = [];

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

    const activeUser: AuthenticatedUserRecord = {
      id: 'server-user-1',
      companyId: 'company-1',
      name: 'Server User',
      role: 'OPERATIONAL_MANAGER',
      active: true,
      permissions: ['VIEW_DRIVER_HEALTH'],
    };

    await run('SA01', 'Valid JWT uses current database role and permissions', async () => {
      const token = await signToken({
        userId: activeUser.id,
        companyId: activeUser.companyId,
        role: 'ADMIN',
      });
      const principal = await authenticateBearerPrincipal(
        `Bearer ${token}`,
        { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
        createTenantScopedLookup([activeUser])
      );

      if (principal.role !== activeUser.role) {
        throw new Error(`Expected DB role ${activeUser.role}, got ${principal.role}`);
      }
      if (principal.companyId !== activeUser.companyId) {
        throw new Error('Database tenant was not preserved');
      }
      if (!principal.permissions.includes('VIEW_DRIVER_HEALTH')) {
        throw new Error('Database permissions were not preserved');
      }
    });

    await run('SA02', 'Missing Bearer token is rejected', async () => {
      await expectRejected(() =>
        authenticateBearerPrincipal(
          undefined,
          { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
          createTenantScopedLookup([activeUser])
        )
      );
    });

    await run('SA03', 'Invalid JWT signature is rejected before user lookup', async () => {
      const token = await signToken({
        userId: activeUser.id,
        companyId: activeUser.companyId,
        secret: 'different-security-2b-secret-32-bytes',
      });
      let lookupCalls = 0;
      await expectRejected(() =>
        authenticateBearerPrincipal(
          `Bearer ${token}`,
          { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
          async () => {
            lookupCalls += 1;
            return activeUser;
          }
        )
      );
      if (lookupCalls !== 0) {
        throw new Error(`Invalid signature reached user lookup ${lookupCalls} time(s)`);
      }
    });

    await run('SA04', 'Expired JWT is rejected', async () => {
      const token = await signToken({
        userId: activeUser.id,
        companyId: activeUser.companyId,
        expired: true,
      });
      await expectRejected(() =>
        authenticateBearerPrincipal(
          `Bearer ${token}`,
          { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
          createTenantScopedLookup([activeUser])
        )
      );
    });

    await run('SA05', 'Unknown authenticated user is rejected', async () => {
      const token = await signToken({
        userId: 'deleted-user',
        companyId: activeUser.companyId,
      });
      await expectRejected(() =>
        authenticateBearerPrincipal(
          `Bearer ${token}`,
          { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
          createTenantScopedLookup([activeUser])
        )
      );
    });

    await run('SA06', 'Inactive authenticated user is rejected', async () => {
      const inactiveUser = { ...activeUser, active: false };
      const token = await signToken({
        userId: inactiveUser.id,
        companyId: inactiveUser.companyId,
      });
      await expectRejected(() =>
        authenticateBearerPrincipal(
          `Bearer ${token}`,
          { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
          createTenantScopedLookup([inactiveUser])
        )
      );
    });

    await run('SA07', 'Token tenant different from current user tenant is rejected by scoped lookup', async () => {
      const token = await signToken({
        userId: activeUser.id,
        companyId: 'company-attacker',
      });
      await expectRejected(() =>
        authenticateBearerPrincipal(
          `Bearer ${token}`,
          { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
          createTenantScopedLookup([activeUser])
        )
      );
    });

    await run('SA08', 'Verified JWT tenant is passed exactly to the user lookup', async () => {
      const token = await signToken({
        userId: activeUser.id,
        companyId: activeUser.companyId,
      });
      let receivedUserId = '';
      let receivedCompanyId = '';

      const principal = await authenticateBearerPrincipal(
        `Bearer ${token}`,
        { secret: SECRET, issuer: ISSUER, audience: AUDIENCE },
        async (userId, verifiedCompanyId) => {
          receivedUserId = userId;
          receivedCompanyId = verifiedCompanyId;
          return activeUser;
        }
      );

      if (receivedUserId !== activeUser.id) {
        throw new Error(`Lookup received wrong userId: ${receivedUserId}`);
      }
      if (receivedCompanyId !== activeUser.companyId) {
        throw new Error(`Lookup received wrong companyId: ${receivedCompanyId}`);
      }
      if (principal.userId !== activeUser.id) {
        throw new Error('Principal userId changed unexpectedly');
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
