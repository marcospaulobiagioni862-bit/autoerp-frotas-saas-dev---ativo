import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { sql } from 'drizzle-orm';
import type { AuthenticatedPrincipal } from '../auth';
import { ContractStatus, ObligationStatus, VehicleStatus } from '../../types/enums';

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
  console.error('FATAL: HOMOLOG_DATABASE_URL is required to run real massa verification.');
  process.exit(1);
}

process.env.DATABASE_URL = neonUrl;
process.env.USE_PGLITE = 'false';
process.env.NODE_ENV = 'development';

async function main() {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  process.env.ATTACHMENT_STORAGE_DIR = process.env.ATTACHMENT_STORAGE_DIR || await mkdtemp(join(tmpdir(), 'autoerp-storage-53-'));
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-massa-53';

  const { db } = await import('../../db/index');
  const { registerContractRoutes } = await import('../contractRoutes');
  const { registerContractExecutionRoutes } = await import('../contractExecutionRoutes');
  const { registerContractSimpleSignRoutes } = await import('../contractSimpleSignRoutes');

  const companyId = 'staging-company-001';
  const vehicleId = 'v2demo-ngcompany001-vehicle-09';
  const driverId = 'v2demo-ngcompany001-driver-09';
  const templateId = 'v2demo-template-real-53';

  // Usuários reais de homologação
  const adminActor: AuthenticatedPrincipal = {
    companyId,
    userId: 'v2demo-ngcompany001-user-admin',
    name: 'Admin Demo V2',
    role: 'ADMIN',
    permissions: ['*'],
  };

  const managerWithoutSignActor: AuthenticatedPrincipal = {
    companyId,
    userId: 'v2demo-ngcompany001-user-manager',
    name: 'Gestor Demo V2',
    role: 'MANAGER',
    // Possui EDIT_CONTRACT mas NÃO possui SIGN_CONTRACT
    permissions: [
      'VIEW_VEHICLE',
      'EDIT_VEHICLE',
      'VIEW_DRIVER',
      'EDIT_DRIVER',
      'VIEW_CONTRACT',
      'EDIT_CONTRACT',
      'VIEW_FINANCIAL',
      'EDIT_FINANCIAL',
    ],
  };

  console.log('=== AUTOERP-53: CICLO DE CONTRATO COMPLETO NA MASSA REAL DO NEON ===');
  console.log('Database:', neonUrl.split('@')[1]?.split('/')[0] || 'neon');

  // Garantir template de contrato ativo e válido para geração oficial de PDF
  await db.execute(sql`
    INSERT INTO contract_templates (
      id, company_id, template_key, title, content_markdown, is_current, is_active, version_number, is_archived, created_by, created_at, updated_at
    ) VALUES (
      ${templateId}, ${companyId}, 'custom-locacao-teste-53', 'Contrato Teste Real Neon 53',
      '# Contrato de Locacao\nLocatario: {{driver.name}}\nVeiculo: {{vehicle.plate}}\nValor: R$ {{contract.rentalAmount}}',
      true, true, 1, false, ${adminActor.userId}, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      template_key = 'custom-locacao-teste-53',
      is_current = true,
      is_active = true,
      is_archived = false,
      content_markdown = '# Contrato de Locacao\nLocatario: {{driver.name}}\nVeiculo: {{vehicle.plate}}\nValor: R$ {{contract.rentalAmount}}',
      updated_at = NOW()
  `);

  // Garantir estado limpo de resíduos anteriores de teste para idempotência total
  await db.execute(sql`
    DELETE FROM account_receivables
    WHERE company_id = ${companyId} AND (origin_id LIKE 'test:pending%' OR contract_id IN (
      SELECT id FROM contracts WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId} AND id NOT LIKE 'v2demo%'
    ))
  `);
  await db.execute(sql`
    DELETE FROM contract_artifacts
    WHERE company_id = ${companyId} AND contract_id IN (
      SELECT id FROM contracts WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId} AND id NOT LIKE 'v2demo%'
    )
  `);
  await db.execute(sql`
    DELETE FROM contracts
    WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId} AND id NOT LIKE 'v2demo%'
  `);

  await db.execute(sql`
    UPDATE vehicles
    SET status = 'AVAILABLE', current_contract_id = NULL, current_driver_id = NULL, updated_at = NOW()
    WHERE id = ${vehicleId} AND company_id = ${companyId}
  `);

  await db.execute(sql`
    UPDATE drivers
    SET status = 'ACTIVE', cnh_expiration = '2030-12-31', updated_at = NOW()
    WHERE id = ${driverId} AND company_id = ${companyId}
  `);

  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const actorHeader = req.headers['x-actor'] as string;
    if (actorHeader === 'manager') {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = managerWithoutSignActor;
    } else {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = adminActor;
    }
    next();
  });

  registerContractRoutes(app);
  registerContractExecutionRoutes(app);
  registerContractSimpleSignRoutes(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  let createdContractId = '';

  try {
    // -------------------------------------------------------------
    // ETAPA 1: Criar Contrato em DRAFT (POST /api/contracts)
    // -------------------------------------------------------------
    console.log('\n[Etapa 1] Criando contrato em DRAFT...');
    const createRes = await fetch(`${base}/api/contracts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': `idem-create-contract-live-${Date.now()}`,
      },
      body: JSON.stringify({
        driverId,
        vehicleId,
        templateId,
        status: 'DRAFT',
        startDate: '2026-10-10',
        endDate: '2027-10-10',
        rentalAmount: 600,
        billingPeriodicity: 'WEEKLY',
        billingDueDayOfWeek: 1,
        billingDueDayOfMonth: 1,
        securityDepositAmount: 500,
        franchiseKm: 1000,
        excessKmRate: 0.5,
      }),
    });
    const createBodyText = await createRes.text();
    assert.equal(createRes.status, 201, `Create contract failed with ${createRes.status}: ${createBodyText}`);
    const createData = JSON.parse(createBodyText) as any;
    createdContractId = createData.item.id;
    console.log(`✓ Contrato criado com sucesso: ${createdContractId} (Status: ${createData.item.status})`);
    assert.equal(createData.item.status, ContractStatus.DRAFT, 'Contrato recém-criado deve ser DRAFT');

    // Validação de não-bloqueio antecipado de veículo e não-geração antecipada de financeiro
    const vehAfterCreate: any = await db.execute(sql`SELECT status, current_contract_id FROM vehicles WHERE id=${vehicleId}`);
    assert.equal(vehAfterCreate.rows[0].status, VehicleStatus.AVAILABLE, 'Veículo deve permanecer AVAILABLE na criação em DRAFT');
    assert.equal(vehAfterCreate.rows[0].current_contract_id, null, 'Veículo não deve ter contrato vinculado em DRAFT');

    const recAfterCreate: any = await db.execute(sql`SELECT count(*)::int as count FROM account_receivables WHERE contract_id=${createdContractId}`);
    assert.equal(recAfterCreate.rows[0].count, 0, 'Nenhum título a receber pode ser gerado na fase DRAFT');
    console.log('✓ Invariante de DRAFT validada: veículo livre e zero títulos a receber criados prematuramente.');

    // -------------------------------------------------------------
    // ETAPA 2: Edição em DRAFT (PUT /api/contracts/:id)
    // -------------------------------------------------------------
    console.log('\n[Etapa 2] Editando contrato em DRAFT...');
    const editDraftRes = await fetch(`${base}/api/contracts/${createdContractId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rentalAmount: 680,
        franchiseKm: 1200,
        securityDepositAmount: 600,
        excessKmRate: 0.6,
      }),
    });
    assert.equal(editDraftRes.status, 200, `Edit DRAFT failed with ${editDraftRes.status}`);
    const editDraftData = (await editDraftRes.json()) as any;
    assert.equal(editDraftData.item.rentalAmount, 680, 'rentalAmount atualizado deve ser 680');
    assert.equal(editDraftData.item.franchiseKm, 1200, 'franchiseKm atualizado deve ser 1200');
    console.log('✓ Edição em DRAFT bem-sucedida: rentalAmount=680, franchiseKm=1200.');

    // -------------------------------------------------------------
    // ETAPA 3: Tentativa de assinatura por usuário SEM SIGN_CONTRACT (HTTP 403)
    // -------------------------------------------------------------
    console.log('\n[Etapa 3] Testando guarda de permissão SIGN_CONTRACT...');
    const signForbiddenRes = await fetch(`${base}/api/contracts/${createdContractId}/sign-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-actor': 'manager' },
      body: JSON.stringify({ signed: true }),
    });
    assert.equal(signForbiddenRes.status, 403, `Usuário sem SIGN_CONTRACT deve receber 403, obteve ${signForbiddenRes.status}`);
    const forbiddenBody = (await signForbiddenRes.json()) as any;
    assert.equal(forbiddenBody.error, 'Forbidden');
    console.log('✓ Guarda SIGN_CONTRACT validada com perfeição: Gestor com EDIT_CONTRACT foi barrado com 403 Forbidden.');

    // -------------------------------------------------------------
    // ETAPA 4: Geração de PDF Oficial (POST /api/contracts/:id/generate-pdf)
    // -------------------------------------------------------------
    console.log('\n[Etapa 4] Gerando PDF oficial do contrato...');
    const genPdfRes = await fetch(`${base}/api/contracts/${createdContractId}/generate-pdf`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    const genPdfBodyText = await genPdfRes.text();
    assert.equal(genPdfRes.status, 201, `generate-pdf failed with ${genPdfRes.status}: ${genPdfBodyText}`);
    const genPdfData = JSON.parse(genPdfBodyText) as any;
    assert.equal(genPdfData.contract.status, ContractStatus.AWAITING_SIGNATURE, 'Após gerar PDF, contrato deve ir para AWAITING_SIGNATURE');
    console.log('✓ PDF oficial gerado com sucesso. Contrato avançou para AWAITING_SIGNATURE.');

    // -------------------------------------------------------------
    // ETAPA 5: Assinatura Manual Autorizada (POST /api/contracts/:id/sign-status)
    // -------------------------------------------------------------
    console.log('\n[Etapa 5] Registrando confirmação de assinatura com permissão válida...');
    const signAllowedRes = await fetch(`${base}/api/contracts/${createdContractId}/sign-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' }, // ator default: adminActor (possui *)
      body: JSON.stringify({ signed: true }),
    });
    assert.equal(signAllowedRes.status, 201, `sign-status failed with ${signAllowedRes.status}`);
    const signData = (await signAllowedRes.json()) as any;
    assert.equal(signData.signed, true, 'Assinatura deve constar como true');
    console.log('✓ Assinatura registrada com sucesso via rota oficial de sign-status.');

    // -------------------------------------------------------------
    // ETAPA 6: Ativação Formal (POST /api/contracts/:id/activate)
    // -------------------------------------------------------------
    console.log('\n[Etapa 6] Ativando contrato formalmente...');
    const activateRes = await fetch(`${base}/api/contracts/${createdContractId}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(activateRes.status, 200, `activate failed with ${activateRes.status}`);
    const activateData = (await activateRes.json()) as any;
    assert.equal(activateData.item.status, ContractStatus.ACTIVE, 'Contrato ativado deve estar ACTIVE');
    assert(Array.isArray(activateData.receivables) && activateData.receivables.length >= 1, 'Ativação deve produzir recebíveis');
    console.log(`✓ Contrato ${createdContractId} formalmente ATIVO! Recebíveis gerados: ${activateData.receivables.length}.`);

    // Validar veículo RENTED no Neon
    const vehAfterActivate: any = await db.execute(sql`SELECT status, current_contract_id, current_driver_id FROM vehicles WHERE id=${vehicleId}`);
    assert.equal(vehAfterActivate.rows[0].status, VehicleStatus.RENTED, 'Veículo deve estar RENTED após ativação');
    assert.equal(vehAfterActivate.rows[0].current_contract_id, createdContractId, 'Veículo deve estar vinculado ao contrato');
    assert.equal(vehAfterActivate.rows[0].current_driver_id, driverId, 'Veículo deve estar vinculado ao motorista');
    console.log('✓ Veículo devidamente atualizado para RENTED e vinculado ao motorista e contrato.');

    // -------------------------------------------------------------
    // ETAPA 7: Edição com Contrato ACTIVE (preservação de títulos pagos)
    // -------------------------------------------------------------
    console.log('\n[Etapa 7] Testando edição em contrato ACTIVE com títulos pagos e pendentes...');
    const firstRecId = activateData.receivables[0].id;
    // Marcar primeira parcela como PAGA
    await db.execute(sql`
      UPDATE account_receivables
      SET paid_amount = 680, balance_amount = 0, status = 'PAID', updated_at = NOW()
      WHERE id = ${firstRecId}
    `);

    // Inserir parcela futura PENDENTE
    await db.execute(sql`
      DELETE FROM account_receivables
      WHERE company_id = ${companyId} AND origin_id = 'test:pending'
    `);
    const pendingRecId = `rec-pending-live-${Date.now()}`;
    await db.execute(sql`
      INSERT INTO account_receivables (
        id, company_id, contract_id, driver_id, vehicle_id, origin_type, origin_id, category_id,
        description, original_amount, discount_amount, fine_amount, interest_amount, updated_amount,
        paid_amount, balance_amount, due_date, competence_date, period_ref, status, created_at, updated_at
      ) VALUES (
        ${pendingRecId}, ${companyId}, ${createdContractId}, ${driverId}, ${vehicleId}, 'CONTRACT_RENT', 'test:pending', 'v2demo-ngcompany001-fincat-01',
        'Aluguel Pendente Futuro', 680, 0, 0, 0, 680, 0, 680, '2026-10-25', '2026-10-25', '2026-W43', 'PENDING', NOW(), NOW()
      )
      ON CONFLICT (company_id, origin_type, origin_id, period_ref) WHERE period_ref IS NOT NULL DO UPDATE SET
        contract_id = ${createdContractId},
        driver_id = ${driverId},
        vehicle_id = ${vehicleId},
        original_amount = 680,
        updated_amount = 680,
        balance_amount = 680,
        paid_amount = 0,
        status = 'PENDING',
        updated_at = NOW()
    `);

    // Atualizar valor do contrato ativo para 720
    const editActiveRes = await fetch(`${base}/api/contracts/${createdContractId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rentalAmount: 720 }),
    });
    assert.equal(editActiveRes.status, 200, `Edit ACTIVE contract failed with ${editActiveRes.status}`);

    // Checar parcela paga no Neon: deve continuar INTOCADA
    const paidRecCheck: any = await db.execute(sql`SELECT original_amount, paid_amount, balance_amount, status FROM account_receivables WHERE id=${firstRecId}`);
    assert.equal(Number(paidRecCheck.rows[0].original_amount), 680, 'Parcela paga original_amount não deve mudar');
    assert.equal(Number(paidRecCheck.rows[0].paid_amount), 680, 'Parcela paga paid_amount não deve mudar');
    assert.equal(Number(paidRecCheck.rows[0].balance_amount), 0, 'Parcela paga balance_amount deve ser 0');
    assert.equal(paidRecCheck.rows[0].status, ObligationStatus.PAID, 'Parcela paga deve permanecer PAID');

    // Checar parcela pendente no Neon: deve ter sido recalculada para 720
    const pendingRecCheck: any = await db.execute(sql`SELECT original_amount, updated_amount, balance_amount, status FROM account_receivables WHERE id=${pendingRecId}`);
    assert.equal(Number(pendingRecCheck.rows[0].original_amount), 720, 'Parcela pendente deve ser recalculada para 720');
    assert.equal(Number(pendingRecCheck.rows[0].balance_amount), 720, 'Saldo pendente deve ser recalculado para 720');
    console.log('✓ Regra de Recálculo Seguro validada: parcela paga de R$ 680 permaneceu intocada; parcela pendente recalculada para R$ 720.');

    console.log('\n=============================================================');
    console.log('AUTOERP-53: SUCESSO TOTAL EM HOMOLOGAÇÃO REAL (NEON)!');
    console.log(`Contrato de Teste: ${createdContractId}`);
    console.log('Status Final: ACTIVE');
    console.log('Veículo Vinculado: v2demo-ngcompany001-vehicle-09 (RENTED)');
    console.log('=============================================================');
  } finally {
    // Limpeza completa de todos os dados do contrato de teste para garantir zero resíduos
    if (createdContractId) {
      await db.execute(sql`
        DELETE FROM account_receivables
        WHERE company_id = ${companyId} AND (contract_id = ${createdContractId} OR origin_id LIKE 'test:pending%')
      `);
      await db.execute(sql`
        DELETE FROM contract_artifacts
        WHERE company_id = ${companyId} AND contract_id = ${createdContractId}
      `);
      await db.execute(sql`
        DELETE FROM contracts
        WHERE company_id = ${companyId} AND id = ${createdContractId}
      `);
    } else {
      await db.execute(sql`
        DELETE FROM account_receivables
        WHERE company_id = ${companyId} AND origin_id LIKE 'test:pending%'
      `);
    }

    // Restaurar veículo para AVAILABLE para manter o ambiente estável
    await db.execute(sql`
      UPDATE vehicles
      SET status = 'AVAILABLE', current_contract_id = NULL, current_driver_id = NULL, updated_at = NOW()
      WHERE id = ${vehicleId} AND company_id = ${companyId}
    `);
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

main().catch((err) => {
  console.error('ERRO FATAL NA EXECUÇÃO:', err);
  process.exit(1);
});
