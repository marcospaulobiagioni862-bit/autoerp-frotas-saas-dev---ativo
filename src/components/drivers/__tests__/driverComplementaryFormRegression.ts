import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express, { type Request, type Response as ExpressResponse, type NextFunction } from 'express';

// Forçar uso do PGlite para garantir suíte auto-contida, determinística e sem dependência de serviço externo
process.env.USE_PGLITE = 'true';
process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';

console.log('--- PH-057 + PH-059: Driver Intake & LGPD Form Regression Suite ---');

// 1. Static AST & File Assertions
console.log('1. Verifying migration and source files...');

const migrationPath = new URL('../../../../drizzle/0091_driver_form_tokens.sql', import.meta.url).pathname;
assert.ok(existsSync(migrationPath), 'Migration 0091_driver_form_tokens.sql must exist');
const migrationSql = readFileSync(migrationPath, 'utf8');

assert.match(migrationSql, /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?driver_form_tokens/i, 'Migration must create driver_form_tokens table');
assert.match(migrationSql, /token\s+(text|varchar)/i, 'driver_form_tokens must have token column');
assert.match(migrationSql, /driver_id\s+(text|uuid)/i, 'driver_form_tokens must have driver_id column');
assert.match(migrationSql, /company_id\s+(text|varchar)/i, 'driver_form_tokens must have company_id column');
assert.match(migrationSql, /expires_at\s+(timestamp|timestamptz)/i, 'driver_form_tokens must have expires_at column');
assert.match(migrationSql, /consumed_at\s+(timestamp|timestamptz)/i, 'driver_form_tokens must have consumed_at column');
assert.match(migrationSql, /opened_ip\s+(text|varchar)/i, 'driver_form_tokens must have opened_ip audit column');
assert.match(migrationSql, /consumed_ip\s+(text|varchar)/i, 'driver_form_tokens must have consumed_ip audit column');
assert.match(migrationSql, /controlled_medications\s+text/i, 'Migration must add controlled_medications to driver_health_profiles');
assert.match(migrationSql, /lgpd_consent_at\s+(timestamp|timestamptz)/i, 'Migration must add lgpd_consent_at to driver_health_profiles');
assert.match(migrationSql, /lgpd_consent_version\s+(text|varchar)/i, 'Migration must add lgpd_consent_version to driver_health_profiles');

const formTokenRoutesCode = readFileSync(new URL('../../../server/driverFormTokenRoutes.ts', import.meta.url), 'utf8');
assert.match(formTokenRoutesCode, /randomBytes\(32\)\.toString\('hex'\)/, 'Tokens must be generated with 32 random bytes (64 hex characters)');
assert.match(formTokenRoutesCode, /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'Token must expire in 24 hours');
assert.match(formTokenRoutesCode, /'EXPIRED'/, 'Server must handle EXPIRED with 410');
assert.match(formTokenRoutesCode, /'ALREADY_CONSUMED'/, 'Server must handle ALREADY_CONSUMED with 410');
assert.match(formTokenRoutesCode, /LGPD_CONSENT_REQUIRED/, 'driverFormTokenRoutes must require explicit LGPD consent for health submission');

const driverRoutesCode = readFileSync(new URL('../../../server/driverRoutes.ts', import.meta.url), 'utf8');
assert.match(driverRoutesCode, /LGPD_CONSENT_REQUIRED/, 'driverRoutes must require explicit LGPD consent on internal health routes');
assert.match(driverRoutesCode, /LGPD_HEALTH_CONSENT_VERSION/, 'driverRoutes must persist LGPD consent version on consent');

const publicPageCode = readFileSync(new URL('../../public/PublicDriverFormPage.tsx', import.meta.url), 'utf8');
assert.match(publicPageCode, /Dados da Habilitação/, 'Public form must render locked validated CNH card');
assert.match(publicPageCode, /Somente leitura/, 'Public form must mark CNH fields as read-only');
assert.match(publicPageCode, /residenceType/, 'Public form must contain structured residence fields');
assert.match(publicPageCode, /condominiumName/, 'Public form must contain condominiumName');
assert.match(publicPageCode, /controlledMedications/, 'Public form must contain controlledMedications');
assert.match(publicPageCode, /lgpdConsent/, 'Public form must contain informed LGPD consent checkbox');

const modalCode = readFileSync(new URL('../DriverDetailsModal.tsx', import.meta.url), 'utf8');
assert.match(modalCode, /Pedir dados \(wa\.me\)/, 'DriverDetailsModal must offer wa.me request button');
assert.match(modalCode, /Link Seguro de Coleta de Dados e Consentimento/, 'DriverDetailsModal must render shareable token modal');
assert.match(modalCode, /controlledMedications/, 'DriverDetailsModal must display controlled medications');
assert.match(modalCode, /Consentimento LGPD/, 'DriverDetailsModal must display LGPD consent status badge');

