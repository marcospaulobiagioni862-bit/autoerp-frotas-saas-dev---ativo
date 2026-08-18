import { createHash, timingSafeEqual } from 'node:crypto';
import { hashPassword } from './password';

export const BOOTSTRAP_TOKEN_MIN_LENGTH = 32;

export interface BootstrapInput {
  companyId: string;
  userId: string;
  companyDocument: string;
  email: string;
  password: string;
}

export interface PreparedBootstrapInput {
  companyId: string;
  userId: string;
  companyDocument: string;
  email: string;
  passwordHash: string;
}

export type BootstrapPersistence = (
  input: PreparedBootstrapInput
) => Promise<{ userId: string; companyId: string; email: string }>;

export class BootstrapUnavailableError extends Error {
  constructor() {
    super('BOOTSTRAP_NOT_AVAILABLE');
    this.name = 'BootstrapUnavailableError';
  }
}

export class BootstrapInputError extends Error {
  constructor() {
    super('BOOTSTRAP_INPUT_INVALID');
    this.name = 'BootstrapInputError';
  }
}

export function assertBootstrapRuntimeConfiguration(
  configuredToken: string | undefined,
  isProduction: boolean
): void {
  if (
    isProduction &&
    configuredToken &&
    configuredToken.length > 0 &&
    configuredToken.length < BOOTSTRAP_TOKEN_MIN_LENGTH
  ) {
    throw new Error('FATAL: AUTOERP_BOOTSTRAP_TOKEN must contain at least 32 characters in production.');
  }
}

function secretsMatch(provided: string, configured: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const configuredDigest = createHash('sha256').update(configured).digest();
  return timingSafeEqual(providedDigest, configuredDigest);
}

function normalizeInput(input: BootstrapInput): Omit<PreparedBootstrapInput, 'passwordHash'> & { password: string } {
  if (
    !input ||
    typeof input.companyId !== 'string' ||
    typeof input.userId !== 'string' ||
    typeof input.companyDocument !== 'string' ||
    typeof input.email !== 'string' ||
    typeof input.password !== 'string'
  ) {
    throw new BootstrapInputError();
  }

  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  const companyDocument = input.companyDocument.trim();
  const email = input.email.trim().toLowerCase();

  if (!companyId || !userId || !companyDocument || !email || !input.password) {
    throw new BootstrapInputError();
  }

  return {
    companyId,
    userId,
    companyDocument,
    email,
    password: input.password,
  };
}

export async function executeAuthorizedBootstrap(
  input: BootstrapInput,
  providedToken: string | undefined,
  configuredToken: string | undefined,
  persist: BootstrapPersistence
): Promise<{ userId: string; companyId: string; email: string }> {
  // Disabled and invalid-secret states intentionally share the same public error.
  if (
    !configuredToken ||
    configuredToken.length < BOOTSTRAP_TOKEN_MIN_LENGTH ||
    !providedToken ||
    !secretsMatch(providedToken, configuredToken)
  ) {
    throw new BootstrapUnavailableError();
  }

  const normalized = normalizeInput(input);
  const passwordHash = await hashPassword(normalized.password);

  return await persist({
    companyId: normalized.companyId,
    userId: normalized.userId,
    companyDocument: normalized.companyDocument,
    email: normalized.email,
    passwordHash,
  });
}
