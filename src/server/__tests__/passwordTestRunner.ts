import { hashPassword, verifyPassword } from '../password';

interface PasswordSecurityTestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

async function expectRejected(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }

  if (!rejected) {
    throw new Error('Expected password operation to be rejected');
  }
}

export class PasswordSecurityTestRunner {
  static async runAllTests(): Promise<{
    total: number;
    passed: number;
    failed: number;
    tests: PasswordSecurityTestResult[];
  }> {
    const tests: PasswordSecurityTestResult[] = [];

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

    const validPassword = 'AutoERP-Secure-Passphrase-2026';

    await run('PW01', 'Correct password verifies against its scrypt hash', async () => {
      const encodedHash = await hashPassword(validPassword);
      if (!(await verifyPassword(validPassword, encodedHash))) {
        throw new Error('Correct password did not verify');
      }
    });

    await run('PW02', 'Same password produces different salted hashes', async () => {
      const firstHash = await hashPassword(validPassword);
      const secondHash = await hashPassword(validPassword);
      if (firstHash === secondHash) {
        throw new Error('Password hashes are deterministic');
      }
    });

    await run('PW03', 'Incorrect password is rejected', async () => {
      const encodedHash = await hashPassword(validPassword);
      if (await verifyPassword('AutoERP-Wrong-Passphrase-2026', encodedHash)) {
        throw new Error('Incorrect password was accepted');
      }
    });

    await run('PW04', 'Malformed encoded hash fails closed', async () => {
      const malformedHashes = [
        '',
        'not-a-password-hash',
        'scrypt$1$16384$8$1$broken$broken',
        'scrypt$2$16384$8$1$YWJjZA$YWJjZA',
        'scrypt$1$999999$8$1$YWJjZA$YWJjZA',
      ];

      for (const encodedHash of malformedHashes) {
        if (await verifyPassword(validPassword, encodedHash)) {
          throw new Error(`Malformed hash was accepted: ${encodedHash}`);
        }
      }
    });

    await run('PW05', 'Password shorter than policy minimum is rejected', async () => {
      await expectRejected(() => hashPassword('TooShort123'));
    });

    await run('PW06', 'Encoded hash never contains plaintext password', async () => {
      const encodedHash = await hashPassword(validPassword);
      if (encodedHash.includes(validPassword)) {
        throw new Error('Plaintext password leaked into encoded hash');
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
