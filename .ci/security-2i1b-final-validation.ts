import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from '../src/server/password';

const adminUrl = 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_ci';
const appUrl = 'postgres://autoerp_i1b_final:autoerp_i1b_final_pass@127.0.0.1:5432/autoerp_ci';
const base = 'http://127.0.0.1:3000';
const password = 'StrongPass123!';

const vehiclePayload = {
  plate: 'mno-4p56', renavam: '44444444444', brand: 'Toyota', model: 'Yaris', version: 'XS',
  yearFabrication: 2025, yearModel: 2026, color: 'Prata', chassis: '9brfinali1b', currentKm: 400,
  nextMaintenanceKm: 10000, fuelType: 'Flex', category: 'Hatch', acquisitionValue: 92000,
  currentValue: 88000, rentalValueBase: 950, notes: 'I1B final',
};

async function migrateAndSeed() {
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
    ('company-i1b-final-a','91919191000191','I1B Final A','ACTIVE'),
    ('company-i1b-final-b','92929292000192','I1B Final B','ACTIVE')`);
  await db.query(`INSERT INTO vehicles(
    id,company_id,plate,renavam,brand,model,year_fabrication,year_model,color,chassis,current_km,
    fuel_type,category,acquisition_value,current_value,rental_value_base,status,is_archived,created_at,updated_at
  ) VALUES (
    'veh-final-pre','company-i1b-final-a','ZZZ9Z99','95555555555','VW','Polo',2022,2023,'Cinza','FINALPRE',12345,
    'Flex','Hatch',60000,50000,700,'AVAILABLE',false,'2026-02-03T11:22:33Z','2026-02-03T11:22:33Z'
  )`);

  const migration9 = fs.readFileSync('drizzle/0009_vehicle_km_authority.sql', 'utf8');
  await db.query(migration9);
  await db.query(migration9);
  const expectedId = 'km-init-' + createHash('md5').update('company-i1b-final-a:veh-final-pre').digest('hex');
  let q = await db.query(`SELECT id,km_value,record_date FROM vehicle_km_records WHERE vehicle_id='veh-final-pre'`);
  if (q.rowCount !== 1 || q.rows[0].id !== expectedId || q.rows[0].km_value !== 12345 || q.rows[0].record_date !== '2026-02-03') {
    throw new Error(`final migration/backfill mismatch ${JSON.stringify(q.rows)}`);
  }

  await db.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('i1b-final-admin-a','company-i1b-final-a','I1B Final Admin A','final-admin-a@i1b.test','ADMIN',true,ARRAY['*']),
    ('i1b-final-readonly-a','company-i1b-final-a','I1B Final Readonly A','final-readonly-a@i1b.test','READONLY',true,ARRAY[]::text[]),
    ('i1b-final-admin-b','company-i1b-final-b','I1B Final Admin B','final-admin-b@i1b.test','ADMIN',true,ARRAY['*'])`);
  const hashes = await Promise.all([password,password,password].map(hashPassword));
  for (const [companyId,userId,hash] of [
    ['company-i1b-final-a','i1b-final-admin-a',hashes[0]],
    ['company-i1b-final-a','i1b-final-readonly-a',hashes[1]],
    ['company-i1b-final-b','i1b-final-admin-b',hashes[2]],
  ]) await db.query('INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES ($1,$2,$3)', [companyId,userId,hash]);

  await db.query(`CREATE ROLE autoerp_i1b_final LOGIN PASSWORD 'autoerp_i1b_final_pass'`);
  await db.query(`GRANT USAGE ON SCHEMA public TO autoerp_i1b_final`);
  await db.query(`GRANT SELECT ON companies,users,user_credentials TO autoerp_i1b_final`);
  await db.query(`GRANT SELECT,INSERT,UPDATE ON vehicles,vehicle_km_records TO autoerp_i1b_final`);
  await db.query(`GRANT INSERT ON audit_logs TO autoerp_i1b_final`);
  await db.end();
  console.log('FINAL_I1B_MIGRATION_BACKFILL=PASS');
}

