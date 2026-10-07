import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import {
  MAX_DRIVERS_LIMIT,
  MAX_VEHICLES_LIMIT,
  TenantProfileAuthority,
  TenantProfileForbiddenError,
  TenantProfileValidationError,
} from '../tenantProfileAuthority';
import { registerTenantProfileRoutes } from '../tenantProfileRoutes';
import { registerContractExecutionRoutes } from '../contractExecutionRoutes';

const companyA = 'security-2q2-company-a';
const companyB = 'security-2q2-company-b';
const adminA = 'security-2q2-admin-a';
const readonlyA = 'security-2q2-readonly-a';
const adminB = 'security-2q2-admin-b';
const actorA = { companyId: companyA, userId: adminA, name: 'Q2 Admin A', role: 'ADMIN' };
const actorB = { companyId: companyB, userId: adminB, name: 'Q2 Admin B', role: 'ADMIN' };
const readonlyActor = { companyId: companyA, userId: readonlyA, name: 'Q2 Readonly A', role: 'READONLY' };

// Amostra de PNG 1x1 válido em base64
const VALID_1X1_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
// Amostra de JPEG 1x1 válido em base64
const VALID_1X1_JPEG_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rows(query: any): Promise<any[]> {
  const result: any = await db.execute(query);
  return result.rows || [];
}

async function row(query: any): Promise<any> {
  return (await rows(query))[0];
}

async function rejects<T extends Error>(fn: () => Promise<unknown>, type: new (...args: any[]) => T): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof type, `expected ${type.name}, got ${String(error)}`);
    return;
  }
  throw new Error(`expected ${type.name}, got success`);
}

