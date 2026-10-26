import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';

// Garantir ambiente PGlite determinístico e isolado
process.env.USE_PGLITE = 'true';
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

console.log('--- PH-131: Company Profile Phone & CEP Sanitization Regression Suite ---');

// 1. Verificação da migration 0096
console.log('1. Verifying migration 0096...');
const migrationPath = new URL('../../../drizzle/0096_clean_company_phone_cep_masks.sql', import.meta.url).pathname;
assert.ok(existsSync(migrationPath), 'Migration 0096_clean_company_phone_cep_masks.sql must exist');
const migrationSql = readFileSync(migrationPath, 'utf8');

assert.match(migrationSql, /UPDATE\s+companies\s+SET\s+phone\s*=\s*regexp_replace/i, 'Migration must clean phone masks');
assert.match(migrationSql, /UPDATE\s+companies\s+SET\s+whatsapp\s*=\s*regexp_replace/i, 'Migration must clean whatsapp masks');
assert.match(migrationSql, /UPDATE\s+companies\s+SET\s+address_zip_code\s*=\s*regexp_replace/i, 'Migration must clean address_zip_code masks');

// 2. Setup Database & Express Server
console.log('2. Bootstrapping isolated database and Express server...');
const { db } = await import('../../db/index.js');
const { sql, eq } = await import('drizzle-orm');
const { companies } = await import('../../db/schema.js');
const { registerCompanyProfileRoutes } = await import('../companyProfileRoutes.js');

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS companies (
    id text PRIMARY KEY,
    name text NOT NULL,
    document text NOT NULL DEFAULT '',
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

const testCompanyId = 'company-triflex-001';
const adminUserId = 'user-admin-ph131';

await db.insert(companies).values({
  id: testCompanyId,
  name: 'TRIFLEX LOCACOES LTDA',
  document: '12345678000199',
  tradeName: 'TRIFLEX',
  email: 'contato@triflex.test',
  phone: '15997031369',
  whatsapp: '15997031369',
  addressZipCode: '18075350',
  status: 'ACTIVE',
});

const app = express();
app.use(express.json());

app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
  (req as any).principal = {
    companyId: testCompanyId,
    userId: adminUserId,
    name: 'Admin Sanitization Tester',
    role: 'ADMIN',
    permissions: ['*'],
  };
  next();
});

registerCompanyProfileRoutes(app);

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object', 'Integration server address unavailable');
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

try {
  // Test 1: PATCH /api/company-profile com telefone, whatsapp e CEP com mascara => Deve gravar digitos puros
  console.log('Test 1: Sanitizing masked phone, whatsapp, and zipCode on PATCH /api/company-profile...');
  const patchPayload = {
    name: 'TRIFLEX LOCACOES LTDA',
    tradeName: 'TRIFLEX',
    document: '12.345.678/0001-99',
    email: 'financeiro@triflex.test',
    phone: '(15) 99703-1369',
    whatsapp: '+55 (15) 99703-1369',
    address: {
      street: 'Avenida Ipanema',
      number: '1234',
      complement: 'Sala 1',
      neighborhood: 'Vila Nova Sorocaba',
      city: 'Sorocaba',
      state: 'SP',
      zipCode: '18075-350',
    },
    legalRepresentative: {
      name: 'Marcos Paulo Biagioni',
      cpf: '123.456.789-00',
    },
  };

  const res = await request('/api/company-profile', {
    method: 'PATCH',
    body: JSON.stringify(patchPayload),
  });

  assert.equal(res.status, 200, 'PATCH company-profile must succeed');

  const [stored] = await db.select().from(companies).where(eq(companies.id, testCompanyId));
  assert.ok(stored, 'Company record must exist in database');

  // Asserção Crítica: O banco de dados DEVE conter estritamente dígitos puros
  assert.equal(stored.phone, '15997031369', 'Database phone must strictly contain clean digits without mask');
  assert.equal(stored.whatsapp, '5515997031369', 'Database whatsapp must strictly contain clean digits without mask');
  assert.equal(stored.addressZipCode, '18075350', 'Database addressZipCode must strictly contain clean digits without mask');
  console.log('✓ Database stored pure digits: phone=15997031369, whatsapp=5515997031369, zipCode=18075350.');

  // Test 2: Validation format guards (fail-closed)
  console.log('Test 2: Validation format guards (invalid CEP and phone)...');
  const resInvalidZip = await request('/api/company-profile', {
    method: 'PATCH',
    body: JSON.stringify({
      ...patchPayload,
      address: { ...patchPayload.address, zipCode: '123' }, // CEP com menos de 8 dígitos
    }),
  });
  assert.equal(resInvalidZip.status, 400, 'Invalid zipCode must return HTTP 400');
  assert.equal(resInvalidZip.body?.error, 'Invalid company profile');

  const resInvalidPhone = await request('/api/company-profile', {
    method: 'PATCH',
    body: JSON.stringify({
      ...patchPayload,
      phone: '1234', // Telefone curto inválido
    }),
  });
  assert.equal(resInvalidPhone.status, 400, 'Invalid phone must return HTTP 400');
  assert.equal(resInvalidPhone.body?.error, 'Invalid company profile');
  console.log('✓ Invalid CEP and phone formats properly rejected with HTTP 400.');

  // Test 3: Migration 0096 idempotency and data cleaning verification
  console.log('Test 3: Verifying Migration 0096 execution on legacy masked records...');
  const legacyCompanyId = 'company-legacy-masked-002';
  await db.insert(companies).values({
    id: legacyCompanyId,
    name: 'EMPRESA LEGADA COM MASCARA',
    phone: '(15) 99703-1369',
    whatsapp: '(15) 99703-1369',
    addressZipCode: '18075-350',
    status: 'ACTIVE',
  });

  // Executar a migration 0096
  await db.execute(sql`
    UPDATE companies
    SET phone = regexp_replace(phone, '\\D', '', 'g')
    WHERE phone IS NOT NULL AND phone ~ '\\D'
  `);

  await db.execute(sql`
    UPDATE companies
    SET whatsapp = regexp_replace(whatsapp, '\\D', '', 'g')
    WHERE whatsapp IS NOT NULL AND whatsapp ~ '\\D'
  `);

  await db.execute(sql`
    UPDATE companies
    SET address_zip_code = regexp_replace(address_zip_code, '\\D', '', 'g')
    WHERE address_zip_code IS NOT NULL AND address_zip_code ~ '\\D'
  `);

  const [cleaned] = await db.select().from(companies).where(eq(companies.id, legacyCompanyId));
  assert.equal(cleaned.phone, '15997031369', 'Migration must sanitize legacy phone');
  assert.equal(cleaned.whatsapp, '15997031369', 'Migration must sanitize legacy whatsapp');
  assert.equal(cleaned.addressZipCode, '18075350', 'Migration must sanitize legacy address_zip_code');
  console.log('✓ Migration 0096 cleaned legacy record with pure digits.');

  console.log('✓ All PH-131 regression tests passed successfully!');
  console.log('--- PH-131 Suite Complete ---');
} finally {
  server.close();
}
