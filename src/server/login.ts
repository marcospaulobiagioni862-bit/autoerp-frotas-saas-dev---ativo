import { AuthenticatedPrincipal, AuthenticatedUserRecord } from './auth';
import { verifyPassword } from './password';

export interface PasswordLoginInput {
  companyDocument: string;
  email: string;
  password: string;
}

export interface PasswordLoginMaterial {
  user: AuthenticatedUserRecord;
  passwordHash: string | null;
}

export interface NormalizedPasswordLoginIdentity {
  companyDocument: string;
  email: string;
}

export type PasswordLoginMaterialLookup = (
  identity: NormalizedPasswordLoginIdentity
) => Promise<PasswordLoginMaterial | null>;

export class InvalidLoginError extends Error {
  constructor() {
    super('INVALID_CREDENTIALS');
    this.name = 'InvalidLoginError';
  }
}

function normalizeIdentity(input: PasswordLoginInput): NormalizedPasswordLoginIdentity {
  if (
    !input ||
    typeof input.companyDocument !== 'string' ||
    typeof input.email !== 'string' ||
    typeof input.password !== 'string'
  ) {
    throw new InvalidLoginError();
  }

  const companyDocument = input.companyDocument.trim();
  const email = input.email.trim().toLowerCase();

  if (!companyDocument || !email || !input.password) {
    throw new InvalidLoginError();
  }

  return { companyDocument, email };
}

export async function authenticatePasswordLogin(
  input: PasswordLoginInput,
  findMaterial: PasswordLoginMaterialLookup
): Promise<AuthenticatedPrincipal> {
  const identity = normalizeIdentity(input);

  let material: PasswordLoginMaterial | null = null;
  try {
    material = await findMaterial(identity);
  } catch {
    throw new InvalidLoginError();
  }

  if (!material || !material.passwordHash) {
    throw new InvalidLoginError();
  }

  const user = material.user;
  if (
    !user ||
    user.active !== true ||
    !user.id ||
    !user.companyId ||
    !user.name ||
    !user.role ||
    user.role.trim() === ''
  ) {
    throw new InvalidLoginError();
  }

  const validPassword = await verifyPassword(input.password, material.passwordHash);
  if (!validPassword) {
    throw new InvalidLoginError();
  }

  return {
    userId: user.id,
    companyId: user.companyId,
    name: user.name,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? [...user.permissions] : [],
  };
}
