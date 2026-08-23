import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { SecurityDepositLifecycleAuthority } from './securityDepositLifecycleAuthority';

const MUTATION_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'FINANCIAL', 'FINANCIAL_MANAGER']);

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requireMutationPrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const actor = principal(req);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(actor.role || '').toUpperCase();
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  if (!permissions.includes('*') && !permissions.includes('RECEIPT_REGISTER') && !permissions.includes('PAYMENT_REGISTER') && !MUTATION_ROLES.has(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return actor;
}

function text(value: unknown, label: string, max = 1000): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) throw new Error(`${label} inválido`);
  return result;
}

function optionalText(value: unknown, max = 1000): string | undefined {
  if (value == null || value === '') return undefined;
  const result = String(value).trim();
  if (!result || result.length > max) throw new Error('Texto inválido');
  return result;
}

function amount(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > 999999999.99) throw new Error('Valor inválido');
  return Math.round(result * 100) / 100;
}

function optionalDate(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  const result = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('Data inválida');
  return result;
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Security deposit operation failed';
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.includes('não encontrada') || message.includes('não encontrado')) {
    res.status(404).json({ error: message });
    return;
  }
  if (
    message.includes('excede') || message.includes('inativa') || message.includes('inativo') ||
    message.includes('inconsistente') || message.includes('reutilizada') || message.includes('fechado') ||
    message.includes('não pertence') || message.includes('não possui saldo')
  ) {
    res.status(409).json({ error: message });
    return;
  }
  if (message.includes('inválid') || message.includes('obrigatória') || message.includes('positivo')) {
    res.status(400).json({ error: message });
    return;
  }
  console.error('AUTOERP_SECURITY_DEPOSIT_LIFECYCLE_FAILURE', error);
  res.status(500).json({ error: 'Security deposit operation failed' });
}

export function registerSecurityDepositLifecycleRoutes(app: Express): void {
  app.post('/api/finance/security-deposits/return', async (req, res) => {
    const actor = requireMutationPrincipal(req, res);
    if (!actor) return;
    try {
      const result = await SecurityDepositLifecycleAuthority.returnDeposit(actor, {
        depositId: text(req.body?.depositId, 'depositId', 200),
        amount: amount(req.body?.amount),
        financialAccountId: text(req.body?.financialAccountId, 'financialAccountId', 200),
        paymentMethodId: text(req.body?.paymentMethodId, 'paymentMethodId', 200),
        transactionDate: optionalDate(req.body?.transactionDate),
        notes: optionalText(req.body?.notes),
        idempotencyKey: text(req.body?.idempotencyKey, 'idempotencyKey', 200),
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/finance/security-deposits/compensate', async (req, res) => {
    const actor = requireMutationPrincipal(req, res);
    if (!actor) return;
    try {
      const result = await SecurityDepositLifecycleAuthority.compensateDeposit(actor, {
        depositId: text(req.body?.depositId, 'depositId', 200),
        receivableId: text(req.body?.receivableId, 'receivableId', 200),
        amount: amount(req.body?.amount),
        notes: optionalText(req.body?.notes),
        idempotencyKey: text(req.body?.idempotencyKey, 'idempotencyKey', 200),
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}
