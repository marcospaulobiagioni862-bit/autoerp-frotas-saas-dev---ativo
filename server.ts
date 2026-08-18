import { FinanceEngine } from './src/domain/finance/FinanceEngine';
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

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOW_MOCK_AUTH === 'true') {
      throw new Error('FATAL: ALLOW_MOCK_AUTH cannot be true in production environment.');
    }
    if (!process.env.JWT_SECRET || !process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE) {
      throw new Error('FATAL: Production environment requires valid JWT_SECRET, JWT_ISSUER, and JWT_AUDIENCE.');
    }
  }

  // Inject UOW for real ACID transactions in production
  FinanceEngine.uowRunner = UnitOfWork.run;

  const app = express();
  app.use(express.json());
  const PORT = 3000;

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