async function login(document: string, email: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyDocument: document, email, password }),
  });
  if (response.status !== 200) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('missing session cookie');
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
  await migrateAndSeed();
  let logs = '';
  const server = spawn('node', ['dist/server.mjs'], {
    env: {
      ...process.env, NODE_ENV: 'production', USE_PGLITE: 'false', ALLOW_MOCK_AUTH: 'false', DATABASE_URL: appUrl,
      JWT_SECRET: 'security-2i1b-final-secret-at-least-32-bytes', JWT_ISSUER: 'autoerp-ci', JWT_AUDIENCE: 'autoerp-users',
    },
    stdio: ['ignore','pipe','pipe'],
  });
  server.stdout?.on('data', d => logs += String(d));
  server.stderr?.on('data', d => logs += String(d));

  try {
    for (let i=0;i<40;i++) {
      try { if ((await fetch(`${base}/api/auth/me`)).status === 401) break; } catch {}
      if (i === 39) throw new Error(`server not ready ${logs}`);
      await new Promise(r => setTimeout(r, 500));
    }

    let r = await req('GET','/api/fleet/vehicles/x/km-records');
    if (r.status !== 401) throw new Error(`no-session KM read ${r.status}`);
    r = await req('POST','/api/fleet/vehicles/x/km-records',undefined,{kmValue:1,readingType:'PERIODIC'});
    if (r.status !== 401) throw new Error(`no-session KM write ${r.status}`);
    console.log('FINAL_I1B_AUTH_REQUIRED=PASS');

    const adminA = await login('91919191000191','final-admin-a@i1b.test');
    const readonlyA = await login('91919191000191','final-readonly-a@i1b.test');
    const adminB = await login('92929292000192','final-admin-b@i1b.test');

    r = await req('POST','/api/fleet/vehicles',adminA,{
      ...vehiclePayload, companyId:'company-i1b-final-b',userId:'forged',userName:'Forged',role:'ADMIN',
      status:'SOLD',isArchived:true,currentDriverId:'forged-driver',currentContractId:'forged-contract',
    });
    if (r.status !== 201) throw new Error(`create A ${r.status} ${await r.text()}`);
    const a = (await r.json()).item;
    if (a.companyId !== 'company-i1b-final-a' || a.currentKm !== 400 || a.status !== 'AVAILABLE' || a.isArchived !== false || a.currentDriverId || a.currentContractId) {
      throw new Error('create server authority failed');
    }

    const db = new Pool({ connectionString: adminUrl });
    let q = await db.query('SELECT * FROM vehicle_km_records WHERE company_id=$1 AND vehicle_id=$2',['company-i1b-final-a',a.id]);
    if (q.rowCount !== 1 || q.rows[0].km_value !== 400) throw new Error('atomic initial KmRecord absent');
    console.log('FINAL_I1B_CREATE_INITIAL_KM=PASS');

    r = await req('PATCH',`/api/fleet/vehicles/${a.id}`,adminA,{currentKm:401});
    if (r.status !== 400) throw new Error(`generic currentKm route ${r.status}`);
    q = await db.query('SELECT current_km FROM vehicles WHERE id=$1',[a.id]);
    if (q.rows[0].current_km !== 400) throw new Error('generic PATCH changed currentKm');
    console.log('FINAL_I1B_GENERIC_KM_BLOCKED=PASS');

    r = await req('GET',`/api/fleet/vehicles/${a.id}/km-records`,readonlyA);
    if (r.status !== 200) throw new Error(`readonly list ${r.status}`);
    r = await req('POST',`/api/fleet/vehicles/${a.id}/km-records`,readonlyA,{kmValue:410,readingType:'PERIODIC'});
    if (r.status !== 403) throw new Error(`readonly write ${r.status}`);
    console.log('FINAL_I1B_RBAC=PASS');

    r = await req('POST','/api/fleet/vehicles',adminB,{...vehiclePayload,plate:'PQR5S67',renavam:'55555555555'});
    if (r.status !== 201) throw new Error(`create B ${r.status} ${await r.text()}`);
    const b = (await r.json()).item;
    r = await req('GET',`/api/fleet/vehicles/${b.id}/km-records`,adminA);
    if (r.status !== 404) throw new Error(`cross tenant KM read ${r.status}`);
    r = await req('POST',`/api/fleet/vehicles/${b.id}/km-records`,adminA,{kmValue:410,readingType:'PERIODIC'});
    if (r.status !== 404) throw new Error(`cross tenant KM write ${r.status}`);
    console.log('FINAL_I1B_TENANT_ISOLATION=PASS');

    r = await req('POST',`/api/fleet/vehicles/${a.id}/km-records`,adminA,{kmValue:399,readingType:'PERIODIC'});
    if (r.status !== 400) throw new Error(`regressive KM ${r.status}`);
    await db.query(`UPDATE vehicles SET current_driver_id='server-final-driver',current_contract_id='server-final-contract' WHERE id=$1`,[a.id]);
    r = await req('POST',`/api/fleet/vehicles/${a.id}/km-records`,adminA,{
      kmValue:450,readingType:'CHECK_IN',notes:'Final',companyId:'company-i1b-final-b',driverId:'evil',contractId:'evil',userName:'Forged'
    });
    if (r.status !== 201) throw new Error(`valid KM ${r.status} ${await r.text()}`);
    let result = await r.json();
    if (result.vehicle.currentKm !== 450 || result.record.companyId !== 'company-i1b-final-a' || result.record.driverId !== 'server-final-driver' || result.record.contractId !== 'server-final-contract') {
      throw new Error('KM server-derived authority failed');
    }
    r = await req('POST',`/api/fleet/vehicles/${a.id}/km-records`,adminA,{kmValue:450,readingType:'CHECK_IN'});
    if (r.status !== 409) throw new Error(`wrapped 23505 must map 409, got ${r.status}`);
    console.log('FINAL_I1B_KM_RULES=PASS');

    await new Promise(r => setTimeout(r,20));
    r = await req('POST',`/api/fleet/vehicles/${a.id}/km-records`,adminA,{kmValue:460,readingType:'MAINTENANCE'});
    if (r.status !== 201) throw new Error(`second KM ${r.status}`);
    r = await req('GET',`/api/fleet/vehicles/${a.id}/km-records`,adminA);
    result = await r.json();
    if (r.status !== 200 || result.items.length !== 3 || result.items[0].kmValue !== 460 || result.items[1].kmValue !== 450) throw new Error('latest-first KM ordering failed');
    console.log('FINAL_I1B_KM_ORDERING=PASS');

    q = await db.query(`SELECT user_id,changes FROM audit_logs WHERE company_id='company-i1b-final-a' AND entity_type='KmRecord' ORDER BY timestamp`);
    if ((q.rowCount || 0) < 2 || q.rows.some(row => row.user_id !== 'i1b-final-admin-a')) throw new Error('audit principal mismatch');
    const auditText = JSON.stringify(q.rows);
    if (!auditText.includes('I1B Final Admin A') || auditText.includes('Forged')) throw new Error('browser identity reached audit');

    await db.query(`CREATE OR REPLACE FUNCTION final_i1b_fail_audit() RETURNS trigger AS $$ BEGIN IF NEW.entity_type='KmRecord' THEN RAISE EXCEPTION 'forced'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER final_i1b_fail_audit_trigger BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION final_i1b_fail_audit()`);
    r = await req('POST',`/api/fleet/vehicles/${a.id}/km-records`,adminA,{kmValue:470,readingType:'PERIODIC'});
    if (r.status < 500) throw new Error(`forced audit should fail, got ${r.status}`);
    await db.query(`DROP TRIGGER final_i1b_fail_audit_trigger ON audit_logs`);
    await db.query(`DROP FUNCTION final_i1b_fail_audit()`);
    q = await db.query('SELECT current_km FROM vehicles WHERE id=$1',[a.id]);
    if (q.rows[0].current_km !== 460) throw new Error('Vehicle currentKm survived failed audit');
    q = await db.query('SELECT count(*)::int c FROM vehicle_km_records WHERE vehicle_id=$1 AND km_value=470',[a.id]);
    if (q.rows[0].c !== 0) throw new Error('KmRecord survived failed audit');
    console.log('FINAL_I1B_ATOMIC_AUDIT_ROLLBACK=PASS');

    await db.query(`CREATE OR REPLACE FUNCTION final_i1b_fail_initial() RETURNS trigger AS $$ BEGIN IF NEW.notes='Cadastro inicial do veículo' THEN RAISE EXCEPTION 'forced initial'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER final_i1b_fail_initial_trigger BEFORE INSERT ON vehicle_km_records FOR EACH ROW EXECUTE FUNCTION final_i1b_fail_initial()`);
    r = await req('POST','/api/fleet/vehicles',adminA,{...vehiclePayload,plate:'STU6V78',renavam:'66666666666'});
    if (r.status < 500) throw new Error(`forced initial KM should fail, got ${r.status}`);
    await db.query(`DROP TRIGGER final_i1b_fail_initial_trigger ON vehicle_km_records`);
    await db.query(`DROP FUNCTION final_i1b_fail_initial()`);
    q = await db.query(`SELECT count(*)::int c FROM vehicles WHERE company_id='company-i1b-final-a' AND plate='STU6V78'`);
    if (q.rows[0].c !== 0) throw new Error('Vehicle survived initial KM failure');
    console.log('FINAL_I1B_CREATE_ROLLBACK=PASS');

    q = await db.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='vehicle_km_records'`);
    if (q.rowCount !== 1 || !q.rows[0].relrowsecurity || !q.rows[0].relforcerowsecurity) throw new Error('KM ENABLE/FORCE RLS missing');
    q = await db.query(`SELECT permissive,qual,with_check FROM pg_policies WHERE tablename='vehicle_km_records' AND policyname='tenant_isolation_vehicle_km'`);
    if (q.rowCount !== 1 || q.rows[0].permissive !== 'PERMISSIVE' || !q.rows[0].qual || !q.rows[0].with_check) throw new Error('KM USING/WITH CHECK missing');
    await db.end();

    const appDb = new Pool({ connectionString: appUrl });
    const client = await appDb.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant','company-i1b-final-a',true)`);
      q = await client.query(`SELECT DISTINCT company_id FROM vehicle_km_records`);
      if (q.rows.some(row => row.company_id !== 'company-i1b-final-a')) throw new Error('direct KM RLS read leak');
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant','company-i1b-final-a',true)`);
      let blocked = false;
      try { await client.query(`INSERT INTO vehicle_km_records(id,company_id,vehicle_id,km_value,record_date,reading_type) VALUES ('final-forged-km','company-i1b-final-b','x',1,'2026-08-18','PERIODIC')`); } catch { blocked = true; }
      await client.query('ROLLBACK');
      if (!blocked) throw new Error('KM WITH CHECK accepted foreign tenant');
    } finally {
      client.release(); await appDb.end();
    }
    console.log('FINAL_I1B_POSTGRES16_RLS=PASS');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch(error => { console.error('FINAL_I1B_FATAL', error); process.exit(2); });
