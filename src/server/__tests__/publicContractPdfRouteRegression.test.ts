import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { Request, Response as ExpressResponse, NextFunction } from 'express';
import { db } from '../../db/index';
import { sql } from 'drizzle-orm';
import {
  registerPublicContractRoutes,
  registerContractRoutes,
  createContractShareToken,
  verifyContractShareToken,
} from '../contractRoutes';
import { registerContractExecutionRoutes } from '../contractExecutionRoutes';
import { registerContractSimpleSignRoutes } from '../contractSimpleSignRoutes';
import { ContractStatus, RecurringFrequency, VehicleStatus } from '../../types/enums';
import type { AuthenticatedPrincipal } from '../auth';

const companyId = 'co-ph069-public-pdf';
const adminId = 'usr-ph069-admin';
const driverId = 'drv-ph069-01';
const vehicleId = 'veh-ph069-01';
const templateId = 'tmpl-ph069-01';

async function cleanTestData(): Promise<void> {
  // Limpeza isolada apenas das entidades criadas para este teste.
  // Regra 3.2 do CLAUDE.md: NUNCA executar DELETE em audit_logs (append-only trigger).
  await db.execute(sql`DELETE FROM contract_artifacts WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM contracts WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM contract_templates WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM drivers WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM vehicles WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id = ${companyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
}

async function setupFixtures(): Promise<void> {
  // Bloqueador 2: verificar se o schema de tabelas existe.
  // Em CI (job integration), migrate_test_db.cjs já rodou e as tabelas já existem.
  // Em ambiente local PGlite sem migrations prévias, aplica sem catch cego.
  const regCheck: any = await db.execute(sql`SELECT to_regclass('companies') AS tbl`);
  const hasCompanies = Boolean(regCheck.rows?.[0]?.tbl || regCheck[0]?.tbl);

  if (!hasCompanies) {
    const client = (db as any).$client;
    if (client && typeof client.exec === 'function') {
      const migrationFiles = readdirSync('drizzle')
        .filter((name) => name.endsWith('.sql'))
        .sort();
      for (const file of migrationFiles) {
        const sqlContent = readFileSync(`drizzle/${file}`, 'utf8');
        await client.exec(sqlContent);
      }
    } else {
      throw new Error(
        'Tabela "companies" não encontrada e a conexão não é PGlite. ' +
        'Este teste requer que as migrações canônicas tenham sido executadas (job integration do CI via migrate_test_db.cjs).'
      );
    }
  }

  await cleanTestData();

  await db.execute(sql`
    INSERT INTO companies (id, name, document, status, created_at, updated_at) VALUES
      (${companyId}, 'PH-069 Public PDF Locadora', '11222333000199', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminId}, ${companyId}, 'PH-069 Admin', 'admin069@example.com', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
      (${vehicleId}, ${companyId}, 'PUB069A', 'RENAVAM069', 'AVAILABLE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status='AVAILABLE', current_driver_id='', current_contract_id='', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, phone, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
    ) VALUES
      (${driverId}, ${companyId}, 'Motorista PH069', '11988887777', '52998224725', '12345678900', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET phone='11988887777', status=EXCLUDED.status, cnh_expiration='2035-01-01', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO contract_templates (
      id, company_id, template_key, title, content_markdown, is_current, is_active, version_number, is_archived, created_by, created_at, updated_at
    ) VALUES
      (${templateId}, ${companyId}, 'modelo-contrato-069', 'Contrato Publico PH069', '# Contrato Publico\nLocatario: {{driver.name}}\nVeiculo: {{vehicle.plate}}', true, true, 1, false, ${adminId}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET is_current=true, is_active=true, updated_at=NOW()
  `);
}

export async function runPublicContractPdfRouteRegression(): Promise<void> {
  console.log('[PH-069] Iniciando suíte de regressão da rota pública de PDF de contratos...');
  const originalStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.ATTACHMENT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'autoerp-public-pdf-069-'));
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-jwt-key-ph069-must-be-strong';

  await setupFixtures();

  // 1. Configurar servidor Express com arquitetura fiel a server.ts
  const app = express();
  app.use(express.json());

  // Rotas públicas registradas ANTES do middleware autenticado (arquitetura canônica de server.ts)
  registerPublicContractRoutes(app);

  // Middleware autenticado de /api: exige sessão ou credencial de teste
  app.use('/api', (req: Request, res: ExpressResponse, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    const isMockAuthorized = req.headers['x-test-auth'] === 'admin-session';

    if (isMockAuthorized) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId,
        userId: adminId,
        name: 'Admin Tester PH069',
        role: 'ADMIN',
        permissions: ['*'],
      };
      return next();
    }

    if (!authHeader && !cookieHeader) {
      res.status(401).json({ error: 'Unauthorized: Invalid or inactive authentication' });
      return;
    }

    next();
  });

  // Rotas protegidas registradas DEPOIS do middleware de autenticação
  registerContractRoutes(app);
  registerContractSimpleSignRoutes(app);
  registerContractExecutionRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    // 2. Criar contrato e gerar PDF através das rotas autenticadas
    console.log('  [1/7] Criando contrato e gerando PDF autenticado...');
    const createRes = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-auth': 'admin-session',
        'x-idempotency-key': 'key-ph069-draft-01',
      },
      body: JSON.stringify({
        status: ContractStatus.DRAFT,
        contractNumber: 'CNT-PH069-001',
        driverId,
        vehicleId,
        startDate: '2026-10-01',
        rentalAmount: 750,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        billingDueDayOfWeek: 1,
        securityDepositAmount: 1000,
        templateId,
      }),
    });
    assert.equal(createRes.status, 201, `Criação de contrato esperava 201, obteve ${createRes.status}`);
    const createData = (await createRes.json()) as any;
    const contractId = createData.item.id;

    // Gerar PDF oficial
    const genPdfRes = await fetch(`${base}/api/contracts/${contractId}/generate-pdf`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-auth': 'admin-session',
      },
      body: JSON.stringify({ templateId }),
    });
    assert.equal(genPdfRes.status, 201, `Geração de PDF esperava 201, obteve ${genPdfRes.status}`);

    // Obter share link autenticado
    const shareRes = await fetch(`${base}/api/contracts/${contractId}/share-link`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-auth': 'admin-session',
      },
    });
    assert.equal(shareRes.status, 200, `Geração de share-link esperava 200, obteve ${shareRes.status}`);
    const shareData = (await shareRes.json()) as any;
    const validToken = shareData.token;
    assert(validToken, 'share-link deve devolver token HMAC válido');

    // 3. Auditoria Caso A: SEM sessão e COM token válido -> 200 OK (Content-Type: application/pdf)
    console.log('  [2/7] Testando acesso público SEM sessão e COM token válido...');
    const publicPdfRes = await fetch(`${base}/api/public/contracts/${contractId}/pdf?token=${encodeURIComponent(validToken)}`);
    assert.equal(publicPdfRes.status, 200, `Acesso público com token válido esperava 200, obteve ${publicPdfRes.status}`);
    assert.equal(publicPdfRes.headers.get('content-type'), 'application/pdf', 'Content-Type deve ser application/pdf');
    assert.equal(publicPdfRes.headers.get('x-content-type-options'), 'nosniff', 'Header nosniff deve estar presente');
    assert.equal(
      publicPdfRes.headers.get('cache-control'),
      'private, no-cache, no-store, must-revalidate',
      'Cache-Control deve proibir cache público'
    );
    const pdfBytes = await publicPdfRes.arrayBuffer();
    assert(pdfBytes.byteLength > 100, 'Buffer do PDF não pode ser vazio');
    const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii');
    assert.equal(pdfHeader, '%PDF-', 'Arquivo deve ter cabeçalho canônico de PDF (%PDF-)');
    console.log('    ✓ Caso A aprovado: motorista visualiza PDF sem autenticação de sessão.');

    // 4. Auditoria Caso B: SEM sessão e SEM token -> 401 Unauthorized (NUNCA 200)
    console.log('  [3/7] Testando acesso público SEM sessão e SEM token...');
    const noTokenRes = await fetch(`${base}/api/public/contracts/${contractId}/pdf`);
    assert.equal(noTokenRes.status, 401, `Acesso sem token esperava 401, obteve ${noTokenRes.status}`);
    const noTokenJson = (await noTokenRes.json()) as any;
    assert.equal(noTokenJson.error, 'Token de compartilhamento não fornecido.');
    console.log('    ✓ Caso B aprovado: requisição sem token é rejeitada com 401.');

    // 5. Auditoria Caso C (IDOR Protection): SEM sessão e COM token de OUTRO contrato -> 401 Unauthorized
    console.log('  [4/7] Testando acesso público SEM sessão com token de OUTRO contrato (anti-IDOR)...');
    const otherContractId = 'cnt-other-contract-999';
    const otherContractToken = createContractShareToken(companyId, otherContractId);
    const wrongContractRes = await fetch(`${base}/api/public/contracts/${contractId}/pdf?token=${encodeURIComponent(otherContractToken)}`);
    assert.equal(wrongContractRes.status, 401, `Token de outro contrato esperava 401, obteve ${wrongContractRes.status}`);
    const wrongContractJson = (await wrongContractRes.json()) as any;
    assert.equal(wrongContractJson.error, 'Token de compartilhamento inválido ou expirado.');
    console.log('    ✓ Caso C aprovado: token emitido para outro contrato é estritamente rejeitado.');

    // 6. Auditoria Caso D (Expiration): SEM sessão e COM token EXPIRADO -> 401 Unauthorized
    console.log('  [5/7] Testando acesso público SEM sessão com token EXPIRADO...');
    const expiredToken = createContractShareToken(companyId, contractId, 0, -3600); // Expirado há 1 hora
    const expiredRes = await fetch(`${base}/api/public/contracts/${contractId}/pdf?token=${encodeURIComponent(expiredToken)}`);
    assert.equal(expiredRes.status, 401, `Token expirado esperava 401, obteve ${expiredRes.status}`);
    const expiredJson = (await expiredRes.json()) as any;
    assert.equal(expiredJson.error, 'Token de compartilhamento inválido ou expirado.');
    console.log('    ✓ Caso D aprovado: token expirado é estritamente rejeitado.');

    // 7. Auditoria Caso E (Integrity): SEM sessão e COM token ADULTERADO -> 401 Unauthorized
    const tamperedToken = validToken.slice(0, -3) + (validToken.endsWith('abc') ? 'xyz' : 'abc');
    const tamperedRes = await fetch(`${base}/api/public/contracts/${contractId}/pdf?token=${encodeURIComponent(tamperedToken)}`);
    assert.equal(tamperedRes.status, 401, `Token adulterado esperava 401, obteve ${tamperedRes.status}`);
    console.log('    ✓ Caso E aprovado: token com assinatura HMAC adulterada é rejeitado.');

    // 8. Auditoria de Rotas Privadas: rotas privadas SEM sessão continuam bloqueadas
    const privateRes = await fetch(`${base}/api/contracts`);
    assert.equal(privateRes.status, 401, `Rota privada /api/contracts sem sessão esperava 401, obteve ${privateRes.status}`);

    const privateDetailRes = await fetch(`${base}/api/contracts/${contractId}`);
    assert.equal(privateDetailRes.status, 401, `Rota privada /api/contracts/:id sem sessão esperava 401, obteve ${privateDetailRes.status}`);

    // 9. Bloqueador 5: RATE LIMITER DETERMINÍSTICO (não confia em req.ip no Render, server.ts:149-157)
    console.log('  [6/7] Testando que o rate limiter decrementa ratelimit-remaining deterministamente por contrato...');
    const rlRes1 = await fetch(`${base}/api/public/contracts/${contractId}/pdf`);
    const rem1Str = rlRes1.headers.get('ratelimit-remaining');
    assert(rem1Str !== null, 'Header ratelimit-remaining deve estar presente');
    const rem1 = Number(rem1Str);

    const rlRes2 = await fetch(`${base}/api/public/contracts/${contractId}/pdf`);
    const rem2Str = rlRes2.headers.get('ratelimit-remaining');
    assert(rem2Str !== null, 'Header ratelimit-remaining deve estar presente na requisição consecutiva');
    const rem2 = Number(rem2Str);

    assert.equal(
      rem2,
      rem1 - 1,
      `O contador ratelimit-remaining DEVE decrementar a cada requisição (esperado ${rem1 - 1}, obtido ${rem2}). ` +
      'Se o contador não avança, o limiter está caindo em baldes fantasmas de proxy!'
    );
    console.log(`    ✓ Rate limiter comprovado: contador decrementou de ${rem1} para ${rem2} com chave por contrato.`);

    // 10. Bloqueador 4: INVARIANTE DE SUPERFÍCIE REAL SOBRE O ARQUIVO server.ts
    console.log('  [7/7] Verificando invariante de superfície real no código de server.ts...');
    const serverFilePath = join(process.cwd(), 'server.ts');
    const serverCode = readFileSync(serverFilePath, 'utf8');

    // Localizar a posição do middleware global de autenticação
    const authMiddlewarePattern = /app\.use\(\s*['"]\/api['"]\s*,\s*async\s*\(\s*req:\s*Request/g;
    const authMatch = authMiddlewarePattern.exec(serverCode);
    assert(authMatch, 'server.ts deve conter o middleware global app.use(\'/api\', async (req: Request, ...))');
    const authMiddlewareIndex = authMatch.index;

    // Verificar que registerPublicContractRoutes é chamado ANTES do middleware
    const publicCallIndex = serverCode.indexOf('registerPublicContractRoutes(app)');
    assert(publicCallIndex > 0, 'server.ts deve invocar registerPublicContractRoutes(app)');
    assert(
      publicCallIndex < authMiddlewareIndex,
      'registerPublicContractRoutes(app) DEVE ser registrado ANTES do middleware global de autenticação em server.ts'
    );

    // Verificar que registerVehicleRoutes (onde moram rotas privadas de contratos) é chamado DEPOIS do middleware
    const vehicleRoutesIndex = serverCode.indexOf('registerVehicleRoutes(app)');
    assert(vehicleRoutesIndex > 0, 'server.ts deve invocar registerVehicleRoutes(app)');
    assert(
      vehicleRoutesIndex > authMiddlewareIndex,
      'registerVehicleRoutes(app) DEVE ser registrado DEPOIS do middleware global de autenticação em server.ts'
    );

    // Listar todas as rotas sob /api registradas antes do middleware em server.ts
    const preMiddlewareCode = serverCode.slice(0, authMiddlewareIndex);
    const preRouteMatches = [...preMiddlewareCode.matchAll(/app\.(get|post|put|delete|patch|use)\(\s*['"](\/api[^'"]*)['"]/g)].map(
      (m) => m[2]
    );

    // As únicas rotas sob /api permitidas antes do middleware global são exatamente as 4 canônicas + cache header
    const allowedCanonicalPreRoutes = new Set([
      '/api', // header no-store em server.ts:215
      '/api/csp-report',
      '/api/auth/bootstrap',
      '/api/auth/login',
      '/api/auth/logout',
    ]);

    for (const route of preRouteMatches) {
      assert(
        allowedCanonicalPreRoutes.has(route),
        `VIOLAÇÃO DE SUPERFÍCIE: rota não-autorizada encontrada antes do middleware de autenticação em server.ts: "${route}"`
      );
    }

    // Assegura que nenhuma função de rotas privadas de domínio foi registrada antes do middleware
    const domainRouters = [
      'registerVehicleRoutes',
      'registerFinanceRoutes',
      'registerOpsHealthRoutes',
      'registerDriverRoutes',
      'registerContractRoutes',
    ];
    for (const router of domainRouters) {
      const idx = preMiddlewareCode.indexOf(`${router}(app)`);
      assert.equal(
        idx,
        -1,
        `VIOLAÇÃO DE SEGURANÇA: ${router}(app) não pode ser chamado antes do middleware de autenticação em server.ts!`
      );
    }
    console.log('    ✓ Invariante de superfície de server.ts comprovada: apenas as 4 rotas públicas canônicas + registerPublicContractRoutes estão antes do middleware.');

  } finally {
    await cleanTestData();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env.ATTACHMENT_STORAGE_DIR = originalStorageDir;
    process.env.JWT_SECRET = originalJwtSecret;
  }

  console.log('\n[PH-069] TODOS OS TESTES PASSARAM COM SUCESSO!\n');
}

runPublicContractPdfRouteRegression()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[PH-069] REGRESSÃO FALHOU:', err);
    process.exit(1);
  });
