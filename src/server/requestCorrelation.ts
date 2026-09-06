import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
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

  next();
}