async function seed(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS companies (
      id text PRIMARY KEY,
      document text UNIQUE,
      name text NOT NULL,
      trade_name text,
      email text,
      phone text,
      whatsapp text,
      address_street text,
      address_number text,
      address_complement text,
      address_neighborhood text,
      address_city text,
      address_state text,
      address_zip_code text,
      legal_representative_name text,
      legal_representative_cpf text,
      status text NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      role text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenant_operational_configs (
      company_id text PRIMARY KEY,
      timezone text NOT NULL,
      currency text NOT NULL,
      max_vehicles_limit integer NOT NULL,
      max_drivers_limit integer NOT NULL,
      document_red_days integer NOT NULL DEFAULT 7,
      document_yellow_days integer NOT NULL DEFAULT 15,
      logo_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      user_id text NOT NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      changes text,
      timestamp timestamptz NOT NULL DEFAULT now(),
      correlation_id text,
      ip_address text
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vehicles (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      plate text NOT NULL,
      renavam text NOT NULL,
      brand text NOT NULL DEFAULT '',
      model text NOT NULL DEFAULT '',
      version text,
      year_fabrication integer NOT NULL DEFAULT 0,
      year_model integer NOT NULL DEFAULT 0,
      color text NOT NULL DEFAULT '',
      chassis text NOT NULL DEFAULT '',
      current_km integer NOT NULL DEFAULT 0,
      next_maintenance_km integer,
      fuel_type text NOT NULL DEFAULT 'Flex',
      category text NOT NULL DEFAULT 'Padrão',
      acquisition_value numeric NOT NULL DEFAULT 0,
      current_value numeric NOT NULL DEFAULT 0,
      rental_value_base numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'AVAILABLE',
      notes text,
      current_driver_id text,
      current_contract_id text,
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drivers (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      name text NOT NULL,
      phone text,
      whatsapp text,
      email text,
      cpf text,
      cnh text,
      cnh_expiration date,
      marital_status text,
      profession text,
      mother_name text,
      pix_key text,
      active boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'ACTIVE',
      app_platforms text[] NOT NULL DEFAULT ARRAY[]::text[],
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      template_key text NOT NULL,
      title text NOT NULL,
      content_markdown text NOT NULL,
      version_number integer NOT NULL DEFAULT 1,
      supersedes_template_id text,
      is_current boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      is_archived boolean NOT NULL DEFAULT false,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contracts (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      contract_number text NOT NULL,
      driver_id text NOT NULL,
      vehicle_id text NOT NULL,
      start_date text NOT NULL,
      end_date text,
      rental_amount numeric NOT NULL DEFAULT 0,
      billing_periodicity text NOT NULL DEFAULT 'WEEKLY',
      billing_due_day_of_week integer NOT NULL DEFAULT 1,
      billing_due_day_of_month integer NOT NULL DEFAULT 1,
      security_deposit_amount numeric NOT NULL DEFAULT 0,
      security_deposit_id text,
      franchise_km integer NOT NULL DEFAULT 0,
      excess_km_rate numeric NOT NULL DEFAULT 0,
      payment_method_id text,
      status text NOT NULL DEFAULT 'DRAFT',
      template_id text,
      generated_pdf_url text,
      signed_contract_url text,
      signature_required boolean NOT NULL DEFAULT true,
      notes text,
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contract_artifacts (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      contract_id text NOT NULL,
      artifact_type text NOT NULL,
      attachment_id text NOT NULL,
      template_id text,
      source_artifact_id text,
      snapshot_json text,
      snapshot_hash text NOT NULL,
      is_current boolean NOT NULL DEFAULT true,
      is_archived boolean NOT NULL DEFAULT false,
      signature_method text,
      signed_by_name text,
      signed_at timestamptz,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS insurances (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      vehicle_id text NOT NULL,
      insurance_company text NOT NULL,
      policy_number text NOT NULL,
      coverage_details text,
      deductible_amount numeric NOT NULL DEFAULT 0,
      total_premium_amount numeric NOT NULL DEFAULT 0,
      installments_count integer NOT NULL DEFAULT 1,
      start_date date NOT NULL,
      end_date date NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      broker_name text,
      broker_phone text,
      cancellation_reason text,
      cancelled_at timestamptz,
      account_payable_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trackers (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      vehicle_id text NOT NULL,
      serial_number text,
      equipment_model text,
      imei text,
      chip_carrier text,
      chip_number text,
      monthly_cost numeric,
      installation_date date,
      supplier_id text,
      provider_name text,
      provider_contact text,
      portal_url text,
      status text NOT NULL DEFAULT 'ACTIVE',
      notes text,
      last_ping timestamptz,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS file_attachments (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      entity_type text NOT NULL,
      entity_name text NOT NULL,
      entity_id text NOT NULL,
      document_type text,
      file_name text NOT NULL,
      mime_type text NOT NULL,
      url text NOT NULL,
      size integer,
      file_size integer NOT NULL DEFAULT 0,
      storage_provider text NOT NULL DEFAULT 'LEGACY_BROWSER',
      storage_key text,
      checksum text,
      description text,
      issue_date text,
      expiration_date text,
      created_by text,
      is_archived boolean NOT NULL DEFAULT false,
      content_state text NOT NULL DEFAULT 'LEGACY_BROWSER',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM file_attachments WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM trackers WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM insurances WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM contract_artifacts WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM contracts WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM contract_templates WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM vehicles WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM drivers WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM tenant_operational_configs WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA}, ${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA}, ${companyB})`);
  await db.execute(sql`INSERT INTO companies(id,document,name,trade_name,status,created_at,updated_at) VALUES
    (${companyA},'11111111000191','Security 2Q2 Company A','MoveFlex A','ACTIVE',NOW(),NOW()),
    (${companyB},'22222222000191','Security 2Q2 Company B','Company B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,permissions,created_at,updated_at) VALUES
    (${adminA},${companyA},'Q2 Admin A','2q2-admin-a@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW()),
    (${readonlyA},${companyA},'Q2 Readonly A','2q2-readonly-a@example.test','READONLY',true,ARRAY[]::text[],NOW(),NOW()),
    (${adminB},${companyB},'Q2 Admin B','2q2-admin-b@example.test','ADMIN',true,ARRAY['*'],NOW(),NOW())`);
}

async function requestServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const companyId = typeof req.headers['x-test-company'] === 'string' ? req.headers['x-test-company'] : '';
    const userId = typeof req.headers['x-test-user'] === 'string' ? req.headers['x-test-user'] : '';
    const role = typeof req.headers['x-test-role'] === 'string' ? req.headers['x-test-role'] : '';
    if (companyId && userId && role) {
      (req as Request & { principal?: AuthenticatedPrincipal }).principal = {
        // O harness dava o curinga '*' a QUALQUER papel, inclusive READONLY, e isso
        // deixou de ser realista quando o AUTOERP-59 passou a tratar permissao
        // explicita como autoridade (papel virou fallback legado). Em producao as
        // permissoes vem do banco e so o preset ADMIN grava '*'. Mesmo ajuste que o
        // v2InspectionAndDocumentRoutesRegression recebeu; aqui tinha passado batido.
        companyId, userId, role, name: `${role} integration`, permissions: role.toUpperCase() === 'ADMIN' ? ['*'] : [],
      };
    }
    next();
  });
  registerTenantProfileRoutes(app);
  registerContractExecutionRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'tenant profile test server unavailable');
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export async function runTenantProfileAuthorityIntegration(): Promise<void> {
  const originalStorage = process.env.ATTACHMENT_STORAGE_DIR;
  process.env.ATTACHMENT_STORAGE_DIR = await mkdtemp(join(tmpdir(), 'autoerp-tenant-brand-'));

  try {
    await seed();

    const firstReads = await Promise.all([
      TenantProfileAuthority.get(actorA),
      TenantProfileAuthority.get(actorA),
    ]);
    assert(firstReads[0].companyId === companyA && firstReads[1].companyId === companyA, 'concurrent defaults returned wrong tenant');
    assert(firstReads[0].document === '11111111000191', 'company document must come from PostgreSQL');
    assert(firstReads[0].timezone === 'America/Sao_Paulo' && firstReads[0].currency === 'BRL', 'deterministic defaults missing');
    const configCount = await row(sql`SELECT COUNT(*)::int AS count FROM tenant_operational_configs WHERE company_id=${companyA}`);
    assert(Number(configCount.count) === 1, 'concurrent reads must converge to one config row');
    const createAudits = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TenantOperationalConfig' AND action='CREATE'`);
    assert(Number(createAudits.count) === 1, 'default creation must be audited exactly once');

    const profileB = await TenantProfileAuthority.get(actorB);
    assert(profileB.document === '22222222000191' && profileB.companyName.includes('Company B'), 'tenant B profile not isolated');
    await rejects(() => TenantProfileAuthority.get(readonlyActor), TenantProfileForbiddenError);
    await rejects(() => TenantProfileAuthority.update(readonlyActor, { companyName: 'Forbidden' }), TenantProfileForbiddenError);

    const beforeInvalid = await row(sql`SELECT name,updated_at FROM companies WHERE id=${companyA}`);
    const invalidInputs = [
      { timezone: 'Invalid/Timezone' },
      { currency: 'USD' },
      { maxVehiclesLimit: -1 },
      { maxVehiclesLimit: 1.5 },
      { maxVehiclesLimit: MAX_VEHICLES_LIMIT + 1 },
      { maxDriversLimit: MAX_DRIVERS_LIMIT + 1 },
      { document: 'forged' } as any,
      { companyId: companyB } as any,
      // Validação estrita de logoUrl (AUTOERP-33): rejeitar esquemas externos, protocol-relative, barra invertida, não-imagem e lixo
      { logoUrl: 'https://evil.com/logo.png' },
      { logoUrl: 'http://insecure-cdn.com/logo.png' },
      { logoUrl: '//protocol-relative.com/logo.png' },
      { logoUrl: '/\\evil.com/logo.png' },
      { logoUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' },
      { logoUrl: 'data:application/pdf;base64,JVBERi0=' },
      { logoUrl: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAAAA==' },
      { logoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9zdmc+' },
      { logoUrl: 'javascript:alert(1)' },
      { logoUrl: 'not-a-valid-logo' },
      { logoUrl: 'data:image/png;base64,' },
    ];
    for (const input of invalidInputs) {
      await rejects(() => TenantProfileAuthority.update(actorA, input), TenantProfileValidationError);
    }
    const afterInvalid = await row(sql`SELECT name,updated_at FROM companies WHERE id=${companyA}`);
    assert(afterInvalid.name === beforeInvalid.name && String(afterInvalid.updated_at) === String(beforeInvalid.updated_at), 'invalid updates must perform zero company writes');

    // Validação estrita de logoUrl (AUTOERP-33): aceitar tipos suportados
    const withPng = await TenantProfileAuthority.update(actorA, { logoUrl: VALID_1X1_PNG_BASE64 });
    assert(withPng.logoUrl === VALID_1X1_PNG_BASE64, 'valid PNG data URI must be accepted');

    const withJpeg = await TenantProfileAuthority.update(actorA, { logoUrl: VALID_1X1_JPEG_BASE64 });
    assert(withJpeg.logoUrl === VALID_1X1_JPEG_BASE64, 'valid JPEG data URI must be accepted');

    const withRelative = await TenantProfileAuthority.update(actorA, { logoUrl: '/assets/branding/logo.png' });
    assert(withRelative.logoUrl === '/assets/branding/logo.png', 'same-origin relative URL must be accepted');

    const withNull = await TenantProfileAuthority.update(actorA, { logoUrl: null });
    assert(withNull.logoUrl === null, 'null logo must clear the field');

    const updated = await TenantProfileAuthority.update(actorA, {
      companyName: 'MoveFlex Locação de Veículos',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      maxVehiclesLimit: 750,
      maxDriversLimit: 1500,
      logoUrl: VALID_1X1_PNG_BASE64,
    });
    assert(updated.companyName === 'MoveFlex Locação de Veículos', 'company name update missing');
    assert(updated.document === '11111111000191', 'document must remain unchanged');
    assert(updated.maxVehiclesLimit === 750 && updated.maxDriversLimit === 1500, 'operational limits not persisted');
    assert(updated.logoUrl === VALID_1X1_PNG_BASE64, 'logoUrl not persisted');
    assert(updated.updatedBy === adminA, 'actor must come from authenticated principal');
    const foreignCompany = await row(sql`SELECT name,document FROM companies WHERE id=${companyB}`);
    assert(foreignCompany.name === 'Security 2Q2 Company B' && foreignCompany.document === '22222222000191', 'tenant B must remain unchanged');

    const updateAuditBeforeNoop = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TenantOperationalConfig' AND action='UPDATE'`);
    assert(Number(updateAuditBeforeNoop.count) >= 1, 'valid update must append audit');

    await TenantProfileAuthority.update(actorA, {
      companyName: updated.companyName,
      timezone: updated.timezone,
      currency: updated.currency,
      maxVehiclesLimit: updated.maxVehiclesLimit,
      maxDriversLimit: updated.maxDriversLimit,
      logoUrl: updated.logoUrl,
    });
    const updateAuditAfterNoop = await row(sql`SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TenantOperationalConfig' AND action='UPDATE'`);
    assert(Number(updateAuditAfterNoop.count) === Number(updateAuditBeforeNoop.count), 'no-op update must not append audit');

    const http = await requestServer();
    try {
      let response = await fetch(`${http.base}/api/admin/tenant-profile`);
      assert(response.status === 401, `unauthenticated GET expected 401, got ${response.status}`);
      response = await fetch(`${http.base}/api/admin/tenant-profile`, { headers: {
        'x-test-company': companyA, 'x-test-user': readonlyA, 'x-test-role': 'READONLY',
      }});
      assert(response.status === 403, `non-admin GET expected 403, got ${response.status}`);

      // Rejeição de URLs externas e payloads inseguros via HTTP PATCH
      const externalRes = await fetch(`${http.base}/api/admin/tenant-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ logoUrl: 'https://evil.com/logo.png' }),
      });
      assert(externalRes.status === 400, `external logoUrl must return 400, got ${externalRes.status}`);

      const backslashRes = await fetch(`${http.base}/api/admin/tenant-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ logoUrl: '/\\evil.com/logo.png' }),
      });
      assert(backslashRes.status === 400, `backslash logoUrl must return 400, got ${backslashRes.status}`);

      const htmlRes = await fetch(`${http.base}/api/admin/tenant-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ logoUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' }),
      });
      assert(htmlRes.status === 400, `non-image data URI must return 400, got ${htmlRes.status}`);

      const webpRes = await fetch(`${http.base}/api/admin/tenant-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ logoUrl: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAAAA==' }),
      });
      assert(webpRes.status === 400, `webp data URI must return 400, got ${webpRes.status}`);

      // Atualização de logo válido via HTTP PATCH
      const validPatchRes = await fetch(`${http.base}/api/admin/tenant-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ logoUrl: VALID_1X1_PNG_BASE64 }),
      });
      assert(validPatchRes.status === 200, `valid logoUrl PATCH must return 200, got ${validPatchRes.status}`);

      response = await fetch(`${http.base}/api/admin/tenant-profile`, { headers: {
        'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN',
      }});
      assert(response.status === 200, `ADMIN GET expected 200, got ${response.status}`);
      const body: any = await response.json();
      assert(body.item.companyId === companyA && body.item.document === '11111111000191', 'HTTP response leaked or forged tenant');
      assert(body.item.logoUrl === VALID_1X1_PNG_BASE64, 'persisted logoUrl in HTTP GET must match');

      // Cenário Real de Ponta a Ponta: Geração de PDF oficial do contrato usando o branding do tenant
      const templateId = 'tpl-tp-real-01';
      const contractId = 'cnt-tp-real-01';
      await db.execute(sql`
        INSERT INTO vehicles (id, company_id, plate, renavam, status, created_at, updated_at) VALUES
          ('veh-tp-01', ${companyA}, 'TP1234', 'REN-TP-01', 'AVAILABLE', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
      await db.execute(sql`
        INSERT INTO drivers (id, company_id, name, cpf, cnh, active, status, created_at, updated_at) VALUES
          ('drv-tp-01', ${companyA}, 'Motorista Teste TP', '52998224725', '12345678900', true, 'ACTIVE', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
      await db.execute(sql`
        INSERT INTO contract_templates (id, company_id, template_key, title, content_markdown, is_current, is_active, version_number, is_archived, created_by, created_at, updated_at) VALUES
          (${templateId}, ${companyA}, 'tpl-key-tp-01', 'Contrato com Branding Configurado', '# Contrato\nLocatario: {{driver.name}}\nVeiculo: {{vehicle.plate}}', true, true, 1, false, ${adminA}, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
      await db.execute(sql`
        INSERT INTO contracts (id, company_id, contract_number, driver_id, vehicle_id, start_date, rental_amount, billing_periodicity, billing_due_day_of_week, status, template_id, is_archived, created_at, updated_at) VALUES
          (${contractId}, ${companyA}, 'CNT-TP-01', 'drv-tp-01', 'veh-tp-01', '2026-10-01', 500, 'WEEKLY', 1, 'DRAFT', ${templateId}, false, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);

      const genPdfRes = await fetch(`${http.base}/api/contracts/${contractId}/generate-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ templateId }),
      });
      assert(genPdfRes.status === 201, `generate-pdf with configured logo must return 201, got ${genPdfRes.status}`);
      const genPdfData = await genPdfRes.json() as any;
      assert(genPdfData.contract?.id === contractId, 'PDF generation must reference the contract');

      const artifactCheck: any = await db.execute(sql`
        SELECT a.artifact_type, f.file_name, f.file_size, f.mime_type
        FROM contract_artifacts a
        JOIN file_attachments f ON f.id = a.attachment_id
        WHERE a.company_id=${companyA} AND a.contract_id=${contractId}
        ORDER BY a.created_at DESC LIMIT 1
      `);
      assert(artifactCheck.rows.length === 1, 'contract_artifact row must be saved');
      assert(artifactCheck.rows[0].mime_type === 'application/pdf', 'artifact mime must be application/pdf');
      assert(Number(artifactCheck.rows[0].file_size) > 100, 'artifact file_size must be valid');

      // Tentar salvar URL externa novamente após sucesso -> Provar que continua rejeitando com 400
      const secondExternalRes = await fetch(`${http.base}/api/admin/tenant-profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-test-company': companyA, 'x-test-user': adminA, 'x-test-role': 'ADMIN' },
        body: JSON.stringify({ logoUrl: 'https://attacker.example.com/malicious.png' }),
      });
      assert(secondExternalRes.status === 400, 'subsequent external logoUrl attempt must still return 400');

    } finally {
      await http.close();
    }

    console.log('SECURITY-2Q2 & AUTOERP-33 PostgreSQL tenant profile authority & branding integration: PASS');
  } finally {
    if (originalStorage === undefined) delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = originalStorage;
  }
}

if (process.argv[1]?.includes('tenantProfileAuthorityIntegration')) {
  runTenantProfileAuthorityIntegration().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
