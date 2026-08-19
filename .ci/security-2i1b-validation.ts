import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { hashPassword } from '../src/server/password';

const adminUrl = 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_ci';
const appUrl = 'postgres://autoerp_i1b_app:autoerp_i1b_pass@127.0.0.1:5432/autoerp_ci';
const base = 'http://127.0.0.1:3000';
const password = 'StrongPass123!';

const createVehicle = {
  plate: 'abc-1d23', renavam: '11111111111', brand: 'Chevrolet', model: 'Onix', version: 'LT',
  yearFabrication: 2025, yearModel: 2026, color: 'Branco', chassis: '9bg123xyz', currentKm: 120,
  nextMaintenanceKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 72000,
  currentValue: 68000, rentalValueBase: 850, notes: 'Cadastro I1B',
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
    ('company-i1b-a','81818181000181','Tenant I1B A','ACTIVE'),
    ('company-i1b-b','82828282000182','Tenant I1B B','ACTIVE')`);

  // Existing server Vehicle proves deterministic 0009 backfill.
  await db.query(`INSERT INTO vehicles(
    id,company_id,plate,renavam,brand,model,year_fabrication,year_model,color,chassis,current_km,
    fuel_type,category,acquisition_value,current_value,rental_value_base,status,is_archived,created_at,updated_at
  ) VALUES (
    'veh-preexisting','company-i1b-a','PRE1A23','90000000000','Ford','Ka',2020,2020,'Prata','PRECHASSIS',34567,
    'Flex','Hatch',40000,30000,600,'AVAILABLE',false,'2026-01-15T10:00:00Z','2026-01-15T10:00:00Z'
  )`);

  await db.query(fs.readFileSync('drizzle/0009_vehicle_km_authority.sql', 'utf8'));
  let q = await db.query(`SELECT id,company_id,vehicle_id,km_value,record_date,reading_type FROM vehicle_km_records WHERE vehicle_id='veh-preexisting'`);
  if (q.rowCount !== 1 || q.rows[0].id !== 'km-init-' + requireMd5('company-i1b-a:veh-preexisting') || q.rows[0].km_value !== 34567 || q.rows[0].record_date !== '2026-01-15') {
    throw new Error(`0009 deterministic backfill failed ${JSON.stringify(q.rows)}`);
  }
  await db.query(fs.readFileSync('drizzle/0009_vehicle_km_authority.sql', 'utf8'));
  q = await db.query(`SELECT count(*)::int c FROM vehicle_km_records WHERE vehicle_id='veh-preexisting'`);
  if (q.rows[0].c !== 1) throw new Error('0009 reexecution duplicated backfill');
  console.log('I1B_MIGRATION_BACKFILL=PASS');

  await db.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('i1b-admin-a','company-i1b-a','Admin I1B A','admin-a@i1b.test','ADMIN',true,ARRAY['*']),
    ('i1b-readonly-a','company-i1b-a','Readonly I1B A','readonly-a@i1b.test','READONLY',true,ARRAY[]::text[]),
    ('i1b-admin-b','company-i1b-b','Admin I1B B','admin-b@i1b.test','ADMIN',true,ARRAY['*'])`);
  const hashes = await Promise.all([password, password, password].map(hashPassword));
  const users = [
    ['company-i1b-a','i1b-admin-a',hashes[0]], ['company-i1b-a','i1b-readonly-a',hashes[1]], ['company-i1b-b','i1b-admin-b',hashes[2]],
  ];
  for (const [companyId,userId,hash] of users) {
    await db.query('INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES ($1,$2,$3)', [companyId,userId,hash]);
  }

  await db.query(`CREATE ROLE autoerp_i1b_app LOGIN PASSWORD 'autoerp_i1b_pass'`);
  await db.query(`GRANT USAGE ON SCHEMA public TO autoerp_i1b_app`);
  await db.query(`GRANT SELECT ON companies,users,user_credentials TO autoerp_i1b_app`);
  await db.query(`GRANT SELECT,INSERT,UPDATE ON vehicles,vehicle_km_records TO autoerp_i1b_app`);
  await db.query(`GRANT INSERT ON audit_logs TO autoerp_i1b_app`);
  await db.end();
}

