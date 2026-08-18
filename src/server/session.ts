import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { JwtAuthenticationConfig } from './auth';

export const SESSION_COOKIE_NAME = 'autoerp_session';
export const SESSION_TTL_SECONDS = 15 * 60;

function requireConfiguredValue(value: string, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function issueSessionToken(
  input: { userId: string; companyId: string },
  config: JwtAuthenticationConfig,
  ttlSeconds: number = SESSION_TTL_SECONDS
): Promise<string> {
  if (!input.userId || !input.companyId) {
    throw new Error('SESSION_PRINCIPAL_REQUIRED');
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 60 * 60) {
    throw new Error('SESSION_TTL_INVALID');
  }

  const secretText = requireConfiguredValue(config.secret, 'JWT_SECRET');
  const issuer = requireConfiguredValue(config.issuer, 'JWT_ISSUER');
  const audience = requireConfiguredValue(config.audience, 'JWT_AUDIENCE');
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    userId: input.userId,
    companyId: input.companyId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secretText));
}

export function extractSessionTokenFromCookie(cookieHeader?: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const rawCookie of cookieHeader.split(';')) {
    const separatorIndex = rawCookie.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = rawCookie.slice(0, separatorIndex).trim();
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = rawCookie.slice(separatorIndex + 1).trim();
    return value || undefined;
  }

  return undefined;
}

export function buildSessionCookie(
  token: string,
  options: { secure: boolean; maxAgeSeconds?: number }
): string {
  if (!token) {
    throw new Error('SESSION_TOKEN_REQUIRED');
  }

  const maxAgeSeconds = options.maxAgeSeconds ?? SESSION_TTL_SECONDS;
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function buildExpiredSessionCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}
