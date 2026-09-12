import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { createAttachmentStorageFromEnvironment } from './r2AttachmentStorage';
import { inspectDocumentAiRuntimeMode } from './documentAiObservability';
import { registerContractSimpleSignRoutes } from './contractSimpleSignRoutes';

type OperationalState = 'OK' | 'DEGRADED';

type BuildIdentity = {
  commitSha: string | null;
  environment: string;
  service: string | null;
};

function cleanMetadata(value: unknown, max = 160): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean || clean.length > max || !/^[A-Za-z0-9._:/-]+$/.test(clean)) return null;
  return clean;
}

function resolveBuildIdentity(env: NodeJS.ProcessEnv): BuildIdentity {
  return {
    commitSha:
      cleanMetadata(env.RENDER_GIT_COMMIT, 80) ||
      cleanMetadata(env.GIT_COMMIT_SHA, 80) ||
      cleanMetadata(env.COMMIT_SHA, 80),
    environment:
      cleanMetadata(env.AUTOERP_ENVIRONMENT, 40) ||
      cleanMetadata(env.NODE_ENV, 40) ||
      'unknown',
    service: cleanMetadata(env.RENDER_SERVICE_NAME, 120),
  };
}

export function registerOpsHealthRoutes(app: Express): void {
  registerContractSimpleSignRoutes(app);

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
    const build = resolveBuildIdentity(process.env);
    const state: OperationalState =
      databaseOk && storage.configured && storage.durable && documentAiMode !== 'MISCONFIGURED'
        ? 'OK'
        : 'DEGRADED';

    res.json({
      state,
      requestId: req.requestId || null,
      build,
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
