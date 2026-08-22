import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { FinanceOverdueAuthority, type OverdueObligationType } from './financeOverdueAuthority';

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

function processingDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Invalid overdue processing date');
  return text;
}

function obligationType(value: unknown): OverdueObligationType {
  if (value === 'RECEIVABLE' || value === 'PAYABLE') return value;
  throw new Error('Invalid overdue obligation type');
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.includes('período financeiro') || message.includes('Período financeiro')) {
    res.status(409).json({ error: 'Finance period conflict' });
    return;
  }
  if (message.includes('Regra autoritativa')) {
    res.status(409).json({ error: 'Late-charge rule unavailable' });
    return;
  }
  res.status(400).json({ error: 'Invalid overdue command' });
}

export function registerFinanceOverdueRoutes(app: Express): void {
  app.get('/api/finance/late-charge-rule', async (req, res) => {
    const actor = requirePrincipal(req, res);
    if (!actor) return;
    try {
      res.json({ rule: await FinanceOverdueAuthority.getRule(actor.companyId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/finance/overdue/process', async (req, res) => {
    const actor = requirePrincipal(req, res);
    if (!actor) return;
    try {
      const result = await FinanceOverdueAuthority.process(
        { companyId: actor.companyId, userId: actor.userId, name: actor.name },
        obligationType(req.body?.type),
        processingDate(req.body?.processingDate)
      );
      res.json({ result });
    } catch (error) {
      sendError(res, error);
    }
  });
}
