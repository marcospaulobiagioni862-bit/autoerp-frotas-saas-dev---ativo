import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { hashPassword } from '../src/server/password';

const adminUrl='postgres://postgres:postgres@127.0.0.1:5432/autoerp_ci';
const base='http://127.0.0.1:3000';
const password='StrongPass123!';

async function seed(){
  const p=new Pool({connectionString:adminUrl});
  for(const f of [
    'drizzle/0000_milky_invisible_woman.sql','drizzle/0001_rls_and_audit.sql','drizzle/0002_phase1_final_hardening.sql',
    'drizzle/0003_auth_credentials.sql','drizzle/0004_payment_methods_rls_permissive.sql','drizzle/0005_financial_periods_rls_permissive.sql',
    'drizzle/0006_security_deposit_authority.sql','drizzle/0007_driver_health_profiles.sql'
  ]) await p.query(fs.readFileSync(f,'utf8'));
  await p.query(`INSERT INTO companies(id,document,name,status) VALUES
    ('company-h1-a','51515151000151','Tenant H1 A','ACTIVE'),('company-h1-b','52525252000152','Tenant H1 B','ACTIVE')`);
  await p.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('h1-admin-a','company-h1-a','Admin H1 A','admin-a@h1.test','ADMIN',true,ARRAY['*']),
    ('h1-readonly-a','company-h1-a','Readonly H1 A','readonly-a@h1.test','READONLY',true,ARRAY[]::text[]),
    ('h1-oper-a','company-h1-a','Operational H1 A','oper-a@h1.test','OPERATIONAL',true,ARRAY[]::text[]),
    ('h1-explicit-a','company-h1-a','Explicit H1 A','explicit-a@h1.test','OPERATIONAL',true,ARRAY['VIEW_DRIVER_HEALTH','EDIT_DRIVER_HEALTH']),
    ('h1-admin-b','company-h1-b','Admin H1 B','admin-b@h1.test','ADMIN',true,ARRAY['*'])`);
  const hashes=await Promise.all([password,password,password,password,password].map(hashPassword));
  const ids=['h1-admin-a','h1-readonly-a','h1-oper-a','h1-explicit-a','h1-admin-b'];
  const companies=['company-h1-a','company-h1-a','company-h1-a','company-h1-a','company-h1-b'];
  for(let i=0;i<ids.length;i++) await p.query(`INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES ($1,$2,$3)`,[companies[i],ids[i],hashes[i]]);
  await p.query(`CREATE ROLE autoerp_h1_app LOGIN PASSWORD 'autoerp_h1_pass'`);
  await p.query(`GRANT USAGE ON SCHEMA public TO autoerp_h1_app`);
  await p.query(`GRANT SELECT ON companies,users,user_credentials TO autoerp_h1_app`);
  await p.query(`GRANT SELECT,INSERT,UPDATE ON driver_health_profiles TO autoerp_h1_app`);
  await p.query(`GRANT INSERT ON audit_logs TO autoerp_h1_app`);
  await p.end();
}

async function login(doc:string,email:string){
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyDocument:doc,email,password})});
  if(r.status!==200) throw Error(`login ${email}: ${r.status} ${await r.text()}`);
  const c=r.headers.get('set-cookie'); if(!c) throw Error('cookie missing'); return c.split(';')[0];
}
async function req(method:string,id:string,cookie:string|null,health?:any){return fetch(`${base}/api/drivers/${encodeURIComponent(id)}/health`,{method,headers:{...(cookie?{cookie}:{}),...(health?{'content-type':'application/json'}:{})},body:health?JSON.stringify({health}):undefined});}

async function main(){
  await seed();
  let logs='';
  const server=spawn('node',['dist/server.mjs'],{env:{...process.env,NODE_ENV:'production',USE_PGLITE:'false',ALLOW_MOCK_AUTH:'false',DATABASE_URL:'postgres://autoerp_h1_app:autoerp_h1_pass@127.0.0.1:5432/autoerp_ci',JWT_SECRET:'security-2h1-ci-secret-at-least-32-bytes',JWT_ISSUER:'autoerp-ci',JWT_AUDIENCE:'autoerp-users'},stdio:['ignore','pipe','pipe']});
  server.stdout?.on('data',d=>logs+=String(d)); server.stderr?.on('data',d=>logs+=String(d));
  try{
    for(let i=0;i<40;i++){try{const r=await fetch(base+'/api/auth/me');if(r.status===401)break}catch{};if(i===39)throw Error('server not ready '+logs);await new Promise(r=>setTimeout(r,500));}
    let r=await req('GET','driver-shared',null); if(r.status!==401)throw Error(`GET no session ${r.status}`);
    r=await req('PUT','driver-shared',null,{allergies:'NOSESSION_SECRET'}); if(r.status!==401)throw Error(`PUT no session ${r.status}`); console.log('H1_NO_SESSION=PASS');

    const adminA=await login('51515151000151','admin-a@h1.test');
    const readonlyA=await login('51515151000151','readonly-a@h1.test');
    const operA=await login('51515151000151','oper-a@h1.test');
    const explicitA=await login('51515151000151','explicit-a@h1.test');
    const adminB=await login('52525252000152','admin-b@h1.test'); console.log('H1_LOGIN=PASS');

    r=await req('GET','driver-empty',adminA); if(r.status!==200)throw Error(`empty GET ${r.status}`); let j:any=await r.json(); if(Object.keys(j.health||{}).length!==0)throw Error('missing profile not empty'); console.log('H1_EMPTY_PROFILE=PASS');
    r=await req('GET','driver-shared',readonlyA); if(r.status!==403)throw Error(`readonly GET ${r.status}`);
    r=await req('PUT','driver-shared',readonlyA,{allergies:'DENIED'}); if(r.status!==403)throw Error(`readonly PUT ${r.status}`);
    r=await req('GET','driver-shared',operA); if(r.status!==403)throw Error(`oper GET ${r.status}`);
    r=await req('PUT','driver-shared',operA,{allergies:'DENIED'}); if(r.status!==403)throw Error(`oper PUT ${r.status}`); console.log('H1_ROLE_DENY=PASS');

    r=await req('PUT','driver-explicit',explicitA,{allergies:'ExplicitAllowed'}); if(r.status!==200)throw Error(`explicit PUT ${r.status} ${await r.text()}`);
    r=await req('GET','driver-explicit',explicitA); if(r.status!==200||(await r.json()).health.allergies!=='ExplicitAllowed')throw Error('explicit permission failure'); console.log('H1_EXPLICIT_PERMISSION=PASS');

    r=await req('PUT','driver-shared',adminA,{bloodType:'O+',allergies:'TENANT_A_SECRET',relevantConditions:'A_CONDITION',continuousMedications:'A_MEDICATION',emergencyNotes:'A_NOTE'}); if(r.status!==200)throw Error(`A PUT ${r.status} ${await r.text()}`);
    r=await req('PUT','driver-shared',adminB,{bloodType:'A-',allergies:'TENANT_B_SECRET',relevantConditions:'B_CONDITION',continuousMedications:'B_MEDICATION',emergencyNotes:'B_NOTE'}); if(r.status!==200)throw Error(`B PUT ${r.status} ${await r.text()}`);
    r=await req('GET','driver-shared',adminA); j=await r.json(); if(j.health.allergies!=='TENANT_A_SECRET'||JSON.stringify(j).includes('TENANT_B_SECRET'))throw Error('tenant A leak');
    r=await req('GET','driver-shared',adminB); j=await r.json(); if(j.health.allergies!=='TENANT_B_SECRET'||JSON.stringify(j).includes('TENANT_A_SECRET'))throw Error('tenant B leak'); console.log('H1_RLS_SAME_DRIVER_ISOLATION=PASS');

    const db=new Pool({connectionString:adminUrl});
    let q=await db.query(`SELECT company_id,driver_id,allergies FROM driver_health_profiles WHERE driver_id='driver-shared' ORDER BY company_id`); if(q.rowCount!==2||q.rows[0].allergies===q.rows[1].allergies)throw Error('db tenant profiles not distinct');
    q=await db.query(`SELECT user_id,changes FROM audit_logs WHERE entity_type='DriverHealthSecurity' ORDER BY timestamp`); if((q.rowCount||0)<5)throw Error('health audit missing');
    const auditText=JSON.stringify(q.rows); for(const secret of ['TENANT_A_SECRET','TENANT_B_SECRET','A_CONDITION','B_CONDITION','A_MEDICATION','B_MEDICATION','A_NOTE','B_NOTE']) if(auditText.includes(secret))throw Error(`sensitive audit leak ${secret}`); console.log('H1_AUDIT_METADATA_ONLY=PASS');

    await db.query(`CREATE OR REPLACE FUNCTION h1_fail_health_audit() RETURNS trigger AS $$ BEGIN IF NEW.entity_type='DriverHealthSecurity' THEN RAISE EXCEPTION 'forced health audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER h1_fail_health_audit_trigger BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION h1_fail_health_audit()`);
    r=await req('PUT','driver-rollback',adminA,{allergies:'ROLLBACK_SECRET'}); if(r.status===200)throw Error('forced audit failure committed');
    await db.query(`DROP TRIGGER h1_fail_health_audit_trigger ON audit_logs`); await db.query(`DROP FUNCTION h1_fail_health_audit()`);
    q=await db.query(`SELECT count(*)::int c FROM driver_health_profiles WHERE company_id='company-h1-a' AND driver_id='driver-rollback'`); if(q.rows[0].c!==0)throw Error('health write not rolled back'); console.log('H1_ATOMIC_ROLLBACK=PASS');
    await db.end();
  } finally { server.kill('SIGTERM'); }
}
main().catch(e=>{console.error('H1_VALIDATION_FATAL',e);process.exit(2)});