function requireMd5(value: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto.createHash('md5').update(value).digest('hex');
}

async function login(document: string, email: string): Promise<string> {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyDocument: document, email, password }),
  });
  if (response.status !== 200) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error(`cookie missing ${email}`);
  return cookie.split(';')[0];
}

async function request(method: string, path: string, cookie?: string, body?: unknown) {
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
      ...process.env, NODE_ENV: 'production', USE_PGLITE: 'false', ALLOW_MOCK_AUTH: 'false', DATABASE_URL: appUrl,
      JWT_SECRET: 'security-2i1b-ci-secret-at-least-32-bytes', JWT_ISSUER: 'autoerp-ci', JWT_AUDIENCE: 'autoerp-users',
    },
    stdio: ['ignore','pipe','pipe'],
  });
  server.stdout?.on('data', d => logs += String(d));
  server.stderr?.on('data', d => logs += String(d));

  try {
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(base + '/api/auth/me')).status === 401) break; } catch {}
      if (i === 39) throw new Error('server not ready ' + logs);
      await new Promise(r => setTimeout(r, 500));
    }

    let r = await request('GET','/api/fleet/vehicles/anything/km-records');
    if (r.status !== 401) throw new Error(`KM list no session ${r.status}`);
    r = await request('POST','/api/fleet/vehicles/anything/km-records',undefined,{kmValue:1,readingType:'PERIODIC'});
    if (r.status !== 401) throw new Error(`KM write no session ${r.status}`);
    console.log('I1B_KM_NO_SESSION=PASS');

    const adminA = await login('81818181000181','admin-a@i1b.test');
    const readonlyA = await login('81818181000181','readonly-a@i1b.test');
    const adminB = await login('82828282000182','admin-b@i1b.test');

    r = await request('POST','/api/fleet/vehicles',adminA,{...createVehicle, companyId:'company-i1b-b',userId:'forged',userName:'Forged',role:'ADMIN'});
    if (r.status !== 201) throw new Error(`create A ${r.status} ${await r.text()}`);
    const vehicleA = (await r.json()).item;
    if (vehicleA.companyId !== 'company-i1b-a' || vehicleA.currentKm !== 120) throw new Error('vehicle create authority');

    const db = new Pool({ connectionString: adminUrl });
    let q = await db.query('SELECT * FROM vehicle_km_records WHERE company_id=$1 AND vehicle_id=$2', ['company-i1b-a',vehicleA.id]);
    if (q.rowCount !== 1 || q.rows[0].km_value !== 120 || q.rows[0].reading_type !== 'PERIODIC') throw new Error('create initial KM missing');
    console.log('I1B_CREATE_INITIAL_KM=PASS');

    r = await request('PATCH',`/api/fleet/vehicles/${vehicleA.id}`,adminA,{currentKm:121});
    if (r.status !== 400) throw new Error(`generic currentKm PATCH ${r.status}`);
    q = await db.query('SELECT current_km FROM vehicles WHERE id=$1',[vehicleA.id]);
    if (q.rows[0].current_km !== 120) throw new Error('generic currentKm mutated vehicle');
    console.log('I1B_GENERIC_KM_PATCH_BLOCKED=PASS');

    r = await request('GET',`/api/fleet/vehicles/${vehicleA.id}/km-records`,readonlyA);
    if (r.status !== 200 || (await r.json()).items.length !== 1) throw new Error('readonly KM list');
    r = await request('POST',`/api/fleet/vehicles/${vehicleA.id}/km-records`,readonlyA,{kmValue:130,readingType:'PERIODIC'});
    if (r.status !== 403) throw new Error(`readonly KM write ${r.status}`);
    console.log('I1B_KM_READONLY_RBAC=PASS');

    r = await request('POST','/api/fleet/vehicles',adminB,{...createVehicle, plate:'DEF2G34',renavam:'22222222222'});
    if (r.status !== 201) throw new Error(`create B ${r.status} ${await r.text()}`);
    const vehicleB = (await r.json()).item;
    r = await request('GET',`/api/fleet/vehicles/${vehicleB.id}/km-records`,adminA);
    if (r.status !== 404) throw new Error(`cross tenant KM list ${r.status}`);
    r = await request('POST',`/api/fleet/vehicles/${vehicleB.id}/km-records`,adminA,{kmValue:130,readingType:'PERIODIC'});
    if (r.status !== 404) throw new Error(`cross tenant KM write ${r.status}`);
    console.log('I1B_KM_TENANT_ISOLATION=PASS');

    r = await request('POST',`/api/fleet/vehicles/${vehicleA.id}/km-records`,adminA,{kmValue:119,readingType:'PERIODIC'});
    if (r.status !== 400) throw new Error(`KM regression ${r.status}`);
    q = await db.query('SELECT current_km FROM vehicles WHERE id=$1',[vehicleA.id]);
    if (q.rows[0].current_km !== 120) throw new Error('KM regression changed vehicle');
    console.log('I1B_KM_REGRESSION_BLOCKED=PASS');

    await db.query(`UPDATE vehicles SET current_driver_id='server-driver',current_contract_id='server-contract' WHERE id=$1`,[vehicleA.id]);
    r = await request('POST',`/api/fleet/vehicles/${vehicleA.id}/km-records`,adminA,{
      kmValue:150,readingType:'CHECK_OUT',notes:'Servidor',companyId:'company-i1b-b',driverId:'forged-driver',contractId:'forged-contract',userId:'forged',userName:'Forged'
    });
    if (r.status !== 201) throw new Error(`KM valid write ${r.status} ${await r.text()}`);
    let body = await r.json();
    if (body.vehicle.currentKm !== 150 || body.record.kmValue !== 150 || body.record.companyId !== 'company-i1b-a' || body.record.driverId !== 'server-driver' || body.record.contractId !== 'server-contract') {
      throw new Error('KM server authority links/tenant failed');
    }
    console.log('I1B_KM_SERVER_AUTHORITY=PASS');

    r = await request('POST',`/api/fleet/vehicles/${vehicleA.id}/km-records`,adminA,{kmValue:150,readingType:'CHECK_OUT'});
    if (r.status !== 409) throw new Error(`exact KM duplicate ${r.status}`);
    console.log('I1B_KM_DUPLICATE=PASS');

    await new Promise(r => setTimeout(r, 20));
    r = await request('POST',`/api/fleet/vehicles/${vehicleA.id}/km-records`,adminA,{kmValue:160,readingType:'MAINTENANCE'});
    if (r.status !== 201) throw new Error(`second KM ${r.status} ${await r.text()}`);
    r = await request('GET',`/api/fleet/vehicles/${vehicleA.id}/km-records`,adminA);
    body = await r.json();
    if (r.status !== 200 || body.items.length !== 3 || body.items[0].kmValue !== 160 || body.items[1].kmValue !== 150) throw new Error(`KM ordering ${JSON.stringify(body)}`);
    console.log('I1B_KM_ORDERING=PASS');

    q = await db.query(`SELECT user_id,changes FROM audit_logs WHERE company_id='company-i1b-a' AND entity_type='KmRecord' ORDER BY timestamp`);
    if ((q.rowCount || 0) < 2 || q.rows.some(row => row.user_id !== 'i1b-admin-a')) throw new Error('KM audit principal mismatch');
    const auditText = JSON.stringify(q.rows);
    if (!auditText.includes('Admin I1B A') || auditText.includes('Forged') || auditText.includes('forged')) throw new Error('KM audit browser identity leak');
    console.log('I1B_KM_AUDIT_PRINCIPAL=PASS');

    // Forced audit failure rolls back BOTH the new KmRecord and Vehicle.currentKm.
    await db.query(`CREATE OR REPLACE FUNCTION i1b_fail_km_audit() RETURNS trigger AS $$ BEGIN IF NEW.entity_type='KmRecord' THEN RAISE EXCEPTION 'forced km audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER i1b_fail_km_audit_trigger BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION i1b_fail_km_audit()`);
    r = await request('POST',`/api/fleet/vehicles/${vehicleA.id}/km-records`,adminA,{kmValue:170,readingType:'PERIODIC'});
    if (r.status < 500) throw new Error(`forced KM audit failure status ${r.status}`);
    await db.query(`DROP TRIGGER i1b_fail_km_audit_trigger ON audit_logs`);
    await db.query(`DROP FUNCTION i1b_fail_km_audit()`);
    q = await db.query('SELECT current_km FROM vehicles WHERE id=$1',[vehicleA.id]);
    if (q.rows[0].current_km !== 160) throw new Error('vehicle KM not rolled back after audit failure');
    q = await db.query('SELECT count(*)::int c FROM vehicle_km_records WHERE vehicle_id=$1 AND km_value=170',[vehicleA.id]);
    if (q.rows[0].c !== 0) throw new Error('KmRecord not rolled back after audit failure');
    console.log('I1B_KM_ATOMIC_AUDIT_ROLLBACK=PASS');

    // Forced initial-KM insert failure rolls back Vehicle creation itself.
    await db.query(`CREATE OR REPLACE FUNCTION i1b_fail_initial_km() RETURNS trigger AS $$ BEGIN IF NEW.notes='Cadastro inicial do veículo' THEN RAISE EXCEPTION 'forced initial km failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER i1b_fail_initial_km_trigger BEFORE INSERT ON vehicle_km_records FOR EACH ROW EXECUTE FUNCTION i1b_fail_initial_km()`);
    r = await request('POST','/api/fleet/vehicles',adminA,{...createVehicle,plate:'GHI3J45',renavam:'33333333333'});
    if (r.status < 500) throw new Error(`forced initial KM failure status ${r.status}`);
    await db.query(`DROP TRIGGER i1b_fail_initial_km_trigger ON vehicle_km_records`);
    await db.query(`DROP FUNCTION i1b_fail_initial_km()`);
    q = await db.query(`SELECT count(*)::int c FROM vehicles WHERE company_id='company-i1b-a' AND plate='GHI3J45'`);
    if (q.rows[0].c !== 0) throw new Error('Vehicle create survived initial KmRecord failure');
    console.log('I1B_CREATE_ATOMIC_KM_ROLLBACK=PASS');

    q = await db.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='vehicle_km_records'`);
    if (q.rowCount !== 1 || !q.rows[0].relrowsecurity || !q.rows[0].relforcerowsecurity) throw new Error('KM RLS/FORCE missing');
    q = await db.query(`SELECT permissive,qual,with_check FROM pg_policies WHERE tablename='vehicle_km_records' AND policyname='tenant_isolation_vehicle_km'`);
    if (q.rowCount !== 1 || q.rows[0].permissive !== 'PERMISSIVE' || !q.rows[0].qual || !q.rows[0].with_check) throw new Error('KM policy missing USING/WITH CHECK');
    await db.end();

    const appDb = new Pool({ connectionString: appUrl });
    const client = await appDb.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant','company-i1b-a',true)`);
      q = await client.query(`SELECT DISTINCT company_id FROM vehicle_km_records`);
      if (q.rows.some(row => row.company_id !== 'company-i1b-a')) throw new Error('direct KM RLS SELECT leak');
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant','company-i1b-a',true)`);
      let blocked = false;
      try {
        await client.query(`INSERT INTO vehicle_km_records(id,company_id,vehicle_id,km_value,record_date,reading_type) VALUES ('km-forged','company-i1b-b','x',1,'2026-08-18','PERIODIC')`);
      } catch { blocked = true; }
      await client.query('ROLLBACK');
      if (!blocked) throw new Error('KM RLS WITH CHECK accepted forged tenant insert');
    } finally {
      client.release(); await appDb.end();
    }
    console.log('I1B_POSTGRES16_KM_RLS=PASS');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch(error => { console.error('I1B_VALIDATION_FATAL', error); process.exit(2); });
