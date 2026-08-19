import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { hashPassword } from '../src/server/password';

const adminUrl = 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_ci';
const appUrl = 'postgres://autoerp_i1a_final:autoerp_i1a_final_pass@127.0.0.1:5432/autoerp_ci';
const base = 'http://127.0.0.1:3000';
const password = 'StrongPass123!';

const baseVehicle = {
  plate: 'xyz-9k87',
  renavam: '77777777777',
  brand: 'Toyota',
  model: 'Yaris',
  version: 'XS',
  yearFabrication: 2025,
  yearModel: 2026,
  color: 'Prata',
  chassis: '9brfinal123',
  currentKm: 42,
  nextMaintenanceKm: 10000,
  fuelType: 'Flex',
  category: 'Hatch',
  acquisitionValue: 90000,
  currentValue: 86000,
  rentalValueBase: 900,
  notes: 'I1A final validation',
};

async function seed() {
  const db = new Pool({ connectionString: adminUrl });
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
  ]) await db.query(fs.readFileSync(file, 'utf8'));

  await db.query(`INSERT INTO companies(id,document,name,status) VALUES
    ('company-i1a-final-a','71717171000171','I1A Final A','ACTIVE'),
    ('company-i1a-final-b','72727272000172','I1A Final B','ACTIVE')`);
  await db.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('i1a-final-admin-a','company-i1a-final-a','Final Admin A','final-admin-a@i1a.test','ADMIN',true,ARRAY['*']),
    ('i1a-final-readonly-a','company-i1a-final-a','Final Readonly A','final-readonly-a@i1a.test','READONLY',true,ARRAY[]::text[]),
    ('i1a-final-admin-b','company-i1a-final-b','Final Admin B','final-admin-b@i1a.test','ADMIN',true,ARRAY['*'])`);
  const hashes = await Promise.all([password, password, password].map(hashPassword));
  for (const [companyId, userId, hash] of [
    ['company-i1a-final-a', 'i1a-final-admin-a', hashes[0]],
    ['company-i1a-final-a', 'i1a-final-readonly-a', hashes[1]],
    ['company-i1a-final-b', 'i1a-final-admin-b', hashes[2]],
  ]) await db.query('INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES ($1,$2,$3)', [companyId, userId, hash]);

  await db.query(`CREATE ROLE autoerp_i1a_final LOGIN PASSWORD 'autoerp_i1a_final_pass'`);
  await db.query(`GRANT USAGE ON SCHEMA public TO autoerp_i1a_final`);
  await db.query(`GRANT SELECT ON companies,users,user_credentials TO autoerp_i1a_final`);
  await db.query(`GRANT SELECT,INSERT,UPDATE ON vehicles TO autoerp_i1a_final`);
  await db.query(`GRANT INSERT ON audit_logs TO autoerp_i1a_final`);
  await db.end();
}

async function login(document: string, email: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyDocument: document, email, password }),
  });
  if (response.status !== 200) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('session cookie missing');
  return cookie.split(';')[0];
}

async function req(method: string, path: string, cookie?: string, body?: unknown) {
  return fetch(base + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
      JWT_SECRET: 'security-2i1a-final-secret-at-least-32-bytes',
      JWT_ISSUER: 'autoerp-ci',
      JWT_AUDIENCE: 'autoerp-users',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', d => logs += String(d));
  server.stderr?.on('data', d => logs += String(d));

  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(`${base}/api/auth/me`)).status === 401) break; } catch {}
      if (i === 39) throw new Error(`server not ready ${logs}`);
      await new Promise(r => setTimeout(r, 500));
    }

    let r = await req('GET', '/api/fleet/vehicles');
    if (r.status !== 401) throw new Error(`no-session LIST ${r.status}`);
    r = await req('POST', '/api/fleet/vehicles', undefined, baseVehicle);
    if (r.status !== 401) throw new Error(`no-session CREATE ${r.status}`);
    console.log('FINAL_I1A_AUTH_REQUIRED=PASS');

    const adminA = await login('71717171000171', 'final-admin-a@i1a.test');
    const readonlyA = await login('71717171000171', 'final-readonly-a@i1a.test');
    const adminB = await login('72727272000172', 'final-admin-b@i1a.test');

    r = await req('POST', '/api/fleet/vehicles', adminA, {
      ...baseVehicle,
      companyId: 'company-i1a-final-b', userId: 'forged', userName: 'Forged', role: 'ADMIN',
      status: 'SOLD', isArchived: true, currentDriverId: 'forged-driver', currentContractId: 'forged-contract',
    });
    if (r.status !== 201) throw new Error(`A create ${r.status} ${await r.text()}`);
    const a = (await r.json()).item;
    if (a.companyId !== 'company-i1a-final-a' || a.plate !== 'XYZ9K87' || a.status !== 'AVAILABLE' || a.isArchived !== false || a.currentDriverId || a.currentContractId) {
      throw new Error('server authority create failed');
    }

    r = await req('POST', '/api/fleet/vehicles', adminB, baseVehicle);
    if (r.status !== 201) throw new Error(`B same plate/renavam ${r.status} ${await r.text()}`);
    const b = (await r.json()).item;
    if (b.companyId !== 'company-i1a-final-b') throw new Error('tenant B authority failed');
    console.log('FINAL_I1A_TENANT_UNIQUENESS=PASS');

    r = await req('GET', '/api/fleet/vehicles', adminA);
    const listA = await r.json();
    if (r.status !== 200 || listA.items.length !== 1 || listA.items[0].id !== a.id || JSON.stringify(listA).includes(b.id)) throw new Error('tenant list isolation failed');
    r = await req('GET', `/api/fleet/vehicles/${b.id}`, adminA);
    if (r.status !== 404) throw new Error(`cross-tenant get ${r.status}`);
    console.log('FINAL_I1A_TENANT_ISOLATION=PASS');

    r = await req('GET', '/api/fleet/vehicles', readonlyA);
    if (r.status !== 200) throw new Error(`readonly list ${r.status}`);
    r = await req('POST', '/api/fleet/vehicles', readonlyA, { ...baseVehicle, plate: 'AAA1B23', renavam: '88888888888' });
    if (r.status !== 403) throw new Error(`readonly create ${r.status}`);
    r = await req('PATCH', `/api/fleet/vehicles/${a.id}`, readonlyA, { brand: 'Blocked' });
    if (r.status !== 403) throw new Error(`readonly update ${r.status}`);
    r = await req('PATCH', `/api/fleet/vehicles/${a.id}/status`, readonlyA, { status: 'MAINTENANCE' });
    if (r.status !== 403) throw new Error(`readonly status ${r.status}`);
    console.log('FINAL_I1A_RBAC=PASS');

    r = await req('POST', '/api/fleet/vehicles', adminA, { ...baseVehicle, renavam: '88888888888' });
    if (r.status !== 409) throw new Error(`same tenant duplicate plate ${r.status}`);
    r = await req('POST', '/api/fleet/vehicles', adminA, { ...baseVehicle, plate: 'AAA1B23' });
    if (r.status !== 409) throw new Error(`same tenant duplicate renavam ${r.status}`);
    r = await req('POST', '/api/fleet/vehicles', adminA, { ...baseVehicle, plate: 'AAA1B23', renavam: '88888888888', currentKm: -1 });
    if (r.status !== 400) throw new Error(`negative km create ${r.status}`);
    console.log('FINAL_I1A_VALIDATION=PASS');

    r = await req('PATCH', `/api/fleet/vehicles/${a.id}`, adminA, {
      brand: 'Toyota BR', currentKm: 50, currentValue: 85000,
      companyId: 'company-i1a-final-b', status: 'SOLD', isArchived: true, userName: 'Forged 2', currentDriverId: 'x',
    });
    if (r.status !== 200) throw new Error(`update ${r.status} ${await r.text()}`);
    const updated = (await r.json()).item;
    if (updated.brand !== 'Toyota BR' || updated.currentKm !== 50 || updated.companyId !== 'company-i1a-final-a' || updated.status !== 'AVAILABLE' || updated.isArchived !== false || updated.currentDriverId) throw new Error('update authority failed');
    r = await req('PATCH', `/api/fleet/vehicles/${a.id}`, adminA, { currentValue: -1 });
    if (r.status !== 400) throw new Error(`negative update ${r.status}`);

    r = await req('PATCH', `/api/fleet/vehicles/${a.id}/status`, adminA, { status: 'MAINTENANCE', reason: 'Final gate' });
    if (r.status !== 200 || (await r.json()).item.status !== 'MAINTENANCE') throw new Error('status mutation failed');
    r = await req('PATCH', `/api/fleet/vehicles/${b.id}/status`, adminA, { status: 'MAINTENANCE' });
    if (r.status !== 404) throw new Error(`cross tenant status ${r.status}`);
    console.log('FINAL_I1A_UPDATE_STATUS=PASS');

    const db = new Pool({ connectionString: adminUrl });
    let q = await db.query(`SELECT user_id,changes FROM audit_logs WHERE company_id='company-i1a-final-a' AND entity_type='Vehicle' ORDER BY timestamp`);
    if ((q.rowCount || 0) < 3 || q.rows.some(row => row.user_id !== 'i1a-final-admin-a')) throw new Error('audit principal mismatch');
    const audit = JSON.stringify(q.rows);
    if (!audit.includes('Final Admin A') || audit.includes('Forged') || audit.includes('forged')) throw new Error('browser identity leaked to audit');
    console.log('FINAL_I1A_AUDIT_PRINCIPAL=PASS');

    await db.query(`CREATE OR REPLACE FUNCTION final_i1a_fail_audit() RETURNS trigger AS $$ BEGIN IF NEW.entity_type='Vehicle' THEN RAISE EXCEPTION 'forced vehicle audit fail'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER final_i1a_fail_audit_trigger BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION final_i1a_fail_audit()`);
    r = await req('POST', '/api/fleet/vehicles', adminA, { ...baseVehicle, plate: 'BBB2C34', renavam: '99999999999' });
    if (r.status === 200 || r.status === 201) throw new Error('audit failure committed');
    await db.query(`DROP TRIGGER final_i1a_fail_audit_trigger ON audit_logs`);
    await db.query(`DROP FUNCTION final_i1a_fail_audit()`);
    q = await db.query(`SELECT count(*)::int c FROM vehicles WHERE company_id='company-i1a-final-a' AND plate='BBB2C34'`);
    if (q.rows[0].c !== 0) throw new Error('vehicle did not rollback with audit');
    console.log('FINAL_I1A_ATOMIC_ROLLBACK=PASS');

    q = await db.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='vehicles'`);
    if (q.rowCount !== 1 || !q.rows[0].relrowsecurity || !q.rows[0].relforcerowsecurity) throw new Error('RLS/FORCE missing');
    q = await db.query(`SELECT permissive,qual,with_check FROM pg_policies WHERE tablename='vehicles' AND policyname='tenant_isolation_ve'`);
    if (q.rowCount !== 1 || q.rows[0].permissive !== 'PERMISSIVE' || !q.rows[0].qual || !q.rows[0].with_check) throw new Error('permissive USING/WITH CHECK missing');
    await db.end();

    const appDb = new Pool({ connectionString: appUrl });
    const client = await appDb.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant','company-i1a-final-a',true)`);
      q = await client.query(`SELECT DISTINCT company_id FROM vehicles`);
      if (q.rows.some(row => row.company_id !== 'company-i1a-final-a')) throw new Error('direct RLS read leak');
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant','company-i1a-final-a',true)`);
      let blocked = false;
      try { await client.query(`INSERT INTO vehicles(id,company_id,plate,renavam,status) VALUES ('final-forge','company-i1a-final-b','CCC3D45','10101010101','AVAILABLE')`); } catch { blocked = true; }
      await client.query('ROLLBACK');
      if (!blocked) throw new Error('RLS WITH CHECK allowed foreign write');
    } finally {
      client.release();
      await appDb.end();
    }
    console.log('FINAL_I1A_POSTGRES16_RLS=PASS');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch(error => { console.error('FINAL_I1A_FATAL', error); process.exit(2); });
