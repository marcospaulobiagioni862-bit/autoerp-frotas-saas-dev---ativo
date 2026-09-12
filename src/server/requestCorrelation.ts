import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const IDEMPOTENCY_TTL_MS = 60_000;

type Replay = { status: number; body: unknown };
type IdempotencyEntry = {
  expiresAt: number;
  settled: boolean;
  replay?: Replay;
  waiters: Array<(replay: Replay | null) => void>;
};

const idempotencyEntries = new Map<string, IdempotencyEntry>();

export function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
}

function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return IDEMPOTENCY_KEY_PATTERN.test(candidate) ? candidate : null;
}

function protectedContractMutation(req: Request): boolean {
  if (req.method !== 'POST') return false;
  const path = req.path;
  return path === '/api/contracts' ||
    path === '/api/contract-templates' ||
    /^\/api\/contract-templates\/[^/]+\/versions$/.test(path) ||
    /^\/api\/contracts\/[^/]+\/(generate-pdf|generate-docx|generate-pdf-from-docx)$/.test(path);
}

function cleanupIdempotencyEntries(now: number): void {
  for (const [key, entry] of idempotencyEntries) {
    if (entry.expiresAt <= now && entry.settled) idempotencyEntries.delete(key);
  }
}

function replayResponse(res: Response, replay: Replay): void {
  res.status(replay.status).json(replay.body);
}

export function requestCorrelationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = normalizeRequestId(req.headers['x-request-id']) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    if (res.statusCode >= 500) {
      console.error('AUTOERP_HTTP_5XX', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
      });
    }
  });

  if (!protectedContractMutation(req)) {
    next();
    return;
  }

  const idempotencyKey = normalizeIdempotencyKey(req.headers['x-idempotency-key']);
  if (!idempotencyKey) {
    next();
    return;
  }

  const now = Date.now();
  cleanupIdempotencyEntries(now);
  const registryKey = `${req.method}:${req.path}:${idempotencyKey}`;
  const existing = idempotencyEntries.get(registryKey);
  if (existing) {
    existing.expiresAt = now + IDEMPOTENCY_TTL_MS;
    if (existing.settled && existing.replay) {
      replayResponse(res, existing.replay);
      return;
    }
    void new Promise<Replay | null>((resolve) => existing.waiters.push(resolve)).then((replay) => {
      if (!replay) {
        res.status(409).json({ error: 'Idempotent request could not be replayed' });
        return;
      }
      replayResponse(res, replay);
    });
    return;
  }

  const entry: IdempotencyEntry = {
    expiresAt: now + IDEMPOTENCY_TTL_MS,
    settled: false,
    waiters: [],
  };
  idempotencyEntries.set(registryKey, entry);

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const replay = { status: res.statusCode, body };
    entry.settled = true;
    entry.replay = replay;
    entry.expiresAt = Date.now() + IDEMPOTENCY_TTL_MS;
    for (const waiter of entry.waiters.splice(0)) waiter(replay);
    if (res.statusCode >= 500) idempotencyEntries.delete(registryKey);
    return originalJson(body);
  }) as Response['json'];

  res.on('close', () => {
    if (entry.settled) return;
    idempotencyEntries.delete(registryKey);
    for (const waiter of entry.waiters.splice(0)) waiter(null);
  });

  next();
}
