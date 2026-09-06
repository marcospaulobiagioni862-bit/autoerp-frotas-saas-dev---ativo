import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { createAttachmentStorageFromEnvironment } from './r2AttachmentStorage';
import { inspectDocumentAiRuntimeMode } from './documentAiObservability';

type OperationalState = 'OK' | 'DEGRADED';

export function registerOpsHealthRoutes(app: Express): void {
  app.get('/api/ops/health', async (req: Request, res: Response) => {
    const principal = req.principal;
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    let databaseOk = false;
    try {
      await UnitOfWork.run(principal.companyId, async (txContext) => {
        const raw = txContext.getRawTransaction?.();
        if (!raw) throw new Error('Database transaction unavailable');
        await raw.execute(sql`SELECT 1`);
      });
      databaseOk = true;
    } catch {
      databaseOk = false;
    }

    let storage = {
      provider: 'UNKNOWN',
      configured: false,
      durable: false,
      ephemeralPath: false,
    };
    try {
      const configuration = createAttachmentStorageFromEnvironment(process.env).getConfiguration();
      storage = {
        provider: configuration.provider,
        configured: configuration.configured,
        durable: configuration.durable,
        ephemeralPath: configuration.ephemeralPath,
      };
    } catch {
      // Sanitized fail-closed operational status only.
    }

    const documentAiMode = inspectDocumentAiRuntimeMode(process.env);
    const state: OperationalState =
      databaseOk && storage.configured && storage.durable && documentAiMode !== 'MISCONFIGURED'
        ? 'OK'
        : 'DEGRADED';

    res.json({
      state,
      requestId: req.requestId || null,
      checks: {
        database: { ok: databaseOk },
        attachments: storage,
        documentAi: {
          mode: documentAiMode,
          syntheticOnly: true,
          automaticExecution: false,
        },
      },
    });
  });
}
