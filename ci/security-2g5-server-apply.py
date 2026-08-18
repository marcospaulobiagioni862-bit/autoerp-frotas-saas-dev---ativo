from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    'server.ts',
    "import { SettlementService } from './src/domain/finance/SettlementService';\n",
    "import { SettlementService } from './src/domain/finance/SettlementService';\nimport { TransferService } from './src/domain/finance/TransferService';\nimport { ReversalService } from './src/domain/finance/ReversalService';\n",
)

routes = r'''  // SECURITY-2G5: transaction history, transfers and reversals are server-authoritative.
  // Tenant and audit identity are derived exclusively from the authenticated principal.
  app.get('/api/finance/transactions', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
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

    try {
      const item = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await TransferService.transferFunds(
            {
              companyId: principal.companyId,
              sourceAccountId: req.body?.sourceAccountId,
              destinationAccountId: req.body?.destinationAccountId,
              amount: Number(req.body?.amount),
              transferDate: req.body?.transferDate,
              paymentMethodId: req.body?.paymentMethodId,
              description: typeof req.body?.description === 'string' ? req.body.description : '',
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

    try {
      const item = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await ReversalService.reverseTransaction(
            principal.companyId,
            req.params.id,
            Number(req.body?.reversalAmount),
            typeof req.body?.reason === 'string' ? req.body.reason : '',
            principal.userId,
            principal.name,
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ item });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

'''
replace_once(
    'server.ts',
    "  // SECURITY-2G4: settlement options and settlement commands are server-authoritative.\n",
    routes + "  // SECURITY-2G4: settlement options and settlement commands are server-authoritative.\n",
)
