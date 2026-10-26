import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { companies, users } from '../db/schema';
import { userCredentials } from '../db/authSchema';
import { PostgresAuthCredentialRepository } from '../db/repositories/postgresAuthRepository';
import {
  BootstrapInputError,
  BootstrapUnavailableError,
  executeAuthorizedBootstrap,
} from './bootstrap';
import { FinanceMasterDataAuthority } from './financeMasterDataAuthority';

export const bootstrapRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'bootstrap:global',
  message: { error: 'Muitas tentativas. Tente novamente mais tarde.' },
});

export function registerBootstrapRoutes(app: Express, options?: { skipRateLimit?: boolean }): void {
  const middlewares = options?.skipRateLimit ? [] : [bootstrapRateLimiter];

  app.post('/api/auth/bootstrap', ...middlewares, async (req: Request, res: Response) => {
    try {
      const providedToken = typeof req.headers['x-autoerp-bootstrap-token'] === 'string'
        ? req.headers['x-autoerp-bootstrap-token']
        : undefined;

      const forwarded = req.headers['x-forwarded-for'];
      const rawIp = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.ip || req.socket?.remoteAddress || null;
      const clientIp = rawIp ? String(rawIp) : null;

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

            // Persistência com auditoria fail-closed obrigatória
            await credentialRepo.setPasswordHash({
              companyId: prepared.companyId,
              userId: prepared.userId,
              passwordHash: prepared.passwordHash,
              auditActor: {
                userId: prepared.userId,
                userName: 'System Bootstrap',
                origin: 'SYSTEM_BOOTSTRAP',
                event: 'BOOTSTRAP_FIRST_ADMIN_CREDENTIAL',
                ipAddress: clientIp,
              },
            });

            return {
              userId: prepared.userId,
              companyId: prepared.companyId,
              email: prepared.email,
            };
          })
      );

      // Onboarding: seed canonical default financial categories for newly provisioned tenant (fail-safe)
      try {
        await FinanceMasterDataAuthority.seedDefaultCategories({
          companyId: provisioned.companyId,
          userId: provisioned.userId,
          name: 'System Bootstrap',
        });
      } catch (seedError) {
        console.error('AUTOERP_BOOTSTRAP_CATEGORIES_SEED_WARNING', {
          companyId: provisioned.companyId,
          error: seedError instanceof Error ? seedError.message : String(seedError),
        });
      }

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
}