console.log('✓ Static file and AST assertions passed.');

// 2. Setup Database & HTTP Server with Real Express Routes
console.log('2. Bootstrapping isolated PGlite database and real Express server...');

const { db } = await import('../../../db/index.js');
const { sql, eq } = await import('drizzle-orm');
const { driverFormTokens, driverHealthProfiles, drivers } = await import('../../../db/schema.js');
const { registerDriverRoutes } = await import('../../../server/driverRoutes.js');
const { registerDriverFormTokenRoutes } = await import('../../../server/driverFormTokenRoutes.js');

// Criação do schema isolado para testes
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS drivers (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    name text NOT NULL,
    phone text,
    whatsapp text,
    email text,
    cpf text,
    rg text,
    birth_date date,
    marital_status text,
    profession text,
    mother_name text,
    pix_key text,
    address_street text,
    address_number text,
    address_complement text,
    address_neighborhood text,
    address_city text,
    address_state text,
    address_zip_code text,
    address_residence_type text,
    address_residence_type_other text,
    address_condominium_name text,
    address_block_tower text,
    address_unit text,
    address_floor text,
    address_reference text,
    cnh text,
    cnh_category text,
    cnh_expiration date,
    cnh_ear boolean,
    cnh_status text,
    app_platforms text[] NOT NULL DEFAULT ARRAY[]::text[],
    photo_url text,
    notes text,
    active boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'ACTIVE',
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS driver_health_profiles (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    driver_id text NOT NULL,
    blood_type text,
    allergies text,
    relevant_conditions text,
    continuous_medications text,
    controlled_medications text,
    emergency_contact_name text,
    emergency_contact_relationship text,
    emergency_contact_phone text,
    emergency_notes text,
    last_update_date timestamp,
    responsible_user text,
    lgpd_consent_at timestamp,
    lgpd_consent_version text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT driver_health_profiles_company_driver_unique UNIQUE (company_id, driver_id)
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS driver_form_tokens (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    driver_id text NOT NULL,
    token text NOT NULL UNIQUE,
    created_by text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    opened_at timestamptz,
    opened_ip text,
    consumed_ip text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS vehicles (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    plate text,
    brand text,
    model text,
    year integer,
    current_driver_id text,
    current_contract_id text,
    is_archived boolean NOT NULL DEFAULT false,
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

const testCompanyId = 'company-lgpd-test-001';
const adminUserId = 'user-admin-001';

const app = express();
app.use(express.json());

// Injeção de autenticação para rotas internas
app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
  (req as any).principal = {
    companyId: testCompanyId,
    userId: adminUserId,
    name: 'Admin LGPD Tester',
    role: 'ADMIN',
    permissions: ['VIEW_DRIVER', 'CREATE_DRIVER', 'EDIT_DRIVER', 'DELETE_DRIVER', 'VIEW_DRIVER_HEALTH', 'EDIT_DRIVER_HEALTH'],
  };
  next();
});

registerDriverRoutes(app);
registerDriverFormTokenRoutes(app);

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

async function insertTestDriver(id: string, name: string, cpf: string, cnh: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO drivers (
      id, company_id, name, cpf, cnh, active, birth_date, phone, whatsapp, email,
      address_street, address_number, address_neighborhood, address_city, address_state, address_zip_code,
      cnh_category, cnh_expiration, cnh_ear, status, is_archived, created_at, updated_at
    ) VALUES (
      ${id}, ${testCompanyId}, ${name}, ${cpf}, ${cnh}, true, '1990-01-01'::date, '11999999999', '11999999999', 'motorista@example.test',
      'Rua Inicial', '10', 'Centro', 'São Paulo', 'SP', '01001000',
      'B', '2035-01-01'::date, true, 'ACTIVE', false, now(), now()
    )
  `);
}

try {
  // Test 1: Token Unpredictability
  console.log('Test 1: Token unpredictability and entropy...');
  const tokens = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const token = randomBytes(32).toString('hex');
    assert.equal(token.length, 64, 'Token must be exactly 64 hex characters');
    assert.ok(/^[0-9a-f]{64}$/.test(token), 'Token must be valid hex');
    assert.ok(!tokens.has(token), 'Tokens must never collide');
    tokens.add(token);
  }
  console.log('✓ 1,000 generated tokens with zero collisions and high entropy.');

  // Test 2: Token Expiration (> 24h) via Real HTTP Route
  console.log('Test 2: Expiration logic (> 24h) via POST /api/public/driver-form/:token...');
  const expiredTokenId = randomUUID();
  const expiredTokenStr = randomBytes(32).toString('hex');
  await db.insert(driverFormTokens).values({
    id: expiredTokenId,
    companyId: testCompanyId,
    driverId: 'driver-test-expired',
    token: expiredTokenStr,
    createdBy: adminUserId,
    expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hora no passado
  });

  const resExpired = await request(`/api/public/driver-form/${expiredTokenStr}`, {
    method: 'POST',
    body: JSON.stringify({ address: { street: 'Rua Expirada', number: '10' } }),
  });
  assert.equal(resExpired.status, 410, 'Expired token must return HTTP 410');
  assert.equal(resExpired.body?.code, 'EXPIRED');
  console.log('✓ Real HTTP endpoint returned 410 EXPIRED.');

  // Test 3: Single-Use Burning via Real HTTP Route
  console.log('Test 3: Single-use burning via POST /api/public/driver-form/:token...');
  const consumedTokenId = randomUUID();
  const consumedTokenStr = randomBytes(32).toString('hex');
  await db.insert(driverFormTokens).values({
    id: consumedTokenId,
    companyId: testCompanyId,
    driverId: 'driver-test-consumed',
    token: consumedTokenStr,
    createdBy: adminUserId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    consumedAt: new Date(Date.now() - 60000).toISOString(), // consumido 1 min atrás
  });

  const resConsumed = await request(`/api/public/driver-form/${consumedTokenStr}`, {
    method: 'POST',
    body: JSON.stringify({ address: { street: 'Rua Consumida', number: '20' } }),
  });
  assert.equal(resConsumed.status, 410, 'Consumed token must return HTTP 410');
  assert.equal(resConsumed.body?.code, 'ALREADY_CONSUMED');
  console.log('✓ Real HTTP endpoint returned 410 ALREADY_CONSUMED.');

  // Test 4: Server-Side Binding / Anti-Spoofing via Real HTTP Route
  console.log('Test 4: Server-side driver binding and anti-spoofing via Real HTTP Route...');
  const boundDriverId = randomUUID();
  await insertTestDriver(boundDriverId, 'Motorista Legítimo do Token', '52998224725', '12345678900');

  const boundTokenId = randomUUID();
  const boundTokenStr = randomBytes(32).toString('hex');
  await db.insert(driverFormTokens).values({
    id: boundTokenId,
    companyId: testCompanyId,
    driverId: boundDriverId,
    token: boundTokenStr,
    createdBy: adminUserId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  // Requisição maliciosa tenta alterar driverId para outra vítima
  const resSpoof = await request(`/api/public/driver-form/${boundTokenStr}`, {
    method: 'POST',
    body: JSON.stringify({
      driverId: 'driver-victim-hacked-999',
      address: {
        street: 'Avenida Anti Spoofing',
        number: '500',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310100',
        residenceType: 'HOUSE',
      },
    }),
  });
  assert.equal(resSpoof.status, 200, 'Submission must succeed on bound token');
  const streetRes = await db.execute(sql`SELECT address_street FROM drivers WHERE id = ${boundDriverId}`);
  assert.equal((streetRes.rows[0] as any)?.address_street, 'Avenida Anti Spoofing', 'Must update legit driver bound to token');

  // Test 5: LGPD Consent Server-Side Enforcement (PH-059)
  console.log('Test 5: LGPD consent server-side enforcement on ALL routes...');

  const baseDriverPayload = {
    fullName: 'Motorista LGPD Teste',
    cpf: '52998224725',
    rg: '123456789',
    birthDate: '1990-01-01',
    phone: '11999999999',
    whatsapp: '11999999999',
    email: 'motorista.lgpd@example.test',
    maritalStatus: 'Solteiro',
    profession: 'Motorista',
    motherName: 'Maria da Silva',
    pixKey: '52998224725',
    cnhNumber: '12345678900',
    cnhCategory: 'B',
    cnhExpiration: '2035-01-01',
    cnhEar: true,
    address: {
      street: 'Rua da Saúde',
      number: '123',
      neighborhood: 'Jardins',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01414000',
      residenceType: 'HOUSE',
    },
  };

  // 5a. Rota Interna POST /api/drivers com dados de saúde SEM consentimento => 400 LGPD_CONSENT_REQUIRED
  console.log('5a. POST /api/drivers with health data without LGPD consent...');
  const resInternalCreateNoConsent = await request('/api/drivers', {
    method: 'POST',
    body: JSON.stringify({
      ...baseDriverPayload,
      cpf: '12345678909',
      cnhNumber: '10000000091',
      health: {
        bloodType: 'AB+',
        allergies: 'Dipirona e Penicilina',
      },
      lgpdConsent: false,
    }),
  });
  assert.equal(resInternalCreateNoConsent.status, 400, 'Must refuse health creation without LGPD consent');
  assert.equal(resInternalCreateNoConsent.body?.code, 'LGPD_CONSENT_REQUIRED', 'Code must be LGPD_CONSENT_REQUIRED');
  console.log('✓ Internal POST /api/drivers blocked without LGPD consent with HTTP 400 LGPD_CONSENT_REQUIRED.');

  // 5b. Rota Interna POST /api/drivers com dados de saúde E consentimento => 201 Created e grava consentimento
  console.log('5b. POST /api/drivers with health data WITH explicit LGPD consent...');
  const resInternalCreateWithConsent = await request('/api/drivers', {
    method: 'POST',
    body: JSON.stringify({
      ...baseDriverPayload,
      cpf: '98765432100',
      cnhNumber: '10000000108',
      health: {
        bloodType: 'AB+',
        allergies: 'Dipirona e Penicilina',
        emergencyContactName: 'Maria Contato',
        emergencyContactRelationship: 'Mãe',
        emergencyContactPhone: '11988887777',
      },
      lgpdConsent: true,
    }),
  });
  assert.equal(resInternalCreateWithConsent.status, 201, 'Must create driver with LGPD consent');
  const createdDriverId = resInternalCreateWithConsent.body?.item?.id;
  assert.ok(createdDriverId, 'Created driver must have an ID');

  const [savedHealthProfile] = await db.select().from(driverHealthProfiles).where(eq(driverHealthProfiles.driverId, createdDriverId));
  assert.ok(savedHealthProfile, 'Health profile must be recorded in database');
  assert.ok(savedHealthProfile.lgpdConsentAt, 'lgpdConsentAt must be populated in database');
  assert.equal(savedHealthProfile.lgpdConsentVersion, '1.0', 'lgpdConsentVersion must be 1.0');
  console.log('✓ Internal POST /api/drivers persisted health data and recorded LGPD consent in database.');

  // 5c. Rota Interna PUT /api/drivers/:id/health SEM consentimento prévio => 400 LGPD_CONSENT_REQUIRED
  console.log('5c. PUT /api/drivers/:id/health with health data without LGPD consent...');
  // Cria motorista sem dados de saúde (sem consentimento)
  const driverWithoutHealthId = randomUUID();
  await insertTestDriver(driverWithoutHealthId, 'Motorista Sem Saúde Previa', '11144477735', '10000000208');

  const resInternalPutNoConsent = await request(`/api/drivers/${driverWithoutHealthId}/health`, {
    method: 'PUT',
    body: JSON.stringify({
      health: {
        controlledMedications: 'Clonazepam 2mg',
      },
      lgpdConsent: false,
    }),
  });
  assert.equal(resInternalPutNoConsent.status, 400, 'Must refuse internal health update without LGPD consent');
  assert.equal(resInternalPutNoConsent.body?.code, 'LGPD_CONSENT_REQUIRED', 'Code must be LGPD_CONSENT_REQUIRED');
  console.log('✓ Internal PUT /api/drivers/:id/health blocked without LGPD consent with HTTP 400 LGPD_CONSENT_REQUIRED.');

  // 5d. Rota Interna PUT /api/drivers/:id/health COM consentimento => 200 OK e grava consentimento
  // Invariante de Segurança: Cliente tenta forjar data e versão do consentimento -> Servidor é autoritativo (now e 1.0)
  console.log('5d. PUT /api/drivers/:id/health with health data WITH explicit LGPD consent and anti-tamper check...');
  const resInternalPutWithConsent = await request(`/api/drivers/${driverWithoutHealthId}/health`, {
    method: 'PUT',
    body: JSON.stringify({
      health: {
        controlledMedications: 'Clonazepam 2mg',
        lgpdConsentAt: '2020-01-01T00:00:00.000Z',
        lgpdConsentVersion: 'v0.0-inexistente',
      },
      lgpdConsent: true,
    }),
  });
  assert.equal(resInternalPutWithConsent.status, 200, 'Must succeed when LGPD consent is given');
  const [updatedHealthProfile] = await db.select().from(driverHealthProfiles).where(eq(driverHealthProfiles.driverId, driverWithoutHealthId));
  assert.ok(updatedHealthProfile, 'Health profile must be recorded in database');
  assert.equal(updatedHealthProfile.controlledMedications, 'Clonazepam 2mg');
  assert.ok(updatedHealthProfile.lgpdConsentAt, 'lgpdConsentAt must be populated in database');
  assert.notEqual(updatedHealthProfile.lgpdConsentAt, '2020-01-01T00:00:00.000Z', 'Must reject client-forged consent date');
  assert.equal(updatedHealthProfile.lgpdConsentVersion, '1.0', 'lgpdConsentVersion must strictly be authoritative 1.0, rejecting forged client version');
  console.log('✓ Internal PUT /api/drivers/:id/health persisted health data and enforced authoritative server consent date and version 1.0.');

  // 5e. Rota Pública POST /api/public/driver-form/:token com dados de saúde SEM consentimento => 400 LGPD_CONSENT_REQUIRED
  console.log('5e. POST /api/public/driver-form/:token with health data without LGPD consent...');
  const publicDriverId = randomUUID();
  await insertTestDriver(publicDriverId, 'Motorista Form Publico', '22233344405', '10000000316');

  const publicTokenId = randomUUID();
  const publicTokenStr = randomBytes(32).toString('hex');
  await db.insert(driverFormTokens).values({
    id: publicTokenId,
    companyId: testCompanyId,
    driverId: publicDriverId,
    token: publicTokenStr,
    createdBy: adminUserId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  const resPublicNoConsent = await request(`/api/public/driver-form/${publicTokenStr}`, {
    method: 'POST',
    body: JSON.stringify({
      address: { street: 'Rua Externa', number: '10' },
      health: {
        continuousMedications: 'Losartana 50mg',
      },
      lgpdConsent: false,
    }),
  });
  assert.equal(resPublicNoConsent.status, 400, 'Public form must refuse health data without LGPD consent');
  assert.equal(resPublicNoConsent.body?.code, 'LGPD_CONSENT_REQUIRED');
  console.log('✓ Public form blocked without LGPD consent with HTTP 400 LGPD_CONSENT_REQUIRED.');

  // 5f. Rota Pública POST /api/public/driver-form/:token com dados de saúde COM consentimento => 200 OK
  console.log('5f. POST /api/public/driver-form/:token with health data WITH explicit LGPD consent...');
  const resPublicWithConsent = await request(`/api/public/driver-form/${publicTokenStr}`, {
    method: 'POST',
    body: JSON.stringify({
      address: { street: 'Rua Externa', number: '10' },
      health: {
        continuousMedications: 'Losartana 50mg',
      },
      lgpdConsent: true,
    }),
  });
  assert.equal(resPublicWithConsent.status, 200, 'Public form must succeed with LGPD consent');
  const [publicHealth] = await db.select().from(driverHealthProfiles).where(eq(driverHealthProfiles.driverId, publicDriverId));
  assert.ok(publicHealth, 'Public health profile must be recorded in database');
  assert.equal(publicHealth.continuousMedications, 'Losartana 50mg');
  assert.ok(publicHealth.lgpdConsentAt, 'lgpdConsentAt must be populated in database');
  assert.equal(publicHealth.lgpdConsentVersion, '1.0', 'lgpdConsentVersion must be 1.0');
  console.log('✓ Public form persisted health data and recorded LGPD consent in database.');

  // 5g. Rota pública sem dados de saúde não exige consentimento LGPD
  console.log('5g. POST /api/public/driver-form/:token without health data does not require LGPD consent...');
  const addressOnlyDriverId = randomUUID();
  await insertTestDriver(addressOnlyDriverId, 'Motorista Sem Saúde Form Publico', '33344455508', '10000000424');

  const addressOnlyTokenId = randomUUID();
  const addressOnlyTokenStr = randomBytes(32).toString('hex');
  await db.insert(driverFormTokens).values({
    id: addressOnlyTokenId,
    companyId: testCompanyId,
    driverId: addressOnlyDriverId,
    token: addressOnlyTokenStr,
    createdBy: adminUserId,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });

  const resAddressOnly = await request(`/api/public/driver-form/${addressOnlyTokenStr}`, {
    method: 'POST',
    body: JSON.stringify({
      address: { street: 'Rua Apenas Endereço', number: '99' },
      health: undefined,
      lgpdConsent: false,
    }),
  });
  assert.equal(resAddressOnly.status, 200, 'Public form submission without health data succeeds without consent');
  console.log('✓ Public form submission without health data succeeded without requiring LGPD consent.');

  console.log('✓ All 5 security and business test cases passed successfully via real HTTP routes!');
  console.log('--- PH-057 + PH-059 Suite Complete ---');
} finally {
  server.close();
}
