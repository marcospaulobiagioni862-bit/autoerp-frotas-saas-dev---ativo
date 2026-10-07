import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { registerContractRoutes } from '../contractRoutes';
import { registerContractSimpleSignRoutes } from '../contractSimpleSignRoutes';
import { registerContractExecutionRoutes } from '../contractExecutionRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import { ContractStatus, ObligationStatus, RecurringFrequency, VehicleStatus } from '../../types/enums';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const companyId = 'test-co-lifecycle-53-54';
const adminId = 'test-admin-53-54';
const driverId = 'test-driver-53-54';
const vehicleId = 'test-vehicle-53-54';
const templateId = 'test-tpl-53-54';

async function setupFixtures(): Promise<void> {
  const client = (db as any).$client;
  if (client && typeof client.exec === 'function') {
    for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
      try {
        await client.exec(readFileSync(`drizzle/${file}`, 'utf8'));
      } catch {}
    }
  }
  await db.execute(sql`
    INSERT INTO companies (id, name, status, created_at, updated_at) VALUES
      (${companyId}, 'Lifecycle Test Company', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO users (id, company_id, name, email, role, active, created_at, updated_at) VALUES
      (${adminId}, ${companyId}, 'Admin Tester', 'tester@example.com', 'ADMIN', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO financial_categories (id, company_id, name, type, active, created_at, updated_at) VALUES
      ('cat-rent-53-54', ${companyId}, 'Aluguel Teste', 'INCOME', true, NOW(), NOW()),
      ('cat-dep-53-54', ${companyId}, 'Caucao Teste', 'INCOME', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
      (${vehicleId}, ${companyId}, 'TST5354', 'RENAVAM5354', 'AVAILABLE', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status='AVAILABLE', current_driver_id='', current_contract_id='', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, phone, cpf, cnh, active, cnh_expiration, status, app_platforms, is_archived, created_at, updated_at
    ) VALUES
      (${driverId}, ${companyId}, 'Motorista Silva', '11999887766', '52998224725', '12345678900', true, '2035-01-01', 'ACTIVE', ARRAY['Uber'], false, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET phone='11999887766', status='ACTIVE', cnh_expiration='2035-01-01', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO insurances (
      id, company_id, vehicle_id, insurance_company, policy_number, coverage_details,
      deductible_amount, total_premium_amount, installments_count, start_date, end_date, status,
      account_payable_ids, created_by, created_at, updated_at
    ) VALUES
      ('ins-53-54', ${companyId}, ${vehicleId}, 'Seguradora X', 'POL-5354', 'Cobertura completa', 1000, 1200, 12, '2026-01-01', '2027-12-31', 'ACTIVE', '[]'::jsonb, ${adminId}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET status='ACTIVE', start_date='2026-01-01', end_date='2027-12-31', updated_at=NOW()
  `);
  await db.execute(sql`
    INSERT INTO contract_templates (
      id, company_id, template_key, title, content_markdown, is_current, is_active, version_number, is_archived, created_by, created_at, updated_at
    ) VALUES
      (${templateId}, ${companyId}, 'modelo-contrato-53', 'Contrato Teste V2', '# Contrato de Locacao\nLocatario: {{driver.name}}\nVeiculo: {{vehicle.plate}}', true, true, 1, false, ${adminId}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET is_current=true, is_active=true, updated_at=NOW()
  `);
}

