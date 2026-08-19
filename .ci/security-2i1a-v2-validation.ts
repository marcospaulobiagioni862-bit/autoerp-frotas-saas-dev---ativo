import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { hashPassword } from '../src/server/password';

const adminUrl = 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_ci';
const appUrl = 'postgres://autoerp_i1a_app:autoerp_i1a_pass@127.0.0.1:5432/autoerp_ci';
const base = 'http://127.0.0.1:3000';
const password = 'StrongPass123!';

const createPayload = {
  plate: 'abc-1d23',
  renavam: '11111111111',
  brand: 'Chevrolet',
  model: 'Onix',
  version: 'LT',
  yearFabrication: 2025,
  yearModel: 2026,
  color: 'Branco',
  chassis: '9bg123xyz',
  currentKm: 120,
  nextMaintenanceKm: 10000,
  fuelType: 'Flex',
  category: 'Hatch',
  acquisitionValue: 72000,
  currentValue: 68000,
  rentalValueBase: 850,
  notes: 'Cadastro I1A',
};

async function seed() {
  const pool = new Pool({ connectionString: adminUrl });
  for (const file of [
    'drizzle/0000_milky_invisible_woman.sql',
    'drizzle/0001_rls_and_audit.sql',
    'drizzle/0002_phase1_final_hardening.sql',
    'drizzle/0003_auth_credentials.sql',
    'drizzle/0004_payment_methods_rls_permissive.sql',
    'drizzle/0005_financial_periods_rls_permissive.sql',
    'drizzle/0006_security_deposit_authority.sql',
    'drizzle/0007_driver_health_profiles.sql',
    'drizzle/0008_vehicle_core_authority.sql',
  ]) {
    await pool.query(fs.readFileSync(file, 'utf8'));
  }

  await pool.query(`INSERT INTO companies(id,document,name,status) VALUES
    ('company-i1a-a','61616161000161','Tenant I1A A','ACTIVE'),
    ('company-i1a-b','62626262000162','Tenant I1A B','ACTIVE')`);
  await pool.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('i1a-admin-a','company-i1a-a','Admin I1A A','admin-a@i1a.test','ADMIN',true,ARRAY['*']),
    ('i1a-readonly-a','company-i1a-a','Readonly I1A A','readonly-a@i1a.test','READONLY',true,ARRAY[]::text[]),
    ('i1a-admin-b','company-i1a-b','Admin I1A B','admin-b@i1a.test','ADMIN',true,ARRAY['*'])`);

  const hashes = await Promise.all([password, password, password].map(hashPassword));
  const ids = ['i1a-admin-a', 'i1a-readonly-a', 'i1a-admin-b'];
  const companies = ['company-i1a-a', 'company-i1a-a', 'company-i1a-b'];
  for (let i = 0; i < ids.length; i++) {
    await pool.query(
      `INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES ($1,$2,$3)`,
      [companies[i], ids[i], hashes[i]]
    );
  }

  await pool.query(`CREATE ROLE autoerp_i1a_app LOGIN PASSWORD 'autoerp_i1a_pass'`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO autoerp_i1a_app`);
  await pool.query(`GRANT SELECT ON companies,users,user_credentials TO autoerp_i1a_app`);
  await pool.query(`GRANT SELECT,INSERT,UPDATE ON vehicles TO autoerp_i1a_app`);
  await pool.query(`GRANT INSERT ON audit_logs TO autoerp_i1a_app`);
  await pool.end();
}

async function login(document: string, email: string): Promise<string> {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyDocument: document, email, password }),
  });
  if (response.status !== 200) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error(`cookie missing for ${email}`);
  return cookie.split(';')[0];
}

async function request(method: string, path: string, cookie: string | null, body?: unknown) {
  return await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<any> {
  return await response.json();
}

async function verifyDatabasePolicyAndRls() {
  const admin = new Pool({ connectionString: adminUrl });
  let q = await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='vehicles'`);
  if (q.rowCount !== 1 || q.rows[0].relrowsecurity !== true || q.rows[0].relforcerowsecurity !== true) {
    throw new Error('vehicles RLS/FORCE missing');
  }
  q = await admin.query(`SELECT permissive,qual,with_check FROM pg_policies WHERE tablename='vehicles' AND policyname='tenant_isolation_ve'`);
  if (q.rowCount !== 1 || q.rows[0].permissive !== 'PERMISSIVE' || !q.rows[0].qual || !q.rows[0].with_check) {
    throw new Error('vehicles permissive USING/WITH CHECK policy missing');
  }
  await admin.end();

  const app = new Pool({ connectionString: appUrl });
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant','company-i1a-a',true)`);
    q = await client.query(`SELECT DISTINCT company_id FROM vehicles ORDER BY company_id`);
    if (q.rows.some((row) => row.company_id !== 'company-i1a-a')) throw new Error('direct RLS SELECT tenant leak');
    await client.query('ROLLBACK');

    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_tenant','company-i1a-a',true)`);
    let blocked = false;
    try {
      await client.query(`INSERT INTO vehicles(id,company_id,plate,renavam,status) VALUES ('i1a-rls-forge','company-i1a-b','RLS1A23','99999999999','AVAILABLE')`);
    } catch {
      blocked = true;
    }
    await client.query('ROLLBACK');
    if (!blocked) throw new Error('RLS WITH CHECK accepted forged tenant insert');
  } finally {
    client.release();
    await app.end();
  }
  console.log('I1A_POSTGRES16_RLS_POLICY=PASS');
}

