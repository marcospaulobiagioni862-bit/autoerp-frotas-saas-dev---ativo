import { FinanceEngine } from './src/domain/finance/FinanceEngine';
import { registerFinanceRoutes } from './src/server/financeRoutes';
import { UnitOfWork } from './src/db/uow';
import { AuditAction } from './src/types/enums';
import { hasDriverHealthPermission } from './src/shared/security/driverHealthAuthorization';
import { registerVehicleRoutes } from './src/server/vehicleRoutes';
import { requestCorrelationMiddleware } from './src/server/requestCorrelation';
import { registerOpsHealthRoutes } from './src/server/opsHealthRoutes';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { db } from './src/db/index';
import { companies, users } from './src/db/schema';
import { userCompanyMemberships } from './src/db/authSchema';
import { PostgresAuthCredentialRepository } from './src/db/repositories/postgresAuthRepository';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { verifyPassword } from './src/server/password';
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
      requestId?: string;
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
    assertBootstrapRuntimeConfiguration(process.env.AUTOERP_BOOTSTRAP_TOKEN, true);
  }

  // Temporary operational bridge for isolated V2 homologation only.
  // The seed itself carries additional target/branch/arming guards.
  if (process.env.RUN_V2_DEMO_SEED_ON_BOOT === 'YES_V2_NON_PRODUCTION_ONLY') {
    if (process.env.RENDER_GIT_BRANCH !== 'v2/core-simplified') {
      throw new Error('FATAL: V2 demo boot seed refused outside v2/core-simplified.');
    }

    console.log('[v2-demo-seed] guarded boot execution requested');
    const { runV2DemoSeed } = await import('./src/db/v2DemoSeed');
    await runV2DemoSeed();
    console.log('[v2-demo-seed] guarded boot execution completed');
  }

  // Inject UOW for real ACID transactions in production
  FinanceEngine.uowRunner = UnitOfWork.run;

  const app = express();

  // Render termina TLS num proxy na frente do servico. Sem isto, req.ip e o IP
  // do proxy e TODOS os clientes caem no mesmo balde de rate limit.
  app.set('trust proxy', 1);

  // Cabecalhos de seguranca.
  //
  // O CSP comeca em REPORT-ONLY: a SPA nunca rodou sob uma politica, entao o
  // navegador apenas RELATA o que teria bloqueado, sem quebrar nada. As
  // violacoes chegam em POST /api/csp-report e sao logadas; quando o log
  // estiver limpo, troca-se reportOnly para false.
  //
  // Cada excecao abaixo foi levantada no codigo, nao copiada de receita:
  // - img-src e frame-src com blob: porque o preview de anexo e a foto do
  //   motorista alimentam <img> e <iframe> com URL de URL.createObjectURL
  //   (AttachmentList.tsx, DocumentPreviewModal.tsx, DriverProfilePhoto.tsx).
  // - img-src com data: porque o logo do contrato e um JPEG em base64
  //   embutido no codigo (moveflexBrand.ts).
  // - style-src com unsafe-inline porque ha style={{...}} em 14 componentes,
  //   e porque a biblioteca de animacao injeta <style> em tempo de execucao.
  // - connect-src com viacep.com.br porque a busca de CEP do cadastro de
  //   motorista e feita do NAVEGADOR (DriverFormModal.tsx). A chamada ao
  //   Gemini NAO entra aqui: ela sai do servidor, nao do navegador.
  // - script-src fica em 'self' puro: o index.html gerado pelo build nao tem
  //   nenhum script inline (conferido em dist/index.html).
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        reportOnly: true,
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'connect-src': ["'self'", 'https://viacep.com.br'],
          'font-src': ["'self'", 'data:'],
          'form-action': ["'self'"],
          'frame-ancestors': ["'self'"],
          'frame-src': ["'self'", 'blob:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'object-src': ["'none'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'worker-src': ["'self'", 'blob:'],
          'report-uri': ['/api/csp-report'],
        },
      },
    })
  );

  // Protecao contra forca bruta no login, em tres camadas.
  //
  // POR QUE NAO E SO POR IP: a primeira versao limitava por req.ip com
  // "trust proxy = 1". Medido no ambiente real, o contador NUNCA avancava -
  // cinco requisicoes seguidas devolviam RateLimit-Remaining: 9, ou seja cada
  // uma caia num balde novo. O Render tem mais de um salto de proxy na frente
  // do servico, entao com um salto confiavel o endereco que sobra e de um
  // balanceador interno que muda a cada requisicao. Contar saltos seria
  // frágil, porque depende de infraestrutura que nao controlamos.
  //
  // skipSuccessfulRequests faz com que apenas tentativas FALHAS contem, entao
  // quem trabalha normalmente nunca e bloqueado: a janela so enche com senha
  // errada.
  const loginLimiterMessage = {
    error: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
  };

  // Camada 1 - POR CONTA. E a que realmente protege, e nao e falsificavel: a
  // chave vem do corpo da requisicao, nao de cabecalho. Forca bruta ataca uma
  // conta, e e a conta que precisa ser defendida.
  const loginAccountRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const company = String((req.body as { companyDocument?: unknown } | undefined)?.companyDocument ?? '')
        .trim()
        .toLowerCase();
      const email = String((req.body as { email?: unknown } | undefined)?.email ?? '')
        .trim()
        .toLowerCase();
      return `conta:${company ? `${company}|` : ''}${email}`;
    },
    message: loginLimiterMessage,
  });

  // Camada 2 - GLOBAL na rota. Limita o estrago total mesmo que o atacante
  // varie conta e falsifique cabecalho de IP. O teto e alto o bastante para
  // nao atrapalhar uso legitimo de uma operacao com poucos usuarios.
  const loginGlobalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: false,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: () => 'login:global',
    message: loginLimiterMessage,
  });

  // Provisionamento do primeiro admin: mais restrito, porque em operacao
  // normal este endpoint nao deveria ser chamado nenhuma vez.
  // Mesmo problema de chave por IP do login: chave global, que aqui e o que
  // faz sentido, porque provisionar o primeiro admin e um evento unico do
  // sistema inteiro e nao algo por usuario.
  const bootstrapRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: () => 'bootstrap:global',
    message: { error: 'Muitas tentativas. Tente novamente mais tarde.' },
  });

  app.use(requestCorrelationMiddleware);
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use(express.json());
  const PORT = Number(process.env.PORT || 3000);

  // Coletor de violacoes do CSP. Precisa ficar ANTES do guarda autenticado de
  // /api, porque o navegador envia o relatorio sem sessao. Limite proprio para
  // nao virar vetor de inundacao de log, e corpo limitado a 32kb.
  const cspReportRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: false,
    legacyHeaders: false,
  });
  app.post(
    '/api/csp-report',
    cspReportRateLimiter,
    express.json({
      type: ['application/csp-report', 'application/reports+json', 'application/json'],
      limit: '32kb',
    }),
    async (req: Request, res: Response) => {
      // Dois formatos chegam aqui. O report-uri classico manda um objeto
      // {"csp-report": {...}} com chaves em kebab-case; a Reporting API nova
      // manda um ARRAY de {body: {...}} com chaves em camelCase. Tratar so o
      // primeiro fazia o segundo virar um registro todo nulo no log, que
      // parece violacao sem informacao e engana quem le.
      const payload = req.body ?? {};
      const entries: Record<string, unknown>[] = Array.isArray(payload)
        ? payload.map((item) => ((item as Record<string, unknown>)?.body ?? item) as Record<string, unknown>)
        : [((payload as Record<string, unknown>)['csp-report'] ?? payload) as Record<string, unknown>];

      for (const report of entries) {
        const directive = String(report['violated-directive'] ?? report['effectiveDirective'] ?? '').trim();
        const blocked = String(report['blocked-uri'] ?? report['blockedURL'] ?? '').trim();
        const documentUri = String(report['document-uri'] ?? report['documentURL'] ?? '').trim();
        if (!directive && !blocked && !documentUri) {
          continue;
        }

        console.warn(
          'AUTOERP_CSP_VIOLATION',
          JSON.stringify({ directive, blocked, document: documentUri })
        );

        // Alem do log, grava agregado no banco. O log vai para o stdout do
        // servico, que nao e alcancavel sem painel nem SSH; o banco e. Sem um
        // lugar legivel, a politica em Report-Only nunca poderia virar bloqueio
        // com seguranca, porque ninguem saberia o que ela teria barrado.
        const cut = (value: string) => value.slice(0, 500);
        const signature = createHash('sha256')
          .update(`${cut(directive)}|${cut(blocked)}|${cut(documentUri)}`)
          .digest('hex');
        try {
          await db.execute(sql`
            INSERT INTO csp_violation_reports (signature, directive, blocked_uri, document_uri)
            VALUES (${signature}, ${cut(directive)}, ${cut(blocked)}, ${cut(documentUri)})
            ON CONFLICT (signature) DO UPDATE
              SET occurrences = csp_violation_reports.occurrences + 1,
                  last_seen = now()
          `);
        } catch (error) {
          // Diagnostico nunca pode derrubar a rota: se o banco falhar, o log
          // acima ja registrou e a resposta segue 204.
          console.warn('AUTOERP_CSP_VIOLATION_PERSIST_FAILED', (error as Error).message);
        }
      }
      res.status(204).end();
    }
  );

  // One-time first-admin credential provisioning. Disabled unless a strong
  // server-only bootstrap secret is explicitly configured. The endpoint never
  // creates a session; normal login is required after provisioning.
  app.post('/api/auth/bootstrap', bootstrapRateLimiter, async (req: Request, res: Response) => {
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

  async function hasMembershipsTable(): Promise<boolean> {
    try {
      const res: any = await db.execute(sql`SELECT to_regclass('user_company_memberships') AS reg`);
      return Boolean(res.rows?.[0]?.reg || res[0]?.reg);
    } catch {
      return false;
    }
  }

  // Login must be reachable before the protected /api middleware. Tenant is
  // resolved from exactly one ACTIVE company by CNPJ/document or trade name;
  // users and credentials are read only after app.current_tenant is established.
  app.post('/api/auth/login', loginGlobalRateLimiter, loginAccountRateLimiter, async (req: Request, res: Response) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const companyDocument = typeof req.body?.companyDocument === 'string' && req.body.companyDocument.trim() !== ''
        ? req.body.companyDocument.trim()
        : undefined;
      const companyId = typeof req.body?.companyId === 'string' && req.body.companyId.trim() !== ''
        ? req.body.companyId.trim()
        : undefined;

      if (!email || !password) {
        throw new InvalidLoginError();
      }

      let resolvedCompany: { id: string; name: string; document: string; tradeName?: string | null } | null = null;

      if (companyDocument) {
        const companyIdentifier = companyDocument.trim().toLowerCase();
        const companyRows = await db
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.status, 'ACTIVE'),
              sql`(
                lower(${companies.document}) = ${companyIdentifier}
                OR lower(coalesce(${companies.tradeName}, '')) = ${companyIdentifier}
              )`
            )
          )
          .limit(2);

        if (companyRows.length !== 1) {
          throw new InvalidLoginError();
        }
        resolvedCompany = companyRows[0];
      } else if (companyId) {
        const companyRows = await db
          .select()
          .from(companies)
          .where(and(eq(companies.status, 'ACTIVE'), eq(companies.id, companyId)))
          .limit(1);

        if (companyRows.length !== 1) {
          throw new InvalidLoginError();
        }
        resolvedCompany = companyRows[0];
      }

      // 1. Identidade única do usuário em users
      const userRows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          active: users.active,
          legacyCompanyId: users.companyId,
          legacyRole: users.role,
          legacyPermissions: users.permissions,
        })
        .from(users)
        .where(and(eq(users.active, true), sql`lower(${users.email}) = ${email}`))
        .limit(2);

      if (userRows.length !== 1) {
        throw new InvalidLoginError();
      }
      const user = userRows[0];

      // 2. Validação da credencial única do usuário em user_credentials
      const credential = await db.transaction(async (tx) => {
        const credentialRepo = new PostgresAuthCredentialRepository(tx);
        return await credentialRepo.findByUserId(user.id);
      });

      if (!credential?.passwordHash || !(await verifyPassword(password, credential.passwordHash))) {
        throw new InvalidLoginError();
      }

      let principal: AuthenticatedPrincipal | null = null;

      const hasTable = await hasMembershipsTable();

      if (resolvedCompany) {
        const memberRows = hasTable ? await db
          .select({
            companyId: userCompanyMemberships.companyId,
            role: userCompanyMemberships.role,
            permissions: userCompanyMemberships.permissions,
            active: userCompanyMemberships.active,
          })
          .from(userCompanyMemberships)
          .where(
            and(
              eq(userCompanyMemberships.userId, user.id),
              eq(userCompanyMemberships.companyId, resolvedCompany.id),
              eq(userCompanyMemberships.active, true)
            )
          )
          .limit(1) : [];

        let targetRole: string | undefined = memberRows[0]?.role;
        let targetPermissions: string[] = memberRows[0]?.permissions || [];

        if (!targetRole && user.legacyCompanyId === resolvedCompany.id) {
          targetRole = user.legacyRole;
          targetPermissions = Array.isArray(user.legacyPermissions) ? user.legacyPermissions : [];
        }

        if (!targetRole) {
          throw new InvalidLoginError();
        }

        principal = {
          userId: user.id,
          companyId: resolvedCompany.id,
          name: user.name,
          role: targetRole,
          permissions: Array.isArray(targetPermissions) ? [...targetPermissions] : [],
        };
      } else {
        // Consulta todas as empresas ativas às quais o usuário está vinculado
        const activeMemberships = hasTable ? await db
          .select({
            companyId: userCompanyMemberships.companyId,
            role: userCompanyMemberships.role,
            permissions: userCompanyMemberships.permissions,
            name: companies.name,
            document: companies.document,
            tradeName: companies.tradeName,
          })
          .from(userCompanyMemberships)
          .innerJoin(companies, eq(companies.id, userCompanyMemberships.companyId))
          .where(
            and(
              eq(userCompanyMemberships.userId, user.id),
              eq(userCompanyMemberships.active, true),
              eq(companies.status, 'ACTIVE')
            )
          ) : [];

        if (activeMemberships.length === 0 && user.legacyCompanyId) {
          const compRows = await db
            .select()
            .from(companies)
            .where(and(eq(companies.status, 'ACTIVE'), eq(companies.id, user.legacyCompanyId)))
            .limit(1);
          if (compRows.length === 1) {
            activeMemberships.push({
              companyId: compRows[0].id,
              role: user.legacyRole || 'ADMIN',
              permissions: Array.isArray(user.legacyPermissions) ? user.legacyPermissions : [],
              name: compRows[0].name,
              document: compRows[0].document,
              tradeName: compRows[0].tradeName,
            });
          }
        }

        if (activeMemberships.length === 0) {
          throw new InvalidLoginError();
        }

        if (activeMemberships.length > 1) {
          return res.json({
            requiresCompanySelection: true,
            availableCompanies: activeMemberships.map((m) => ({
              id: m.companyId,
              name: m.name,
              document: m.document,
              tradeName: m.tradeName || null,
            })),
          });
        }

        const targetMembership = activeMemberships[0];
        principal = {
          userId: user.id,
          companyId: targetMembership.companyId,
          name: user.name,
          role: targetMembership.role,
          permissions: Array.isArray(targetMembership.permissions) ? [...targetMembership.permissions] : [],
        };
      }

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

      const findCurrentUser = async (userId: string, verifiedCompanyId: string) => {
        const hasTable = await hasMembershipsTable();
        const rows = hasTable ? await db
          .select({
            id: users.id,
            name: users.name,
            userActive: users.active,
            role: userCompanyMemberships.role,
            membershipActive: userCompanyMemberships.active,
            permissions: userCompanyMemberships.permissions,
            companyId: userCompanyMemberships.companyId,
          })
          .from(userCompanyMemberships)
          .innerJoin(users, eq(userCompanyMemberships.userId, users.id))
          .where(
            and(
              eq(userCompanyMemberships.userId, userId),
              eq(userCompanyMemberships.companyId, verifiedCompanyId)
            )
          )
          .limit(1) : [];

        if (rows.length > 0) {
          const row = rows[0];
          return {
            id: row.id,
            companyId: row.companyId,
            name: row.name,
            role: row.role,
            active: Boolean(row.userActive && row.membershipActive),
            permissions: Array.isArray(row.permissions) ? [...row.permissions] : [],
          };
        }

        return await UnitOfWork.run(verifiedCompanyId, async (transactionContext) =>
          await transactionContext.getUserRepo().findById(userId)
        );
      };

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
  registerOpsHealthRoutes(app);

  registerFinanceRoutes(app);


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
