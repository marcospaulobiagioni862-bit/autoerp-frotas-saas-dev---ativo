import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import {
  FinanceOverdueAuthority,
  type LateChargeRuleInput,
  type OverdueActor,
  type OverdueObligationType,
  type OverdueProcessType,
} from './financeOverdueAuthority';

class FinanceOverdueValidationError extends Error {}

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requirePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  const actor = principal(req);
  if (!actor) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  return actor;
}

function actorFrom(principalItem: AuthenticatedPrincipal): OverdueActor {
  return {
    companyId: principalItem.companyId,
    userId: principalItem.userId,
    name: principalItem.name,
  };
}

function obligationType(value: unknown): OverdueObligationType {
  if (value === 'RECEIVABLE' || value === 'PAYABLE') return value;
  throw new FinanceOverdueValidationError();
}

function processType(value: unknown): OverdueProcessType {
  if (value === 'RECEIVABLE' || value === 'PAYABLE' || value === 'BOTH') return value;
  throw new FinanceOverdueValidationError();
}

function processingDate(value: unknown): string {
  try {
    return FinanceOverdueAuthority.normalizeProcessingDate(value);
  } catch {
    throw new FinanceOverdueValidationError();
  }
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new FinanceOverdueValidationError();
  return parsed;
}

function hasOnlyKeys(body: unknown, allowed: Set<string>): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return Object.keys(body as Record<string, unknown>).every((key) => allowed.has(key));
}

export function parseOverdueProcessRequest(body: unknown): {
  type: OverdueProcessType;
  processingDate: string;
} {
  const allowed = new Set(['type', 'processingDate']);
  if (!hasOnlyKeys(body, allowed)) throw new FinanceOverdueValidationError();
  const input = body as Record<string, unknown>;
  return {
    type: processType(input.type),
    processingDate: processingDate(input.processingDate),
  };
}

export function parseLateChargeRuleRequest(body: unknown): LateChargeRuleInput {
  const allowed = new Set(['gracePeriodDays', 'finePercent', 'dailyInterestPercent', 'active']);
  if (!hasOnlyKeys(body, allowed)) throw new FinanceOverdueValidationError();
  const input = body as Record<string, unknown>;
  const gracePeriodDays = finiteNumber(input.gracePeriodDays);
  if (!Number.isInteger(gracePeriodDays)) throw new FinanceOverdueValidationError();
  if (typeof input.active !== 'boolean') throw new FinanceOverdueValidationError();
  return {
    gracePeriodDays,
    finePercent: finiteNumber(input.finePercent),
    dailyInterestPercent: finiteNumber(input.dailyInterestPercent),
    active: input.active,
  };
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof FinanceOverdueValidationError) {
    res.status(400).json({ error: 'Invalid overdue finance request' });
    return;
  }
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.includes('Regra autoritativa de encargos por atraso')) {
    res.status(409).json({ error: 'Late-charge rule unavailable' });
    return;
  }
  if (message.includes('período financeiro') || message.includes('Período financeiro')) {
    res.status(409).json({ error: 'Finance period conflict' });
    return;
  }
  if (message.includes('inválid') || message.includes('obrigatór')) {
    res.status(400).json({ error: 'Invalid overdue finance request' });
    return;
  }
  console.error('AUTOERP_FINANCE_OVERDUE_API_FAILURE', error);
  res.status(500).json({ error: 'Overdue finance operation failed' });
}

export function registerFinanceOverdueRoutes(app: Express): void {
  app.get('/api/finance/late-charge-rules', async (req, res) => {
    const principalItem = requirePrincipal(req, res);
    if (!principalItem) return;
    try {
      res.json({ items: await FinanceOverdueAuthority.listRules(actorFrom(principalItem)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/finance/late-charge-rules/:type', async (req, res) => {
    const principalItem = requirePrincipal(req, res);
    if (!principalItem) return;
    try {
      const item = await FinanceOverdueAuthority.upsertRule(
        actorFrom(principalItem),
        obligationType(req.params.type),
        parseLateChargeRuleRequest(req.body)
      );
      res.json({ item });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/finance/overdue/process', async (req, res) => {
    const principalItem = requirePrincipal(req, res);
    if (!principalItem) return;
    try {
      // The parser intentionally accepts only type + processingDate. companyId,
      // grace/rate fields and user identity can never be supplied by the client.
      const command = parseOverdueProcessRequest(req.body);
      const results = await FinanceOverdueAuthority.process(
        actorFrom(principalItem),
        command.type,
        command.processingDate
      );
      res.json({ results });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/finance/overdue/delinquency', async (req, res) => {
    const principalItem = requirePrincipal(req, res);
    if (!principalItem) return;
    try {
      const items = await FinanceOverdueAuthority.getDelinquentReceivables(
        actorFrom(principalItem),
        processingDate(req.query.processingDate)
      );
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/finance/overdue/aging', async (req, res) => {
    const principalItem = requirePrincipal(req, res);
    if (!principalItem) return;
    try {
      const report = await FinanceOverdueAuthority.getAgingReport(
        actorFrom(principalItem),
        obligationType(req.query.type),
        processingDate(req.query.processingDate)
      );
      res.json({ report });
    } catch (error) {
      sendError(res, error);
    }
  });
}
