import type { Express, Request, Response } from 'express';
import { UnitOfWork } from '../db/uow';
import { AccountingRegime } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { FinanceEngine } from '../domain/finance/FinanceEngine';
import { ReceivableService } from '../domain/finance/ReceivableService';
import { PayableService } from '../domain/finance/PayableService';
import { SettlementService } from '../domain/finance/SettlementService';
import { TransferService } from '../domain/finance/TransferService';
import { ReversalService } from '../domain/finance/ReversalService';
import { RenegotiationService } from '../domain/finance/RenegotiationService';
import { isRenegotiationInstallmentFrequency } from '../shared/utils/renegotiationSchedule';
import { DREService } from '../domain/finance/DREService';
import { ProfitabilityService } from '../domain/finance/ProfitabilityService';
import { DepositService } from '../domain/finance/DepositService';
import { FinancialPeriodService } from '../domain/finance/FinancialPeriodService';
import { FinancialAuthorizationService } from '../domain/finance/FinancialAuthorizationService';

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function requireFinancePrincipal(req: Request, res: Response, requiredPermission?: string): AuthenticatedPrincipal | null {
  const principal = principalFrom(req);
  if (!principal?.userId || !principal?.companyId) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  const role = String(principal.role || '').toUpperCase();
  const permissions = Array.isArray(principal.permissions) ? principal.permissions : [];

  if (role === 'ADMIN' || permissions.includes('*')) return principal;

  if (requiredPermission) {
    if (!FinancialAuthorizationService.matchesPermission(permissions, requiredPermission)) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
  }

  return principal;
}

function sendFinanceCommandError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';

  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.startsWith('Quite primeiro a parcela ')) {
    res.status(409).json({ error: message, code: 'PAYABLE_INSTALLMENT_ORDER' });
    return;
  }
  if (message.includes('não encontrada') || message.includes('não encontrado')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (
    message.includes('já se encontra') ||
    message.includes('Não é possível cancelar') ||
    message.includes('Chave de idempotência reutilizada') ||
    message.includes('período financeiro') ||
    message.includes('Período')
  ) {
    res.status(409).json({ error: 'Finance command conflict' });
    return;
  }

  res.status(400).json({ error: 'Invalid finance command' });
}

