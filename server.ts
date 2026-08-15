import { jwtVerify } from 'jose';
import { FinanceEngine } from './src/domain/finance/FinanceEngine';
import { UnitOfWork } from './src/db/uow';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { db } from './src/db/index';
import { sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';

export interface AuthenticatedPrincipal {
  userId: string;
  companyId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
    }
  }
}

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || !process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE) {
      console.warn('[AI Studio] Running without JWT secrets configured. Set JWT_SECRET, JWT_ISSUER, and JWT_AUDIENCE if required.');
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
        req.principal = { companyId: tenantId, userId: userId, role: 'ADMIN' };
      }
      return next();
    }
    
    // SERVER_SIDE_TENANT_AUTHORITY: Real production middleware
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
       res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
       return;
    }
    const token = authHeader.split(' ')[1];
    
        // REAL JWT VERIFICATION
    try {
      if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
        throw new Error('JWT_SECRET is not configured');
      }
      // If we don't have a secret and we are in test mode, we might fail closed unless we have one.
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default-test-secret-do-not-use-in-prod');
      
      const { payload } = await jwtVerify(token, secret, {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });

      if (!payload.companyId || !payload.userId) throw new Error('Missing claims');
      
      req.principal = {
        companyId: payload.companyId as string,
        userId: payload.userId as string,
        role: (payload.role as string) || 'USER',
      };
      next();
    } catch (e) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }
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
