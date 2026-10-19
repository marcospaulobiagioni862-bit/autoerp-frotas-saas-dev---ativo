import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { JwtAuthenticationConfig } from './auth';

export const SESSION_COOKIE_NAME = 'autoerp_session';
// AUTOERP-90. Era 15 minutos, sem nenhuma renovacao - o usuario era deslogado a
// cada 15 minutos mesmo usando o sistema o tempo todo (nao e inatividade: e tempo
// de vida fixo). Quem ficava numa tela durante uma reuniao perdia a sessao no
// clique seguinte. Decisao do Pedro em 2026-10-09: no minimo 1 hora.
// A renovacao deslizante (reemitir o cookie a cada requisicao autenticada) fica
// como passo seguinte deste mesmo card: ela exige mexer no middleware do
// server.ts, que esta sendo reescrito pelo AUTOERP-82 neste momento.
export const SESSION_TTL_SECONDS = 60 * 60;
// Teto absoluto de vida da sessao deslizante a partir do login inicial (12 horas).
// Impede que sessoes renovadas deslizantemente durem indefinidamente (sessao eterna).
export const SESSION_MAX_LIFETIME_SECONDS = 12 * 60 * 60;

function requireConfiguredValue(value: string, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function issueSessionToken(
  input: { userId: string; companyId: string; authTime?: number },
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
  const authTime = typeof input.authTime === 'number' && Number.isInteger(input.authTime) && input.authTime > 0
    ? input.authTime
    : now;

  return await new SignJWT({
    userId: input.userId,
    companyId: input.companyId,
    authTime,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secretText));
}

export interface SessionRenewalDecision {
  shouldRenew: boolean;
  reason?: 'NOT_IN_RENEWAL_WINDOW' | 'MAX_LIFETIME_EXCEEDED' | 'MISSING_EXPIRATION' | 'BEARER_NOT_ELIGIBLE' | 'LOGOUT_ROUTE';
}

export function evaluateSessionRenewal(
  sessionExp: number | undefined,
  authTime: number | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SessionRenewalDecision {
  if (typeof sessionExp !== 'number' || !Number.isFinite(sessionExp)) {
    return { shouldRenew: false, reason: 'MISSING_EXPIRATION' };
  }

  const remainingSeconds = sessionExp - nowSeconds;
  // Reemitir so quando ja passou mais da metade da vida do token (restam < SESSION_TTL_SECONDS / 2).
  // Com TTL de 1h (3600s), isso e no maximo uma reemissao a cada 30 min (1800s).
  if (remainingSeconds >= SESSION_TTL_SECONDS / 2) {
    return { shouldRenew: false, reason: 'NOT_IN_RENEWAL_WINDOW' };
  }

  // Teto absoluto contado desde o login original (authTime).
  const effectiveAuthTime = typeof authTime === 'number' && Number.isFinite(authTime) && authTime > 0
    ? authTime
    : (sessionExp - SESSION_TTL_SECONDS);

  if (nowSeconds - effectiveAuthTime >= SESSION_MAX_LIFETIME_SECONDS) {
    return { shouldRenew: false, reason: 'MAX_LIFETIME_EXCEEDED' };
  }

  return { shouldRenew: true };
}

export interface SessionRenewalResult {
  renewed: boolean;
  token?: string;
  cookie?: string;
  reason?: string;
}

export async function processSlidingSessionRenewal(params: {
  principal: { userId: string; companyId: string; authTime?: number; sessionExp?: number };
  jwtConfig: JwtAuthenticationConfig;
  isCookieTransport: boolean;
  reqPath?: string;
  secure: boolean;
  nowSeconds?: number;
}): Promise<SessionRenewalResult> {
  if (!params.isCookieTransport) {
    return { renewed: false, reason: 'BEARER_NOT_ELIGIBLE' };
  }

  const normalizedPath = params.reqPath?.toLowerCase() || '';
  if (normalizedPath === '/auth/logout' || normalizedPath === '/api/auth/logout') {
    return { renewed: false, reason: 'LOGOUT_ROUTE' };
  }

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const decision = evaluateSessionRenewal(
    params.principal.sessionExp,
    params.principal.authTime,
    nowSeconds
  );

  if (!decision.shouldRenew) {
    return { renewed: false, reason: decision.reason };
  }

  const authTime = typeof params.principal.authTime === 'number' && params.principal.authTime > 0
    ? params.principal.authTime
    : (params.principal.sessionExp ? params.principal.sessionExp - SESSION_TTL_SECONDS : nowSeconds);

  try {
    const renewedToken = await issueSessionToken(
      {
        userId: params.principal.userId,
        companyId: params.principal.companyId,
        authTime,
      },
      params.jwtConfig,
      SESSION_TTL_SECONDS
    );

    const cookie = buildSessionCookie(renewedToken, {
      secure: params.secure,
      maxAgeSeconds: SESSION_TTL_SECONDS,
    });

    return {
      renewed: true,
      token: renewedToken,
      cookie,
    };
  } catch (error) {
    console.warn('[SessionRenewal] Failed to issue sliding session renewal token:', error);
    return {
      renewed: false,
      reason: 'RENEWAL_FAILED',
    };
  }
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