export async function runContractLifecycleAndShareRegression(): Promise<void> {
  const originalStorageDir = process.env.ATTACHMENT_STORAGE_DIR;
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.ATTACHMENT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'autoerp-lifecycle-53-54-'));
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-regression-53-54';
  await setupFixtures();

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const isPublic = req.path.startsWith('/api/public');
    if (!isPublic) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        companyId,
        userId: adminId,
        name: 'Admin Tester',
        role: 'ADMIN',
        permissions: ['*'],
      };
    }
    next();
  });

  registerContractRoutes(app);
  registerContractSimpleSignRoutes(app);
  registerContractExecutionRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
  const base = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Criar contrato em DRAFT (AUTOERP-53)
    const createRes = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-idempotency-key': 'key-draft-53-01' },
      body: JSON.stringify({
        status: ContractStatus.DRAFT,
        contractNumber: 'CNT-53-DRAFT-01',
        driverId,
        vehicleId,
        startDate: '2026-10-01',
        rentalAmount: 600,
        billingPeriodicity: RecurringFrequency.WEEKLY,
        billingDueDayOfWeek: 1,
        securityDepositAmount: 1000,
        templateId,
      }),
    });
    assert(createRes.status === 201, `Expected 201 on create DRAFT, got ${createRes.status}`);
    const createData = (await createRes.json()) as any;
    const contract = createData.item;
    assert(contract.status === ContractStatus.DRAFT, `Contract status expected DRAFT, got ${contract.status}`);
    assert(Array.isArray(createData.receivables) && createData.receivables.length === 0, 'DRAFT contract must not generate initial receivables');

    // Veículo deve continuar AVAILABLE
    const vehCheck: any = await db.execute(sql`SELECT status, current_contract_id FROM vehicles WHERE id=${vehicleId}`);
    assert(vehCheck.rows[0].status === VehicleStatus.AVAILABLE, 'Vehicle must remain AVAILABLE when contract is in DRAFT');
    assert(!vehCheck.rows[0].current_contract_id, 'Vehicle must not be bound while contract is in DRAFT');

    // 2. Editar contrato em DRAFT (AUTOERP-53)
    const patchDraftRes = await fetch(`${base}/api/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rentalAmount: 650, notes: 'Ajuste inicial de rascunho' }),
    });
    assert(patchDraftRes.status === 200, `Expected 200 on patch DRAFT, got ${patchDraftRes.status}`);
    const patchedDraftData = (await patchDraftRes.json()) as any;
    assert(patchedDraftData.item.rentalAmount === 650, 'Patched rentalAmount must be 650');

    // 3. Gerar PDF oficial do contrato
    const genPdfRes = await fetch(`${base}/api/contracts/${contract.id}/generate-pdf`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    const genPdfData = await genPdfRes.json() as any;
    assert(genPdfRes.status === 201, `Expected 201 on generate-pdf, got ${genPdfRes.status}: ${JSON.stringify(genPdfData)}`);

    // 4. Confirmar assinatura manual (sign-status)
    const signRes = await fetch(`${base}/api/contracts/${contract.id}/sign-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signed: true }),
    });
    assert(signRes.status === 201, `Expected 201 on sign-status, got ${signRes.status}`);

    // 5. Ativar o contrato
    const activateRes = await fetch(`${base}/api/contracts/${contract.id}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(activateRes.status === 200, `Expected 200 on activate, got ${activateRes.status}`);
    const activateData = (await activateRes.json()) as any;
    assert(activateData.item.status === ContractStatus.ACTIVE, 'Activated contract must be ACTIVE');
    assert(Array.isArray(activateData.receivables) && activateData.receivables.length >= 1, 'Activation must produce receivables');

    // Veículo agora deve estar RENTED e vinculado
    const vehActive: any = await db.execute(sql`SELECT status, current_contract_id, current_driver_id FROM vehicles WHERE id=${vehicleId}`);
    assert(vehActive.rows[0].status === VehicleStatus.RENTED, 'Vehicle must be RENTED after activation');
    assert(vehActive.rows[0].current_contract_id === contract.id, 'Vehicle must be bound to active contract');

    // 6. Edição de contrato ACTIVE com preservação de parcelas pagas (AUTOERP-53)
    // Marcar a parcela gerada na ativação como PAGA e inserir uma segunda parcela PENDENTE em período posterior
    const paidRecId = activateData.receivables[0].id;
    await db.execute(sql`
      UPDATE account_receivables
      SET paid_amount = 650, balance_amount = 0, status = 'PAID', updated_at = NOW()
      WHERE id = ${paidRecId}
    `);

    const pendingRecId = 'rec-pending-test-53';
    await db.execute(sql`
      INSERT INTO account_receivables (
        id, company_id, contract_id, driver_id, vehicle_id, origin_type, origin_id, category_id,
        description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount,
        paid_amount, balance_amount, due_date, competence_date, period_ref, status, created_at, updated_at
      ) VALUES
        (${pendingRecId}, ${companyId}, ${contract.id}, ${driverId}, ${vehicleId}, 'CONTRACT_RENT', 'test:pending', 'cat-rent-53-54',
         'Aluguel Pendente', 650, 0, 0, 0, 650, 0, 650, '2026-10-15', '2026-10-15', '2026-W42', 'PENDING', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET original_amount=650, updated_amount=650, paid_amount=0, balance_amount=650, status='PENDING'
    `);

    // Atualizar valor do contrato ativo para 720
    const patchActiveRes = await fetch(`${base}/api/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rentalAmount: 720 }),
    });
    assert(patchActiveRes.status === 200, `Expected 200 on patch ACTIVE contract, got ${patchActiveRes.status}`);

    // Verificar se o título pago permaneceu 100% INTOCADO
    const paidRecCheck: any = await db.execute(sql`SELECT original_amount, paid_amount, balance_amount, status FROM account_receivables WHERE id=${paidRecId}`);
    assert(Number(paidRecCheck.rows[0].original_amount) === 650, 'Paid receivable original_amount must NOT change');
    assert(Number(paidRecCheck.rows[0].paid_amount) === 650, 'Paid receivable paid_amount must NOT change');
    assert(Number(paidRecCheck.rows[0].balance_amount) === 0, 'Paid receivable balance_amount must remain 0');
    assert(paidRecCheck.rows[0].status === ObligationStatus.PAID, 'Paid receivable status must remain PAID');

    // Verificar se o título pendente foi recalculado para 720
    const pendingRecCheck: any = await db.execute(sql`SELECT original_amount, updated_amount, balance_amount, status FROM account_receivables WHERE id=${pendingRecId}`);
    assert(Number(pendingRecCheck.rows[0].original_amount) === 720, `Pending receivable original_amount expected 720, got ${pendingRecCheck.rows[0].original_amount}`);
    assert(Number(pendingRecCheck.rows[0].balance_amount) === 720, `Pending receivable balance_amount expected 720, got ${pendingRecCheck.rows[0].balance_amount}`);

    // 7. Teste de Compartilhamento WhatsApp e Link Público (AUTOERP-54)
    const shareRes = await fetch(`${base}/api/contracts/${contract.id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert(shareRes.status === 200, `Expected 200 on share-link, got ${shareRes.status}`);
    const shareData = (await shareRes.json()) as any;
    assert(shareData.token, 'Share response must contain token');
    assert(shareData.publicPdfUrl && shareData.publicPdfUrl.includes('/api/public/contracts/'), 'Share response must contain publicPdfUrl');
    assert(shareData.whatsappUrl && shareData.whatsappUrl.startsWith('https://wa.me/5511999887766'), `whatsappUrl expected wa.me/5511999887766, got ${shareData.whatsappUrl}`);
    assert(shareData.phone === '5511999887766', 'Normalized phone must have 55 prefix');

    // Verificar log de auditoria do disparo
    const auditCheck: any = await db.execute(sql`
      SELECT changes FROM audit_logs
      WHERE company_id=${companyId} AND entity_id=${contract.id} AND changes LIKE '%CONTRACT_SHARE_LINK_GENERATED%'
      ORDER BY timestamp DESC LIMIT 1
    `);
    assert(auditCheck.rows.length === 1, 'Audit log must record CONTRACT_SHARE_LINK_GENERATED');

    // 8. Acessar a rota pública SEM AUTENTICAÇÃO usando o link retornado
    const publicPdfRes = await fetch(shareData.publicPdfUrl);
    assert(publicPdfRes.status === 200, `Public PDF download expected 200, got ${publicPdfRes.status}`);
    assert(publicPdfRes.headers.get('content-type') === 'application/pdf', 'Public endpoint must serve application/pdf');
    const pdfBuffer = await publicPdfRes.arrayBuffer();
    assert(pdfBuffer.byteLength > 100, 'Served PDF buffer must not be empty');
    const pdfHeader = Buffer.from(pdfBuffer.slice(0, 5)).toString('ascii');
    assert(pdfHeader === '%PDF-', `Served file must be a valid PDF header, got ${pdfHeader}`);

    // 9. Segurança: requisição sem token ou com token adulterado deve ser rejeitada com 401
    const noTokenRes = await fetch(`${base}/api/public/contracts/${contract.id}/pdf`);
    assert(noTokenRes.status === 401, `No-token request expected 401, got ${noTokenRes.status}`);

    const badTokenRes = await fetch(`${base}/api/public/contracts/${contract.id}/pdf?token=invalid.token.signature`);
    assert(badTokenRes.status === 401, `Tampered token request expected 401, got ${badTokenRes.status}`);

    const tamperedChar = shareData.token.endsWith('X') ? 'Y' : 'X';
    const singleCharTamperedToken = shareData.token.slice(0, -1) + tamperedChar;
    const singleCharTamperedRes = await fetch(`${base}/api/public/contracts/${contract.id}/pdf?token=${singleCharTamperedToken}`);
    assert(singleCharTamperedRes.status === 401, `Single-char tampered token request expected 401, got ${singleCharTamperedRes.status}`);

    // 10. Segurança (AUTOERP-54): falhar fechado se JWT_SECRET não estiver configurado (sem fallback público)
    const prevSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      const unconfiguredShareRes = await fetch(`${base}/api/contracts/${contract.id}/share-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      assert(unconfiguredShareRes.status === 500, `Expected 500 when JWT_SECRET is missing, got ${unconfiguredShareRes.status}`);

      const unconfiguredVerifyRes = await fetch(`${base}/api/public/contracts/${contract.id}/pdf?token=${shareData.token}`);
      assert(unconfiguredVerifyRes.status === 401, `Expected 401 when verifying without JWT_SECRET, got ${unconfiguredVerifyRes.status}`);
    } finally {
      if (prevSecret !== undefined) process.env.JWT_SECRET = prevSecret;
    }

    console.log('AUTOERP-53 & AUTOERP-54 INTEGRATION REGRESSION: ALL CHECKS PASSED.');
  } finally {
    if (originalStorageDir === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = originalStorageDir;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    server.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('contractLifecycleAndShareRegression.ts')) {
  runContractLifecycleAndShareRegression()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('REGRESSION FAILED:', err);
      process.exit(1);
    });
}
