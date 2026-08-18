import { FinanceEngine } from './src/domain/finance/FinanceEngine';
import { ReceivableService } from './src/domain/finance/ReceivableService';
import { PayableService } from './src/domain/finance/PayableService';
import { SettlementService } from './src/domain/finance/SettlementService';
import { TransferService } from './src/domain/finance/TransferService';
import { ReversalService } from './src/domain/finance/ReversalService';
import { UnitOfWork } from './src/db/uow';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db } from './src/db/index';
import { companies, users } from './src/db/schema';
import { PostgresAuthCredentialRepository } from './src/db/repositories/postgresAuthRepository';
import { and, eq, sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import {
  authenticateBearerPrincipal,
  authenticateTokenPrincipal,
  AuthenticatedPrincipal,
  JwtAuthenticationConfig,
} from './src/server/auth';
import {
  assertBootstrapRuntimeConfiguration,
  BootstrapInputError,
  BootstrapUnavailableError,
  executeAuthorizedBootstrap,
} from './src/server/bootstrap';
import {
  authenticatePasswordLogin,
  InvalidLoginError,
} from './src/server/login';
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  extractSessionTokenFromCookie,
  issueSessionToken,
  SESSION_TTL_SECONDS,
} from './src/server/session';

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}

function getJwtConfig(): JwtAuthenticationConfig {
  return {
    secret: process.env.JWT_SECRET || '',
    issuer: process.env.JWT_ISSUER || '',
    audience: process.env.JWT_AUDIENCE || '',
  };
}

function isSecureCookieRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

function requireFinancePrincipal(req: Request, res: Response): AuthenticatedPrincipal | null {
  if (!req.principal) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return null;
  }
  return req.principal;
}

