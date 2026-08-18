import {
  assertBootstrapRuntimeConfiguration,
  BootstrapInputError,
  BootstrapUnavailableError,
  executeAuthorizedBootstrap,
} from '../bootstrap';
import { verifyPassword } from '../password';

interface BootstrapTestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

const TOKEN = 'security-2f2b-bootstrap-token-32-plus-chars';
const INPUT = {
  companyId: ' company-1 ',
  userId: ' admin-1 ',
  companyDocument: ' 12345678000199 ',
  email: ' ADMIN@EXAMPLE.COM ',
  password: 'AutoERP-Bootstrap-Passphrase-2026',
};

async function expectUnavailable(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof BootstrapUnavailableError) {
      return;
    }
    throw error;
  }
  throw new Error('Expected BootstrapUnavailableError');
}

export class BootstrapTestRunner {
  static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    tests: BootstrapTestResult[];
  }> {
    const tests: BootstrapTestResult[] = [];
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

    await run('BS01', 'Bootstrap is unavailable when environment token is absent', async () => {
      let persistenceCalls = 0;
      await expectUnavailable(() =>
        executeAuthorizedBootstrap(INPUT, TOKEN, undefined, async () => {
          persistenceCalls += 1;
          throw new Error('Persistence should not run');
        })
      );
      if (persistenceCalls !== 0) {
        throw new Error('Disabled bootstrap reached persistence');
      }
    });

    await run('BS02', 'Wrong bootstrap token is rejected before persistence', async () => {
      let persistenceCalls = 0;
      await expectUnavailable(() =>
        executeAuthorizedBootstrap(INPUT, 'wrong-bootstrap-token-value-000000', TOKEN, async () => {
          persistenceCalls += 1;
          throw new Error('Persistence should not run');
        })
      );
      if (persistenceCalls !== 0) {
        throw new Error('Invalid token reached persistence');
      }
    });

    await run('BS03', 'Weak configured bootstrap token fails production configuration', async () => {
      let rejected = false;
      try {
        assertBootstrapRuntimeConfiguration('too-short', true);
      } catch {
        rejected = true;
      }
      if (!rejected) {
        throw new Error('Weak production bootstrap token was accepted');
      }
      assertBootstrapRuntimeConfiguration('too-short', false);
      assertBootstrapRuntimeConfiguration(undefined, true);
    });

    await run('BS04', 'Authorized bootstrap normalizes identity and hashes password', async () => {
      let persistedHash = '';
      const result = await executeAuthorizedBootstrap(INPUT, TOKEN, TOKEN, async (prepared) => {
        if (prepared.companyId !== 'company-1') throw new Error('companyId not normalized');
        if (prepared.userId !== 'admin-1') throw new Error('userId not normalized');
        if (prepared.companyDocument !== '12345678000199') throw new Error('document not normalized');
        if (prepared.email !== 'admin@example.com') throw new Error('email not normalized');
        if (prepared.passwordHash.includes(INPUT.password)) throw new Error('plaintext password leaked');
        persistedHash = prepared.passwordHash;
        return { userId: prepared.userId, companyId: prepared.companyId, email: prepared.email };
      });

      if (result.email !== 'admin@example.com') {
        throw new Error('Unexpected bootstrap result');
      }
      if (!(await verifyPassword(INPUT.password, persistedHash))) {
        throw new Error('Prepared password hash does not verify');
      }
    });

    await run('BS05', 'Invalid bootstrap input fails before persistence', async () => {
      let persistenceCalls = 0;
      let rejected = false;
      try {
        await executeAuthorizedBootstrap(
          { ...INPUT, companyDocument: '   ' },
          TOKEN,
          TOKEN,
          async () => {
            persistenceCalls += 1;
            throw new Error('Persistence should not run');
          }
        );
      } catch (error) {
        rejected = error instanceof BootstrapInputError;
      }
      if (!rejected || persistenceCalls !== 0) {
        throw new Error('Invalid bootstrap input was not rejected safely');
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
