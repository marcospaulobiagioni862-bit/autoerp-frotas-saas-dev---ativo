import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const HASH_VERSION = '1';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_MEMORY = 64 * 1024 * 1024;

function validatePasswordPolicy(password: string): void {
  if (typeof password !== 'string') {
    throw new Error('PASSWORD_POLICY_REJECTED');
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('PASSWORD_POLICY_REJECTED');
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordPolicy(password);

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt);

  return [
    'scrypt',
    HASH_VERSION,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') {
    return false;
  }

  const parts = encodedHash.split('$');
  if (parts.length !== 7) {
    return false;
  }

  const [algorithm, version, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  if (
    algorithm !== 'scrypt' ||
    version !== HASH_VERSION ||
    nRaw !== String(SCRYPT_N) ||
    rRaw !== String(SCRYPT_R) ||
    pRaw !== String(SCRYPT_P)
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltRaw, 'base64url');
    const expectedKey = Buffer.from(keyRaw, 'base64url');

    if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);
    if (actualKey.length !== expectedKey.length) {
      return false;
    }

    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
