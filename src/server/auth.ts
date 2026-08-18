import { jwtVerify } from 'jose';

export interface AuthenticatedPrincipal {
  userId: string;
  companyId: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface AuthenticatedUserRecord {
  id: string;
  companyId: string;
  name: string;
  role: string;
  active: boolean;
  permissions?: string[] | null;
}

export interface JwtAuthenticationConfig {
  secret: string;
  issuer: string;
  audience: string;
}

export type AuthenticatedUserLookup = (
  userId: string,
  verifiedCompanyId: string
) => Promise<AuthenticatedUserRecord | null>;

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

function requireConfiguredValue(value: string, name: string): string {
  if (!value || value.trim() === '') {
    throw new AuthenticationError(`${name} is not configured`);
  }
  return value;
}

function extractBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid Bearer token');
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new AuthenticationError('Missing or invalid Bearer token');
  }

  return token;
}

function requireStringClaim(
  payload: Record<string, unknown>,
  claimName: 'userId' | 'companyId'
): string {
  const value = payload[claimName];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AuthenticationError(`Missing ${claimName} claim`);
  }
  return value;
}

/**
 * Verifies a raw JWT cryptographically and then revalidates the current user
 * record before creating the server-side principal.
 *
 * The token proves only the authenticated user/tenant pair. Database data stays
 * authoritative for current tenant membership, active status, role, name and
 * permissions on every protected request.
 */
export async function authenticateTokenPrincipal(
  token: string,
  config: JwtAuthenticationConfig,
  findUserById: AuthenticatedUserLookup
): Promise<AuthenticatedPrincipal> {
  if (!token || token.trim() === '') {
    throw new AuthenticationError('Missing authentication token');
  }

  const secret = new TextEncoder().encode(
    requireConfiguredValue(config.secret, 'JWT_SECRET')
  );
  const issuer = requireConfiguredValue(config.issuer, 'JWT_ISSUER');
  const audience = requireConfiguredValue(config.audience, 'JWT_AUDIENCE');

  const { payload } = await jwtVerify(token, secret, {
    issuer,
    audience,
  });

  const payloadRecord = payload as Record<string, unknown>;
  const userId = requireStringClaim(payloadRecord, 'userId');
  const tokenCompanyId = requireStringClaim(payloadRecord, 'companyId');

  const user = await findUserById(userId, tokenCompanyId);
  if (!user) {
    throw new AuthenticationError('Authenticated user does not exist');
  }
  if (user.active !== true) {
    throw new AuthenticationError('Authenticated user is inactive');
  }
  if (!user.companyId || user.companyId !== tokenCompanyId) {
    throw new AuthenticationError('Authenticated tenant does not match current user');
  }
  if (!user.role || user.role.trim() === '') {
    throw new AuthenticationError('Authenticated user has no current role');
  }

  return {
    userId: user.id,
    companyId: user.companyId,
    name: user.name,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? [...user.permissions] : [],
  };
}

/**
 * Compatibility wrapper for Authorization: Bearer clients. Cookie-backed
 * sessions use authenticateTokenPrincipal directly so both transports share the
 * exact same cryptographic verification and database revalidation path.
 */
export async function authenticateBearerPrincipal(
  authorizationHeader: string | undefined,
  config: JwtAuthenticationConfig,
  findUserById: AuthenticatedUserLookup
): Promise<AuthenticatedPrincipal> {
  return await authenticateTokenPrincipal(
    extractBearerToken(authorizationHeader),
    config,
    findUserById
  );
}
