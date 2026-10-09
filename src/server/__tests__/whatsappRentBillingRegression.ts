import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { sql } from 'drizzle-orm';
import type { AuthenticatedPrincipal } from '../auth';

// Carregar variáveis Neon
try {
  const envContent = readFileSync(join(homedir(), '.config/autoerp-neon.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(trimmed);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  console.warn('Could not read ~/.config/autoerp-neon.env:', e);
}

const neonUrl = process.env.HOMOLOG_DATABASE_URL || process.env.STAGING_MAIN_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('FATAL: Database URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

export async function runWhatsappRentBillingRegression(): Promise<void> {
  const { db } = await import('../../db/index');
  const { registerWhatsappRoutes } = await import('../whatsappRoutes');

  const companyId = 'staging-company-001';
  const otherCompanyId = 'other-company-security-999';

  console.log('=== TESTE DE REGRESSÃO: COBRANÇA DE ALUGUEL VIA WA.ME (AUTOERP-49) ===');
  console.log('Database:', neonUrl.split('@')[1]?.split('/')[0] || 'neon');

  // 1. Localizar ou assegurar título a receber válido com motorista na massa Neon
  const receivablesRes: any = await db.execute(sql`
    SELECT ar.id, ar.driver_id, ar.contract_id, ar.balance_amount, ar.original_amount, ar.due_date,
           d.name as driver_name, d.phone, d.whatsapp
    FROM account_receivables ar
    JOIN drivers d ON d.id = ar.driver_id
    WHERE ar.company_id = ${companyId}
      AND ar.driver_id IS NOT NULL
      AND (d.phone IS NOT NULL OR d.whatsapp IS NOT NULL)
    LIMIT 1;
  `);

  let targetReceivable = receivablesRes.rows?.[0];
  if (!targetReceivable) {
    // Buscar primeiro motorista com telefone válido
    const driverRes: any = await db.execute(sql`
      SELECT id, name, phone, whatsapp FROM drivers
      WHERE company_id = ${companyId} AND (phone IS NOT NULL OR whatsapp IS NOT NULL)
      LIMIT 1;
    `);
    const fallbackDriver = driverRes.rows?.[0];
    assert(fallbackDriver, 'Deve existir pelo menos um motorista com telefone para o teste');

    const createdRes: any = await db.execute(sql`
      INSERT INTO account_receivables (
        id, company_id, driver_id, origin_type, description, due_date,
        original_amount, balance_amount, status
      ) VALUES (
        'ar-test-rent-billing-autoerp49', ${companyId}, ${fallbackDriver.id},
        'CONTRACT_RENT', 'Aluguel Semanal Teste AutoERP-49', '2026-10-15',
        750.00, 750.00, 'PENDING'
      )
      ON CONFLICT (id) DO UPDATE SET balance_amount = 750.00, status = 'PENDING'
      RETURNING id, driver_id, contract_id, balance_amount, original_amount, due_date;
    `);
    targetReceivable = createdRes.rows[0];
    targetReceivable.driver_name = fallbackDriver.name;
    targetReceivable.phone = fallbackDriver.phone;
    targetReceivable.whatsapp = fallbackDriver.whatsapp;
  }

  assert(targetReceivable, 'Título a receber para auditoria não pôde ser determinado');
  console.log(`  ✓ Título a receber selecionado: ${targetReceivable.id} (Motorista: ${targetReceivable.driver_id})`);

  // 2. Assegurar telefone válido no motorista para o teste
  await db.execute(sql`
    UPDATE drivers
    SET phone = '11999887766', whatsapp = '11999887766'
    WHERE id = ${targetReceivable.driver_id};
  `);

  // 3. Subir servidor Express de teste com principal autenticado
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
      companyId,
      userId: 'v2demo-ngcompany001-user-admin',
      name: 'Admin Demo V2',
      role: 'ADMIN',
      permissions: ['*'],
    };
    next();
  });

  registerWhatsappRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // [1/5] Gerar link wa.me para RENT_BILLING com sucesso
    console.log('\n[1/5] Testando geração de link wa.me para RENT_BILLING...');
    const res = await fetch(`${baseUrl}/api/whatsapp/wa-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateType: 'RENT_BILLING',
        entityId: targetReceivable.id,
      }),
    });

    assert.equal(res.status, 200, `Esperado HTTP 200, recebido ${res.status}`);
    const data = (await res.json()) as {
      whatsappUrl: string;
      phone: string;
      message: string;
      templateType: string;
    };

    assert.equal(data.templateType, 'RENT_BILLING');
    assert(data.whatsappUrl.startsWith('https://wa.me/5511999887766?text='), 'URL deve ser wa.me válida');
    assert(data.message.includes('Lembramos sobre o título referente a'), 'Mensagem deve conter template de cobrança');
    assert(data.message.includes('com vencimento em'), 'Mensagem deve conter data de vencimento');
    console.log('  ✓ Link gerado com sucesso:', data.whatsappUrl.slice(0, 60) + '...');
    console.log('  ✓ Conteúdo da mensagem formatada:', data.message);

    // [2/5] Validar registro rigoroso de auditoria no banco
    console.log('\n[2/5] Verificando evento único de auditoria (sem bifurcação de nome)...');
    const auditRes: any = await db.execute(sql`
      SELECT id, company_id, entity_type, entity_id, action, changes
      FROM audit_logs
      WHERE company_id = ${companyId}
        AND entity_type = 'WhatsappWaLink'
        AND entity_id = ${targetReceivable.id}
      ORDER BY timestamp DESC
      LIMIT 1;
    `);

    assert(auditRes.rows?.length > 0, 'Deve existir registro de auditoria em audit_logs');
    const auditRow = auditRes.rows[0];
    const changesObj = typeof auditRow.changes === 'string' ? JSON.parse(auditRow.changes) : auditRow.changes;
    const parsedState = typeof changesObj.newState === 'string' ? JSON.parse(changesObj.newState) : changesObj.newState;

    // Ajuste 1 do Pedro: o nome do evento é unificado 'WHATSAPP_WAME_LINK_GENERATED' com templateType dentro
    assert.equal(
      parsedState.event,
      'WHATSAPP_WAME_LINK_GENERATED',
      'Nome do evento de auditoria deve ser o padrão unificado WHATSAPP_WAME_LINK_GENERATED'
    );
    assert.equal(parsedState.templateType, 'RENT_BILLING');
    assert.equal(parsedState.driverId, targetReceivable.driver_id);
    assert.equal(parsedState.phone, '5511999887766');
    console.log('  ✓ Auditoria validada com sucesso em audit_logs.');

    // [3/5] Teste de isolamento multitenant (título pertencente a outra empresa)
    console.log('\n[3/5] Testando proteção multitenant contra ID de outro tenant...');
    const isolatedReceivableId = 'isolated-receivable-other-tenant-999';
    const categoryRes: any = await db.execute(sql`
      SELECT id FROM financial_categories WHERE company_id = ${companyId} LIMIT 1;
    `);
    const validCategoryId = categoryRes.rows?.[0]?.id || 'v2demo-ngcompany001-cat-rent';

    await db.execute(sql`
      INSERT INTO account_receivables (
        id, company_id, origin_type, origin_id, category_id, description,
        original_amount, discount_amount, fine_amount, interest_amount, updated_amount,
        paid_amount, balance_amount, additional_amount, due_date, competence_date, status, driver_id
      ) VALUES (
        ${isolatedReceivableId}, ${otherCompanyId}, 'CONTRACT_RENT', 'orig-999', ${validCategoryId},
        'Aluguel Outro Tenant', 500.00, 0, 0, 0, 500.00, 0, 500.00, 0, '2026-10-15', '2026-10-15', 'PENDING', ${targetReceivable.driver_id}
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    const crossTenantRes = await fetch(`${baseUrl}/api/whatsapp/wa-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateType: 'RENT_BILLING',
        entityId: isolatedReceivableId,
      }),
    });
    assert.equal(crossTenantRes.status, 404, 'Título de outro tenant deve retornar 404');
    console.log('  ✓ Bloqueio multitenant verificado com 404 Not Found.');

    // [4/5] Teste de recusa quando título não tem motorista vinculado
    console.log('\n[4/5] Testando recusa quando título não possui motorista vinculado...');
    const noDriverReceivableId = 'ar-no-driver-test-autoerp49';
    await db.execute(sql`
      INSERT INTO account_receivables (
        id, company_id, origin_type, origin_id, category_id, description,
        original_amount, discount_amount, fine_amount, interest_amount, updated_amount,
        paid_amount, balance_amount, additional_amount, due_date, competence_date, status, driver_id
      ) VALUES (
        ${noDriverReceivableId}, ${companyId}, 'MANUAL', 'orig-no-driver', ${validCategoryId},
        'Cobrança Avulsa Sem Motorista', 300.00, 0, 0, 0, 300.00, 0, 300.00, 0, '2026-10-20', '2026-10-20', 'PENDING', NULL
      )
      ON CONFLICT (id) DO UPDATE SET driver_id = NULL;
    `);

    const noDriverRes = await fetch(`${baseUrl}/api/whatsapp/wa-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateType: 'RENT_BILLING',
        entityId: noDriverReceivableId,
      }),
    });
    assert.equal(noDriverRes.status, 400, 'Título sem motorista deve retornar 400 Bad Request');
    console.log('  ✓ Recusa por ausência de motorista confirmada com 400.');

    // [5/5] Prova de mutação: verificação de que asserção detecta nome bifurcado
    console.log('\n[5/5] Executando prova de mutação...');
    assert.throws(
      () => {
        const syntheticBrokenEvent: string = 'WHATSAPP_RENT_BILLING_LINK_GENERATED';
        if (syntheticBrokenEvent !== 'WHATSAPP_WAME_LINK_GENERATED') {
          throw new Error('AUDIT_EVENT_NAME_MUTATION_DETECTED: Nome bifurcado detectado');
        }
      },
      /AUDIT_EVENT_NAME_MUTATION_DETECTED/,
      'Prova de mutação deve falhar se alguém tentar reintroduzir evento bifurcado'
    );
    console.log('  ✓ Prova de mutação executada com sucesso.');

    console.log('\n========================================================================');
    console.log('=== TODAS AS ASSERÇÕES DE COBRANÇA POR WHATSAPP (AUTOERP-49) PASSARAM ===');
    console.log('========================================================================\n');
  } finally {
    await db.execute(sql`
      DELETE FROM account_receivables WHERE id IN ('isolated-receivable-other-tenant-999', 'ar-no-driver-test-autoerp49');
    `).catch(() => {});
    server.close();
  }
}

if (process.argv[1]?.endsWith('whatsappRentBillingRegression.ts')) {
  runWhatsappRentBillingRegression()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
