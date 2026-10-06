import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';

// Teto de profundidade da canonicalizacao. O corpo real e raso, entao 32
// e folgado. Existe porque a canonicalizacao e RECURSIVA e rodava ANTES da
// checagem de tamanho: medido, JSON.parse do V8 aguenta 200.000 niveis de
// aninhamento (o parser dele e iterativo) enquanto a recursao estoura em
// 3.213 - e no limiar o corpo tem apenas 6.428 bytes, passando folgado
// pelo teto de 16 KB. Sem este limite, um corpo pequeno e profundo derruba
// a verificacao com RangeError antes de qualquer validacao de tamanho.
const MAX_CANONICAL_DEPTH = 32;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 1000;
const COMPANY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/;

export interface WhatsappWebhookHeaders {
  companyId: unknown;
  timestamp: unknown;
  nonce: unknown;
  signature: unknown;
}

export interface VerifiedWhatsappWebhook {
  companyId: string;
  nonce: string;
  signedAt: string;
}

export class WhatsappWebhookAuthenticationError extends Error {}
export class WhatsappWebhookReplayError extends Error {}

function requireHeader(value: unknown): string {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  }
  return value;
}

function canonicalValue(value: unknown, depth = 0): string {
  if (depth > MAX_CANONICAL_DEPTH) throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalValue(item, depth + 1)).join(',')}]`;
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item).sort().map((key) => {
      if (item[key] === undefined) throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
      return `${JSON.stringify(key)}:${canonicalValue(item[key], depth + 1)}`;
    }).join(',')}}`;
  }
  throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
}

export function canonicalizeWhatsappWebhookBody(body: unknown): string {
  const canonical = canonicalValue(body);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_BODY_BYTES) {
    throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  }
  return canonical;
}

function configuredSecret(companyId: string, rawConfig = process.env.WHATSAPP_SYNTHETIC_WEBHOOK_KEYS_JSON): string {
  if (!rawConfig) throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  }
  const secret = (parsed as Record<string, unknown>)[companyId];
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 512) {
    throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  }
  return secret;
}

function signingMaterial(companyId: string, timestamp: string, nonce: string, body: unknown): string {
  return `${companyId}.${timestamp}.${nonce}.${canonicalizeWhatsappWebhookBody(body)}`;
}

export function createWhatsappWebhookSignature(
  secret: string,
  companyId: string,
  timestamp: string,
  nonce: string,
  body: unknown,
): string {
  if (secret.length < 32) throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
  return `sha256=${createHmac('sha256', secret).update(
    signingMaterial(companyId, timestamp, nonce, body),
    'utf8',
  ).digest('hex')}`;
}

function signatureMatches(expected: string, supplied: string): boolean {
  const expectedMatch = SIGNATURE_PATTERN.exec(expected);
  const suppliedMatch = SIGNATURE_PATTERN.exec(supplied);
  if (!expectedMatch || !suppliedMatch) return false;
  const expectedBytes = Buffer.from(expectedMatch[1], 'hex');
  const suppliedBytes = Buffer.from(suppliedMatch[1], 'hex');
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export class WhatsappWebhookAuthority {
  static verify(
    headers: WhatsappWebhookHeaders,
    body: unknown,
    referenceNow = new Date(),
    rawConfig = process.env.WHATSAPP_SYNTHETIC_WEBHOOK_KEYS_JSON,
  ): VerifiedWhatsappWebhook {
    const companyId = requireHeader(headers.companyId);
    const timestamp = requireHeader(headers.timestamp);
    const nonce = requireHeader(headers.nonce);
    const signature = requireHeader(headers.signature);
    if (!COMPANY_PATTERN.test(companyId) || !NONCE_PATTERN.test(nonce)) {
      throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
    }
    const signedAtMs = Date.parse(timestamp);
    if (!Number.isFinite(signedAtMs) || new Date(signedAtMs).toISOString() !== timestamp) {
      throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
    }
    const ageMs = referenceNow.getTime() - signedAtMs;
    if (ageMs > MAX_AGE_MS || ageMs < -MAX_FUTURE_MS) {
      throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
    }
    const secret = configuredSecret(companyId, rawConfig);
    const expected = createWhatsappWebhookSignature(secret, companyId, timestamp, nonce, body);
    if (!signatureMatches(expected, signature)) {
      throw new WhatsappWebhookAuthenticationError('Invalid WhatsApp webhook');
    }
    return { companyId, nonce, signedAt: new Date(signedAtMs).toISOString() };
  }

  static async claimNonce(verified: VerifiedWhatsappWebhook): Promise<void> {
    try {
      const claimed = await UnitOfWork.run(verified.companyId, async (context) => {
        const raw = context.getRawTransaction?.();
        if (!raw) throw new Error('WhatsApp webhook persistence unavailable');
        const result = await raw.execute(sql`
          INSERT INTO whatsapp_webhook_nonces(id,company_id,nonce,signed_at)
          VALUES(${randomUUID()},${verified.companyId},${verified.nonce},${verified.signedAt})
          ON CONFLICT (company_id,nonce) DO NOTHING
          RETURNING id
        `);
        return Array.isArray(result?.rows) && result.rows.length === 1;
      });
      if (!claimed) throw new WhatsappWebhookReplayError('WhatsApp webhook replay');
    } catch (error) {
      if (error instanceof WhatsappWebhookReplayError) throw error;
      if (isUniqueViolation(error)) throw new WhatsappWebhookReplayError('WhatsApp webhook replay');
      throw error;
    }
  }
}