async function main() {
  await seed();
  let logs = '';
  const server = spawn('node', ['dist/server.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      USE_PGLITE: 'false',
      ALLOW_MOCK_AUTH: 'false',
      DATABASE_URL: appUrl,
      JWT_SECRET: 'security-2i1a-ci-secret-at-least-32-bytes',
      JWT_ISSUER: 'autoerp-ci',
      JWT_AUDIENCE: 'autoerp-users',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (data) => logs += String(data));
  server.stderr?.on('data', (data) => logs += String(data));

  try {
    for (let i = 0; i < 40; i++) {
      try {
        const response = await fetch(base + '/api/auth/me');
        if (response.status === 401) break;
      } catch {}
      if (i === 39) throw new Error('server not ready ' + logs);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    let response = await request('GET', '/api/fleet/vehicles', null);
    if (response.status !== 401) throw new Error(`LIST no session ${response.status}`);
    response = await request('POST', '/api/fleet/vehicles', null, createPayload);
    if (response.status !== 401) throw new Error(`CREATE no session ${response.status}`);
    console.log('I1A_NO_SESSION=PASS');

    const adminA = await login('61616161000161', 'admin-a@i1a.test');
    const readonlyA = await login('61616161000161', 'readonly-a@i1a.test');
    const adminB = await login('62626262000162', 'admin-b@i1a.test');
    console.log('I1A_LOGIN=PASS');

    response = await request('POST', '/api/fleet/vehicles', adminA, {
      ...createPayload,
      companyId: 'company-i1a-b',
      userId: 'forged-user',
      userName: 'Forged User',
      role: 'ADMIN',
      status: 'SOLD',
      isArchived: true,
      currentDriverId: 'forged-driver',
      currentContractId: 'forged-contract',
    });
    if (response.status !== 201) throw new Error(`tenant A CREATE ${response.status} ${await response.text()}`);
    const createdA = (await json(response)).item;
    if (createdA.companyId !== 'company-i1a-a' || createdA.plate !== 'ABC1D23' || createdA.status !== 'AVAILABLE' || createdA.isArchived !== false) {
      throw new Error('server create authority/normalization failure');
    }
    if (createdA.currentDriverId || createdA.currentContractId) throw new Error('browser linked authority leaked into create');
    console.log('I1A_CREATE_SERVER_AUTHORITY=PASS');

    response = await request('POST', '/api/fleet/vehicles', adminB, createPayload);
    if (response.status !== 201) throw new Error(`tenant B same identity CREATE ${response.status} ${await response.text()}`);
    const createdB = (await json(response)).item;
    if (createdB.companyId !== 'company-i1a-b') throw new Error('tenant B company mismatch');
    console.log('I1A_TENANT_SCOPED_UNIQUENESS=PASS');

    response = await request('GET', '/api/fleet/vehicles', adminA);
    if (response.status !== 200) throw new Error(`tenant A LIST ${response.status}`);
    let payload = await json(response);
    if (payload.items.length !== 1 || payload.items[0].id !== createdA.id || JSON.stringify(payload).includes(createdB.id)) throw new Error('tenant A list leak');
    response = await request('GET', `/api/fleet/vehicles/${createdB.id}`, adminA);
    if (response.status !== 404) throw new Error(`cross tenant GET ${response.status}`);
    console.log('I1A_TENANT_ISOLATION=PASS');

    response = await request('GET', '/api/fleet/vehicles', readonlyA);
    if (response.status !== 200) throw new Error(`readonly LIST ${response.status}`);
    response = await request('POST', '/api/fleet/vehicles', readonlyA, { ...createPayload, plate: 'DEF2G34', renavam: '22222222222' });
    if (response.status !== 403) throw new Error(`readonly CREATE ${response.status}`);
    response = await request('PATCH', `/api/fleet/vehicles/${createdA.id}`, readonlyA, { brand: 'Blocked' });
    if (response.status !== 403) throw new Error(`readonly UPDATE ${response.status}`);
    response = await request('PATCH', `/api/fleet/vehicles/${createdA.id}/status`, readonlyA, { status: 'MAINTENANCE' });
    if (response.status !== 403) throw new Error(`readonly STATUS ${response.status}`);
    console.log('I1A_READONLY_RBAC=PASS');

    response = await request('POST', '/api/fleet/vehicles', adminA, { ...createPayload, plate: 'abc-1d23', renavam: '22222222222' });
    if (response.status !== 409) throw new Error(`duplicate plate ${response.status}`);
    response = await request('POST', '/api/fleet/vehicles', adminA, { ...createPayload, plate: 'DEF2G34', renavam: '11111111111' });
    if (response.status !== 409) throw new Error(`duplicate renavam ${response.status}`);
    response = await request('POST', '/api/fleet/vehicles', adminA, { ...createPayload, plate: 'DEF2G34', renavam: '22222222222', brand: '' });
    if (response.status !== 400) throw new Error(`missing brand validation ${response.status}`);
    response = await request('POST', '/api/fleet/vehicles', adminA, { ...createPayload, plate: 'DEF2G34', renavam: '22222222222', currentKm: -1 });
    if (response.status !== 400) throw new Error(`negative KM validation ${response.status}`);
    console.log('I1A_CREATE_VALIDATION=PASS');

    response = await request('PATCH', `/api/fleet/vehicles/${createdA.id}`, adminA, {
      brand: 'GM',
      currentKm: 150,
      nextMaintenanceKm: 12000,
      currentValue: 67000,
      companyId: 'company-i1a-b',
      userId: 'forged-user-2',
      userName: 'Forged User 2',
      status: 'SOLD',
      isArchived: true,
      currentDriverId: 'forged-driver-2',
      currentContractId: 'forged-contract-2',
    });
    if (response.status !== 200) throw new Error(`valid UPDATE ${response.status} ${await response.text()}`);
    const updatedA = (await json(response)).item;
    if (updatedA.brand !== 'GM' || updatedA.currentKm !== 150 || updatedA.companyId !== 'company-i1a-a' || updatedA.status !== 'AVAILABLE' || updatedA.isArchived !== false || updatedA.currentDriverId || updatedA.currentContractId) {
      throw new Error('UPDATE authority or values failure');
    }
    response = await request('PATCH', `/api/fleet/vehicles/${createdA.id}`, adminA, { currentKm: -2 });
    if (response.status !== 400) throw new Error(`negative UPDATE KM ${response.status}`);
    response = await request('PATCH', `/api/fleet/vehicles/${createdB.id}`, adminA, { brand: 'CrossTenant' });
    if (response.status !== 404) throw new Error(`cross tenant UPDATE ${response.status}`);
    console.log('I1A_UPDATE_AUTHORITY_VALIDATION=PASS');

    response = await request('PATCH', `/api/fleet/vehicles/${createdA.id}/status`, adminA, { status: 'FLYING' });
    if (response.status !== 400) throw new Error(`invalid status ${response.status}`);
    response = await request('PATCH', `/api/fleet/vehicles/${createdA.id}/status`, adminA, { status: 'MAINTENANCE', reason: 'Oficina' });
    if (response.status !== 200 || (await json(response)).item.status !== 'MAINTENANCE') throw new Error('valid status failure');
    response = await request('PATCH', `/api/fleet/vehicles/${createdB.id}/status`, adminA, { status: 'MAINTENANCE' });
    if (response.status !== 404) throw new Error(`cross tenant STATUS ${response.status}`);
    console.log('I1A_STATUS=PASS');

    const db = new Pool({ connectionString: adminUrl });
    let q = await db.query(`SELECT user_id,changes FROM audit_logs WHERE company_id='company-i1a-a' AND entity_type='Vehicle' ORDER BY timestamp`);
    if ((q.rowCount || 0) < 3) throw new Error('vehicle audit rows missing');
    const auditText = JSON.stringify(q.rows);
    if (q.rows.some((row) => row.user_id !== 'i1a-admin-a')) throw new Error('audit principal mismatch');
    if (!auditText.includes('Admin I1A A') || auditText.includes('Forged User') || auditText.includes('forged-user')) throw new Error('audit browser identity leak');
    console.log('I1A_AUDIT_SERVER_PRINCIPAL=PASS');

    await db.query(`CREATE OR REPLACE FUNCTION i1a_fail_vehicle_audit() RETURNS trigger AS $$ BEGIN IF NEW.entity_type='Vehicle' THEN RAISE EXCEPTION 'forced vehicle audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER i1a_fail_vehicle_audit_trigger BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION i1a_fail_vehicle_audit()`);
    response = await request('POST', '/api/fleet/vehicles', adminA, { ...createPayload, plate: 'GHI3J45', renavam: '33333333333' });
    if (response.status === 200 || response.status === 201) throw new Error('forced audit failure committed');
    await db.query(`DROP TRIGGER i1a_fail_vehicle_audit_trigger ON audit_logs`);
    await db.query(`DROP FUNCTION i1a_fail_vehicle_audit()`);
    q = await db.query(`SELECT count(*)::int AS c FROM vehicles WHERE company_id='company-i1a-a' AND plate='GHI3J45'`);
    if (q.rows[0].c !== 0) throw new Error('vehicle write did not rollback after audit failure');
    await db.end();
    console.log('I1A_ATOMIC_AUDIT_ROLLBACK=PASS');

    await verifyDatabasePolicyAndRls();
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('I1A_VALIDATION_FATAL', error);
  process.exit(2);
});
