import { FinanceEngine } from './src/domain/finance/FinanceEngine';
import { UnitOfWork } from './src/db/uow';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db } from './src/db/index';
import { sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import {
  authenticateBearerPrincipal,
  AuthenticatedPrincipal,
} from './src/server/auth';

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
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

    // SERVER_SIDE_TENANT_AUTHORITY: JWT proves the authentication event. Only
    // after signature/issuer/audience verification does authenticateBearerPrincipal
    // supply the verified token tenant to this lookup. UnitOfWork then establishes
    // app.current_tenant for PostgreSQL RLS before reading the current user row.
    try {
      const authHeader = typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;

      req.principal = await authenticateBearerPrincipal(
        authHeader,
        {
          secret: process.env.JWT_SECRET || '',
          issuer: process.env.JWT_ISSUER || '',
          audience: process.env.JWT_AUDIENCE || '',
        },
        async (userId, verifiedCompanyId) =>
          await UnitOfWork.run(verifiedCompanyId, async (transactionContext) =>
            await transactionContext.getUserRepo().findById(userId)
          )
      );
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
  app.get('/api/db-test', async (req: Request, res: Response) => {
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