export function registerFinanceRoutes(app: Express): void {
  FinanceEngine.uowRunner = UnitOfWork.run;

  // SECURITY-2G7A: finance overview is server-authoritative and tenant-scoped.
  app.get('/api/finance/overview', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'VIEW_FINANCE');
    if (!principal) return;

    try {
      const summary = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const accountRepo = txContext.getAccountRepo();
        if (!accountRepo.findAll) {
          throw new Error('Financial account listing is unavailable');
        }

        const receivables = await txContext.getReceivableRepo().findAll();
        const payables = await txContext.getPayableRepo().findAll();
        const accounts = await accountRepo.findAll();

        const totalReceivable = receivables
          .filter((item) => item.status === 'PENDING' || item.status === 'PARTIALLY_PAID')
          .reduce((sum, item) => sum + Number(item.balanceAmount || 0), 0);

        const totalPayable = payables
          .filter((item) => item.status === 'PENDING' || item.status === 'PARTIALLY_PAID')
          .reduce((sum, item) => sum + Number(item.balanceAmount || 0), 0);

        const totalBalance = accounts
          .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0);

        return { totalReceivable, totalPayable, totalBalance };
      });

      res.json(summary);
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G7B1: DRE is server-authoritative and tenant-scoped.
  app.get('/api/finance/reports/dre', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'VIEW_FINANCE');
    if (!principal) return;

    const periodStart = typeof req.query.start === 'string' ? req.query.start : '';
    const periodEnd = typeof req.query.end === 'string' ? req.query.end : '';
    const regime = req.query.regime === AccountingRegime.CASH
      ? AccountingRegime.CASH
      : req.query.regime === AccountingRegime.ACCRUAL
        ? AccountingRegime.ACCRUAL
        : null;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(periodStart) || !datePattern.test(periodEnd) || periodStart > periodEnd || !regime) {
      res.status(400).json({ error: 'Invalid DRE report parameters' });
      return;
    }

    try {
      const report = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await DREService.getDREReport(
          principal.companyId,
          periodStart,
          periodEnd,
          regime,
          txContext
        )
      );
      res.json({ report });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G7B2: vehicle profitability financial values are server-authoritative.
  app.get('/api/finance/reports/vehicle-profitability', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'VIEW_FINANCE');
    if (!principal) return;

    const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId.trim() : '';
    const periodStart = typeof req.query.start === 'string' ? req.query.start : '';
    const periodEnd = typeof req.query.end === 'string' ? req.query.end : '';
    const regime = req.query.regime === AccountingRegime.CASH
      ? AccountingRegime.CASH
      : req.query.regime === AccountingRegime.ACCRUAL
        ? AccountingRegime.ACCRUAL
        : null;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!vehicleId || !datePattern.test(periodStart) || !datePattern.test(periodEnd) || periodStart > periodEnd || !regime) {
      res.status(400).json({ error: 'Invalid vehicle profitability parameters' });
      return;
    }

    try {
      const report = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await ProfitabilityService.getVehicleProfitability(
          principal.companyId,
          vehicleId,
          periodStart,
          periodEnd,
          regime,
          txContext
        )
      );
      res.json({ report });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // FINANCE-R15: financial-period administration uses the same PostgreSQL
  // source and advisory-lock boundary enforced by money-moving commands.
  app.get('/api/finance/periods', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) => {
        await FinancialAuthorizationService.authorize(
          principal.userId,
          principal.companyId,
          'VIEW_FINANCIAL',
          txContext
        );
        return FinancialPeriodService.getPeriods(principal.companyId, txContext);
      });
      res.json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/periods/close', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const startDate = typeof req.body?.startDate === 'string' ? req.body.startDate.trim() : '';
    const endDate = typeof req.body?.endDate === 'string' ? req.body.endDate.trim() : '';
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) {
      res.status(400).json({ error: 'Invalid financial period close request' });
      return;
    }

    try {
      const item = await UnitOfWork.run(
        principal.companyId,
        async (txContext) => FinancialPeriodService.closePeriod(
          {
            companyId: principal.companyId,
            startDate,
            endDate,
            userId: principal.userId,
            userName: principal.name,
          },
          txContext
        ),
        { financialPeriodLock: 'EXCLUSIVE' }
      );
      res.status(201).json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/periods/:id/reopen', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const periodId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!periodId || !reason || reason.length > 1000) {
      res.status(400).json({ error: 'Invalid financial period reopen request' });
      return;
    }

    try {
      const item = await UnitOfWork.run(
        principal.companyId,
        async (txContext) => FinancialPeriodService.reopenPeriod(
          {
            companyId: principal.companyId,
            periodId,
            reason,
            userId: principal.userId,
            userName: principal.name,
          },
          txContext
        ),
        { financialPeriodLock: 'EXCLUSIVE' }
      );
      res.json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G8: security-deposit read/receipt are server-authoritative.
  app.get('/api/finance/security-deposits/by-contract/:contractId', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;
    const contractId = typeof req.params.contractId === 'string' ? req.params.contractId.trim() : '';
    if (!contractId) {
      res.status(400).json({ error: 'Invalid security deposit request' });
      return;
    }

    try {
      const deposit = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await DepositService.getSecurityDepositByContract(
          principal.companyId,
          contractId,
          principal.userId,
          txContext
        )
      );
      res.json({ deposit });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/security-deposits/receive', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
    const amount = Number(req.body?.amount);
    const financialAccountId = typeof req.body?.financialAccountId === 'string' ? req.body.financialAccountId.trim() : '';
    const paymentMethodId = typeof req.body?.paymentMethodId === 'string' ? req.body.paymentMethodId.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';

    if (!contractId || !Number.isFinite(amount) || amount <= 0 || !financialAccountId || !paymentMethodId || !idempotencyKey || idempotencyKey.length > 200) {
      res.status(400).json({ error: 'Invalid security deposit request' });
      return;
    }

    try {
      const result = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const contract = await txContext.getContractRepo().findById(contractId);
        if (!contract) throw new Error('Contrato não encontrado');

        return await DepositService.receiveSecurityDeposit(
          principal.companyId,
          contract.id,
          contract.driverId,
          contract.vehicleId,
          amount,
          financialAccountId,
          paymentMethodId,
          principal.userId,
          principal.name,
          txContext,
          idempotencyKey
        );
      });
      res.status(201).json(result);
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G6: receivable renegotiation is server-authoritative.
  app.post('/api/finance/receivables/renegotiate', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const obligationIds = Array.isArray(req.body?.obligationIds)
      ? req.body.obligationIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const newTotalAmount = Number(req.body?.newTotalAmount);
    const installmentsCount = Number(req.body?.installmentsCount);
    const firstDueDate = typeof req.body?.firstDueDate === 'string' ? req.body.firstDueDate : '';
    const rawInstallmentFrequency = req.body?.installmentFrequency;
    const installmentFrequency = rawInstallmentFrequency === undefined || rawInstallmentFrequency === null || rawInstallmentFrequency === ''
      ? 'MONTHLY'
      : isRenegotiationInstallmentFrequency(rawInstallmentFrequency)
        ? rawInstallmentFrequency
        : null;
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : '';
    const description = typeof req.body?.description === 'string' ? req.body.description : '';

    if (
      obligationIds.length === 0 ||
      !Number.isFinite(newTotalAmount) ||
      newTotalAmount < 0 ||
      !Number.isInteger(installmentsCount) ||
      installmentsCount < 1 ||
      installmentsCount > 24 ||
      !firstDueDate ||
      !categoryId ||
      installmentFrequency === null
    ) {
      res.status(400).json({ error: 'Payload de renegociação inválido' });
      return;
    }

    try {
      const items = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await RenegotiationService.renegociate(
            {
              companyId: principal.companyId,
              obligationIds,
              type: 'RECEIVABLE',
              newTotalAmount,
              installmentsCount,
              firstDueDate,
              installmentFrequency,
              categoryId,
              description,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G5: transaction history, transfers and reversals are server-authoritative.
  // Tenant and audit identity are derived exclusively from the authenticated principal.
  app.get('/api/finance/transactions', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'VIEW_FINANCE');
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await txContext.getTransactionRepo().findAll({ companyId: principal.companyId })
      );
      res.json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/transfers', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const sourceAccountId = typeof req.body?.sourceAccountId === 'string' ? req.body.sourceAccountId.trim() : '';
    const destinationAccountId = typeof req.body?.destinationAccountId === 'string' ? req.body.destinationAccountId.trim() : '';
    const amount = Number(req.body?.amount);
    const transferDate = typeof req.body?.transferDate === 'string' ? req.body.transferDate.trim() : '';
    const paymentMethodId = typeof req.body?.paymentMethodId === 'string' ? req.body.paymentMethodId.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';

    if (
      !sourceAccountId ||
      !destinationAccountId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !transferDate ||
      !paymentMethodId ||
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      description.length > 1000
    ) {
      res.status(400).json({ error: 'Invalid financial transfer request' });
      return;
    }

    try {
      const item = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await TransferService.transferFunds(
            {
              companyId: principal.companyId,
              sourceAccountId,
              destinationAccountId,
              amount,
              transferDate,
              paymentMethodId,
              description,
              idempotencyKey,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/transactions/:id/reverse', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const transactionId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const reversalAmount = Number(req.body?.reversalAmount);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (
      !transactionId ||
      !Number.isFinite(reversalAmount) ||
      reversalAmount <= 0 ||
      !reason ||
      reason.length > 1000 ||
      !idempotencyKey ||
      idempotencyKey.length > 200
    ) {
      res.status(400).json({ error: 'Invalid financial reversal request' });
      return;
    }

    try {
      const item = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await ReversalService.reverseTransaction(
            principal.companyId,
            transactionId,
            reversalAmount,
            reason,
            principal.userId,
            principal.name,
            txContext,
            idempotencyKey
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G4: settlement options and settlement commands are server-authoritative.
  // Tenant and audit identity are derived exclusively from the authenticated principal.
  app.get('/api/finance/settlement-options', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const options = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const accountRepo = txContext.getAccountRepo();
        const paymentMethodRepo = txContext.getPaymentMethodRepo?.();
        if (!accountRepo.findAll || !paymentMethodRepo) {
          throw new Error('Settlement repositories unavailable');
        }
        const accounts = await accountRepo.findAll();
        const paymentMethods = await paymentMethodRepo.findAll();
        return {
          accounts: accounts.filter((item: any) => item.status === 'ACTIVE'),
          paymentMethods: paymentMethods.filter((item: any) => item.active !== false),
        };
      });
      res.json(options);
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.get('/api/finance/receivables/:id/daily-interest-quote', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const effectiveDate = typeof req.query.date === 'string' ? req.query.date : '';
    const dailyInterestAmount = typeof req.query.daily === 'string' ? Number(req.query.daily) : NaN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(dailyInterestAmount) || dailyInterestAmount < 0) {
      res.status(400).json({ error: 'Invalid daily interest quote request' });
      return;
    }

    try {
      const quote = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await SettlementService.quoteReceiptDailyInterest(
          principal.companyId,
          req.params.id,
          effectiveDate,
          dailyInterestAmount,
          txContext
        )
      );
      res.json({ quote });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/receivables/:id/receipt', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const result = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await SettlementService.registerReceipt(
            {
              companyId: principal.companyId,
              obligationId: req.params.id,
              financialAccountId: req.body?.financialAccountId,
              paymentMethodId: req.body?.paymentMethodId,
              paymentAmount: Number(req.body?.paymentAmount),
              dailyInterestAmount: req.body?.dailyInterestAmount === undefined ? undefined : Number(req.body.dailyInterestAmount),
              settleRemainingBalance: req.body?.settleRemainingBalance,
              interestAmount: req.body?.interestAmount === undefined ? undefined : Number(req.body.interestAmount),
              additionalAmount: req.body?.additionalAmount === undefined ? undefined : Number(req.body.additionalAmount),
              fineAmount: req.body?.fineAmount === undefined ? undefined : Number(req.body.fineAmount),
              discountAmount: req.body?.discountAmount === undefined ? undefined : Number(req.body.discountAmount),
              paymentDate: req.body?.paymentDate,
              description: req.body?.description,
              idempotencyKey: typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '',
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item: result.receivable, transaction: result.transaction });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/payables/:id/payment', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const result = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await SettlementService.registerPayment(
            {
              companyId: principal.companyId,
              obligationId: req.params.id,
              financialAccountId: req.body?.financialAccountId,
              paymentMethodId: req.body?.paymentMethodId,
              paymentAmount: Number(req.body?.paymentAmount),
              dailyInterestAmount: req.body?.dailyInterestAmount === undefined ? undefined : Number(req.body.dailyInterestAmount),
              settleRemainingBalance: req.body?.settleRemainingBalance,
              interestAmount: req.body?.interestAmount === undefined ? undefined : Number(req.body.interestAmount),
              additionalAmount: req.body?.additionalAmount === undefined ? undefined : Number(req.body.additionalAmount),
              fineAmount: req.body?.fineAmount === undefined ? undefined : Number(req.body.fineAmount),
              discountAmount: req.body?.discountAmount === undefined ? undefined : Number(req.body.discountAmount),
              paymentDate: req.body?.paymentDate,
              description: req.body?.description,
              idempotencyKey: typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '',
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item: result.payable, transaction: result.transaction });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G3: authenticated finance obligation reads use the same
  // UnitOfWork/RLS tenant boundary as the command endpoints.
  app.get('/api/finance/receivables', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'VIEW_FINANCE');
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await txContext.getReceivableRepo().findAll()
      );
      res.json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.get('/api/finance/payables', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'VIEW_FINANCE');
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await txContext.getPayableRepo().findAll()
      );
      res.json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  // SECURITY-2G2: finance obligation commands cross the server trust boundary.
  // Tenant and audit identity come only from the authenticated principal; client
  // supplied companyId/userId/userName fields are intentionally not consumed.
  app.post('/api/finance/receivables', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'RECEIVABLE_MUTATE');
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await ReceivableService.create(
            {
              companyId: principal.companyId,
              originType: req.body?.originType,
              originId: req.body?.originId,
              vehicleId: req.body?.vehicleId,
              driverId: req.body?.driverId,
              contractId: req.body?.contractId,
              categoryId: req.body?.categoryId,
              description: req.body?.description,
              totalAmount: req.body?.totalAmount,
              dueDate: req.body?.dueDate,
              competenceDate: req.body?.competenceDate,
              competenceMode: req.body?.competenceMode,
              installmentCompetenceDates: req.body?.installmentCompetenceDates,
              installmentsCount: req.body?.installmentsCount,
              recurrenceDaysInterval: req.body?.recurrenceDaysInterval,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/receivables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'RECEIVABLE_MUTATE');
    if (!principal) return;

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 1000) {
      res.status(400).json({ error: 'Invalid receivable cancellation request' });
      return;
    }

    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await ReceivableService.cancelReceivable(
          principal.companyId,
          req.params.id,
          typeof req.body?.reason === 'string' ? req.body.reason : '',
          principal.userId,
          principal.name,
          txContext
        )
      );
      res.json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/payables', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'PAYABLE_MUTATE');
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await PayableService.create(
            {
              companyId: principal.companyId,
              originType: req.body?.originType,
              originId: req.body?.originId,
              vehicleId: req.body?.vehicleId,
              supplierId: req.body?.supplierId,
              driverId: req.body?.driverId,
              contractId: req.body?.contractId,
              categoryId: req.body?.categoryId,
              description: req.body?.description,
              totalAmount: req.body?.totalAmount,
              dueDate: req.body?.dueDate,
              competenceDate: req.body?.competenceDate,
              competenceMode: req.body?.competenceMode,
              installmentCompetenceDates: req.body?.installmentCompetenceDates,
              installmentsCount: req.body?.installmentsCount,
              recurrenceDaysInterval: req.body?.recurrenceDaysInterval,
              idempotencyKey: req.body?.idempotencyKey,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/payables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res, 'PAYABLE_MUTATE');
    if (!principal) return;

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 1000) {
      res.status(400).json({ error: 'Invalid payable cancellation request' });
      return;
    }

    try {
      const item = await UnitOfWork.run(principal.companyId, async (txContext) =>
        await PayableService.cancelPayable(
          principal.companyId,
          req.params.id,
          typeof req.body?.reason === 'string' ? req.body.reason : '',
          principal.userId,
          principal.name,
          txContext
        )
      );
      res.json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });
}
