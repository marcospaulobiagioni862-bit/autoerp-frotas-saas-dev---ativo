import type { Express, Request, Response } from 'express';
import type { AuthenticatedPrincipal } from './auth';
import { UnitOfWork } from '../db/uow';
import { CashFlowService } from '../domain/finance/CashFlowService';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';
import { registerAdminUserRoutes } from './adminUserRoutes';
import { registerTenantProfileRoutes } from './tenantProfileRoutes';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function principal(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  console.error('AUTOERP_FINANCE_CASH_FLOW_FAILURE', error);
  res.status(400).json({ error: 'Invalid cash-flow report request' });
}

export function registerFinanceCashFlowRoutes(app: Express): void {
  // recurringRoutes is the current server route bootstrap aggregator. Register
  // the production administration slice here so it is mounted exactly once
  // without creating a second top-level bootstrap path.
  registerAdminUserRoutes(app);
  registerTenantProfileRoutes(app);

  app.get('/api/finance/reports/cash-flow', async (req: Request, res: Response) => {
    const actor = principal(req);
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const periodStart = typeof req.query.start === 'string' ? req.query.start.trim() : '';
    const periodEnd = typeof req.query.end === 'string' ? req.query.end.trim() : '';
    if (!isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd) {
      res.status(400).json({ error: 'Invalid cash-flow report parameters' });
      return;
    }

    try {
      const report = await UnitOfWork.run(actor.companyId, async (txContext) => {
        await FinancialAuthorizationService.authorize(
          actor.userId,
          actor.companyId,
          'VIEW_FINANCIAL',
          txContext
        );
        return CashFlowService.getCashFlowReport(
          actor.companyId,
          periodStart,
          periodEnd,
          txContext
        );
      });
      res.json({ report });
    } catch (error) {
      sendError(res, error);
    }
  });
}
