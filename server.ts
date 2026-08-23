import { FinanceEngine } from './src/domain/finance/FinanceEngine';
import { ReceivableService } from './src/domain/finance/ReceivableService';
import { PayableService } from './src/domain/finance/PayableService';
import { SettlementService } from './src/domain/finance/SettlementService';
import { TransferService } from './src/domain/finance/TransferService';
import { ReversalService } from './src/domain/finance/ReversalService';
import { RenegotiationService } from './src/domain/finance/RenegotiationService';
import { isRenegotiationInstallmentFrequency } from './src/shared/utils/renegotiationSchedule';
import { DREService } from './src/domain/finance/DREService';
import { ProfitabilityService } from './src/domain/finance/ProfitabilityService';
import { DepositService } from './src/domain/finance/DepositService';
import { FinancialPeriodService } from './src/domain/finance/FinancialPeriodService';
import { FinancialAuthorizationService } from './src/domain/finance/FinancialAuthorizationService';
import { UnitOfWork } from './src/db/uow';
import { AccountingRegime, AuditAction } from './src/types/enums';
import { hasDriverHealthPermission } from './src/shared/security/driverHealthAuthorization';
import { registerVehicleRoutes } from './src/server/vehicleRoutes';
import { randomUUID } from 'node:crypto';
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
    message.includes('Chave de idempotência reutilizada') ||
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
  const PORT = Number(process.env.PORT || 3000);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('FATAL: PORT must be a valid TCP port.');
  }

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

  // Public low-detail readiness endpoint. It proves the server and PostgreSQL
  // authority are available without exposing tenant, credential or topology data.
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({
        status: 'ok',
        application: 'AutoERP',
        environment: process.env.APP_ENV || 'unknown',
        commit: process.env.RENDER_GIT_COMMIT || null,
      });
    } catch {
      res.status(503).json({
        status: 'unavailable',
        application: 'AutoERP',
        environment: process.env.APP_ENV || 'unknown',
        commit: process.env.RENDER_GIT_COMMIT || null,
      });
    }
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

  registerVehicleRoutes(app);

  // SECURITY-2G7A: finance overview is server-authoritative and tenant-scoped.
  app.get('/api/finance/overview', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {
      const summary = await UnitOfWork.run(principal.companyId, async (txContext) => {
        const accountRepo = txContext.getAccountRepo();
        if (!accountRepo.findAll) {
          throw new Error('Financial account listing is unavailable');
        }

        const [receivables, payables, accounts] = await Promise.all([
          txContext.getReceivableRepo().findAll(),
          txContext.getPayableRepo().findAll(),
          accountRepo.findAll(),
        ]);

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
    const principal = requireFinancePrincipal(req, res);
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
    const principal = requireFinancePrincipal(req, res);
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

  // SECURITY-2H1-v2: driver health/emergency data is server-authoritative.
  app.get('/api/drivers/:id/health', async (req: Request, res: Response) => {
    const principal=req.principal;
    if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return;}
    const context={userId:principal.userId,role:principal.role,active:true,companyId:principal.companyId,permissions:principal.permissions};
    if(!hasDriverHealthPermission('VIEW_DRIVER_HEALTH',context)){res.status(403).json({error:'Forbidden'});return;}
    const driverId=typeof req.params.id==='string'?req.params.id.trim():'';
    if(!driverId){res.status(400).json({error:'Invalid driver health request'});return;}
    try {
      const health=await UnitOfWork.run(principal.companyId, async tx=>{
        const profile=await tx.getDriverHealthRepo().findByDriverId(driverId);
        await tx.getAuditLogRepo().create({
          id:randomUUID(),companyId:principal.companyId,entityName:'DriverHealthSecurity',entityId:driverId,
          action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,
          newState:JSON.stringify({event:'VIEW_DRIVER_HEALTH'}),timestamp:new Date().toISOString(),
        });
        if(!profile)return {};
        const {id:_id,companyId:_companyId,driverId:_driverId,createdAt:_createdAt,updatedAt:_updatedAt,...safe}=profile;
        return safe;
      });
      res.json({health});
    } catch { res.status(400).json({error:'Driver health request failed'}); }
  });

  app.put('/api/drivers/:id/health', async (req: Request, res: Response) => {
    const principal=req.principal;
    if(!principal){res.status(401).json({error:'Unauthorized: Authentication required'});return;}
    const context={userId:principal.userId,role:principal.role,active:true,companyId:principal.companyId,permissions:principal.permissions};
    if(!hasDriverHealthPermission('EDIT_DRIVER_HEALTH',context)){res.status(403).json({error:'Forbidden'});return;}
    const driverId=typeof req.params.id==='string'?req.params.id.trim():'';
    const raw=req.body?.health;
    if(!driverId||!raw||typeof raw!=='object'||Array.isArray(raw)){res.status(400).json({error:'Invalid driver health request'});return;}
    const allowed=['bloodType','allergies','relevantConditions','continuousMedications','emergencyContactName','emergencyContactRelationship','emergencyContactPhone','emergencyNotes'] as const;
    const health:Record<string,string>={};
    for(const key of allowed){const value=(raw as Record<string,unknown>)[key];if(value!==undefined){if(typeof value!=='string'){res.status(400).json({error:'Invalid driver health request'});return;}health[key]=value;}}
    try {
      const saved=await UnitOfWork.run(principal.companyId, async tx=>{
        const existing=await tx.getDriverHealthRepo().findByDriverId(driverId); const now=new Date().toISOString();
        const profile=await tx.getDriverHealthRepo().upsert({
          id:existing?.id||randomUUID(),companyId:principal.companyId,driverId,
          ...(existing||{}),...health,lastUpdateDate:now,responsibleUser:principal.name,createdAt:existing?.createdAt||now,updatedAt:now,
        });
        await tx.getAuditLogRepo().create({
          id:randomUUID(),companyId:principal.companyId,entityName:'DriverHealthSecurity',entityId:driverId,
          action:AuditAction.UPDATE,userId:principal.userId,userName:principal.name,
          newState:JSON.stringify({event:'EDIT_DRIVER_HEALTH',fieldsChanged:Object.keys(health)}),timestamp:now,
        });
        return profile;
      });
      const {id:_id,companyId:_companyId,driverId:_driverId,createdAt:_createdAt,updatedAt:_updatedAt,...safe}=saved;
      res.json({health:safe});
    } catch { res.status(400).json({error:'Driver health request failed'}); }
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
    const principal = requireFinancePrincipal(req, res);
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
    const principal = requireFinancePrincipal(req, res);
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
    const principal = requireFinancePrincipal(req, res);
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
