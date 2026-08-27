import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { UnitOfWork } from '../db/uow';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';

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

function cleanId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  console.error('AUTOERP_FINANCE_OBLIGATION_HISTORY_FAILURE', error);
  res.status(500).json({ error: 'Finance obligation history failed' });
}

export function registerFinanceObligationHistoryRoutes(app: Express): void {
  app.get('/api/finance/transactions/by-obligation', async (req, res) => {
    const actor = requirePrincipal(req, res);
    if (!actor) return;

    const receivableId = cleanId(req.query.receivableId);
    const payableId = cleanId(req.query.payableId);
    if ((receivableId ? 1 : 0) + (payableId ? 1 : 0) !== 1) {
      res.status(400).json({ error: 'Exactly one obligation id is required' });
      return;
    }

    try {
      const items = await UnitOfWork.run(actor.companyId, async (txContext: any) => {
        await FinancialAuthorizationService.authorize(actor.userId, actor.companyId, 'VIEW_FINANCIAL', txContext);
        const repo = txContext.getTransactionRepo();
        const rows = receivableId
          ? await repo.findByReceivableId(receivableId)
          : await repo.findByPayableId(payableId);
        return rows.filter((item: any) => item.companyId === actor.companyId);
      });
      res.json({ items });
    } catch (error) {
      sendError(res, error);
    }
  });
}