function sendFinanceCommandError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : '';

  if (message.startsWith('Acesso negado:')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (message.includes('não encontrada') || message.includes('não encontrado')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (
    message.includes('já se encontra') ||
    message.includes('Não é possível cancelar') ||
    message.includes('período financeiro') ||
    message.includes('Período')
  ) {
    res.status(409).json({ error: 'Finance command conflict' });
    return;
  }

  res.status(400).json({ error: 'Invalid finance command' });
}

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOW_MOCK_AUTH === 'true') {
      throw new Error('FATAL: ALLOW_MOCK_AUTH cannot be true in production environment.');
    }
    if (!process.env.JWT_SECRET || !process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE) {
      throw new Error('FATAL: Production environment requires valid JWT_SECRET, JWT_ISSUER, and JWT_AUDIENCE.');
    }
    assertBootstrapRuntimeConfiguration(process.env.AUTOERP_BOOTSTRAP_TOKEN, true);
  }

  // Inject UOW for real ACID transactions in production
  FinanceEngine.uowRunner = UnitOfWork.run;

  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // One-time first-admin credential provisioning. Disabled unless a strong
  // server-only bootstrap secret is explicitly configured. The endpoint never
  // creates a session; normal login is required after provisioning.
  app.post('/api/auth/bootstrap', async (req: Request, res: Response) => {
    try {
      const providedToken = typeof req.headers['x-autoerp-bootstrap-token'] === 'string'
        ? req.headers['x-autoerp-bootstrap-token']
        : undefined;

      const provisioned = await executeAuthorizedBootstrap(
        {
          companyId: req.body?.companyId,
          userId: req.body?.userId,
          companyDocument: req.body?.companyDocument,
          email: req.body?.email,
          password: req.body?.password,
        },
        providedToken,
        process.env.AUTOERP_BOOTSTRAP_TOKEN,
        async (prepared) =>
          await db.transaction(async (tx) => {
            const companyRows = await tx
              .select()
              .from(companies)
              .where(
                and(
                  eq(companies.id, prepared.companyId),
                  eq(companies.status, 'ACTIVE')
                )
              )
              .limit(1);

            const company = companyRows[0];
            if (!company) {
              throw new BootstrapUnavailableError();
            }

            await tx.execute(
              sql`SELECT set_config('app.current_tenant', ${prepared.companyId}, true)`
            );

            const userRows = await tx
              .select()
              .from(users)
              .where(
                and(
                  eq(users.id, prepared.userId),
                  eq(users.companyId, prepared.companyId),
                  eq(users.active, true),
                  eq(users.role, 'ADMIN')
                )
              )
              .limit(1);

            const user = userRows[0];
            if (!user) {
              throw new BootstrapUnavailableError();
            }

            const credentialRepo = new PostgresAuthCredentialRepository(tx);
            const existingCredential = await credentialRepo.findByUserId(
              prepared.companyId,
              prepared.userId
            );
            if (existingCredential) {
              throw new BootstrapUnavailableError();
            }

            const now = new Date().toISOString();
            await tx
              .update(companies)
              .set({
                document: prepared.companyDocument,
                updatedAt: now,
              })
              .where(eq(companies.id, prepared.companyId));

            await tx
              .update(users)
              .set({
                email: prepared.email,
                updatedAt: now,
              })
              .where(
                and(
                  eq(users.id, prepared.userId),
                  eq(users.companyId, prepared.companyId)
                )
              );

            await credentialRepo.setPasswordHash({
              companyId: prepared.companyId,
              userId: prepared.userId,
              passwordHash: prepared.passwordHash,
            });

            return {
              userId: prepared.userId,
              companyId: prepared.companyId,
              email: prepared.email,
            };
          })
      );

      res.status(201).json({ user: provisioned });
    } catch (error) {
      if (error instanceof BootstrapUnavailableError) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (error instanceof BootstrapInputError) {
        res.status(400).json({ error: 'Invalid bootstrap request' });
        return;
      }

      console.error('AUTOERP_BOOTSTRAP_FAILURE', error);
      res.status(409).json({ error: 'Bootstrap unavailable' });
    }
  });

  // Login must be reachable before the protected /api middleware. Tenant is
  // resolved from the company document first; users and credentials are read
  // only after app.current_tenant has been established in a transaction.
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const principal = await authenticatePasswordLogin(
        {
          companyDocument: req.body?.companyDocument,
          email: req.body?.email,
          password: req.body?.password,
        },
        async ({ companyDocument, email }) => {
          const companyRows = await db
            .select()
            .from(companies)
            .where(
              and(
                eq(companies.document, companyDocument),
                eq(companies.status, 'ACTIVE')
              )
            )
            .limit(1);

          const company = companyRows[0];
          if (!company) {
            return null;
          }

          return await db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT set_config('app.current_tenant', ${company.id}, true)`
            );

            const userRows = await tx
              .select()
              .from(users)
              .where(
                and(
                  eq(users.companyId, company.id),
                  sql`lower(${users.email}) = ${email}`
                )
              )
              .limit(1);

            const user = userRows[0];
            if (!user) {
              return null;
            }

            const credentialRepo = new PostgresAuthCredentialRepository(tx);
            const credential = await credentialRepo.findByUserId(company.id, user.id);

            return {
              user,
              passwordHash: credential?.passwordHash || null,
            };
          });
        }
      );

      const sessionToken = await issueSessionToken(principal, getJwtConfig());
      res.setHeader(
        'Set-Cookie',
        buildSessionCookie(sessionToken, {
          secure: isSecureCookieRuntime(),
          maxAgeSeconds: SESSION_TTL_SECONDS,
        })
      );
      res.json({
        user: principal,
        expiresInSeconds: SESSION_TTL_SECONDS,
      });
    } catch (error) {
      if (!(error instanceof InvalidLoginError)) {
        console.error('AUTOERP_LOGIN_FAILURE', error);
      }
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  // Logout is idempotent and does not need to reveal whether a session existed.
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', buildExpiredSessionCookie(isSecureCookieRuntime()));
    res.status(204).end();
  });

  // Middleware for injecting tenant context securely
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production' && (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_AUTH === 'true')) {
      const tenantId = req.headers['x-company-id'] as string;
      const userId = req.headers['x-user-id'] as string || 'test-user-1';
      if (tenantId) {
        req.principal = {
          companyId: tenantId,
          userId,
          name: 'Test User',
          role: 'ADMIN',
          permissions: ['*'],
        };
      }
      return next();
    }

    try {
      const jwtConfig = getJwtConfig();
      const sessionToken = extractSessionTokenFromCookie(
        typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined
      );

      const findCurrentUser = async (userId: string, verifiedCompanyId: string) =>
        await UnitOfWork.run(verifiedCompanyId, async (transactionContext) =>
          await transactionContext.getUserRepo().findById(userId)
        );

      if (sessionToken) {
        req.principal = await authenticateTokenPrincipal(
          sessionToken,
          jwtConfig,
          findCurrentUser
        );
      } else {
        const authHeader = typeof req.headers.authorization === 'string'
          ? req.headers.authorization
          : undefined;
        req.principal = await authenticateBearerPrincipal(
          authHeader,
          jwtConfig,
          findCurrentUser
        );
      }

      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized: Invalid or inactive authentication' });
      return;
    }
  });

  // Trusted authenticated principal endpoint for the frontend session layer.
  app.get('/api/auth/me', (req: Request, res: Response) => {
    if (!req.principal) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    res.json({ user: req.principal });
  });

  // SECURITY-2G5: transaction history, transfers and reversals are server-authoritative.
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
        const [accounts, paymentMethods] = await Promise.all([
          accountRepo.findAll(),
          paymentMethodRepo.findAll(),
        ]);
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
              paymentDate: req.body?.paymentDate,
              description: req.body?.description,
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
              paymentDate: req.body?.paymentDate,
              description: req.body?.description,
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
    const principal = requireFinancePrincipal(req, res);
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
    const principal = requireFinancePrincipal(req, res);
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
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
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
            installmentsCount: req.body?.installmentsCount,
            recurrenceDaysInterval: req.body?.recurrenceDaysInterval,
            userId: principal.userId,
            userName: principal.name,
          },
          txContext
        )
      );
      res.status(201).json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/receivables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

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
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const items = await UnitOfWork.run(principal.companyId, async (txContext) =>
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
            installmentsCount: req.body?.installmentsCount,
            recurrenceDaysInterval: req.body?.recurrenceDaysInterval,
            idempotencyKey: req.body?.idempotencyKey,
            userId: principal.userId,
            userName: principal.name,
          },
          txContext
        )
      );
      res.status(201).json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

  app.post('/api/finance/payables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

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

  // DB Test endpoint
  app.get('/api/db-test', async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`SELECT 1 as result`);
      res.json({ status: 'ok', result: result.rows });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
