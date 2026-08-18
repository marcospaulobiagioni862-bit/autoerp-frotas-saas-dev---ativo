import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { hashPassword } from '../src/server/password';

const adminUrl = 'postgres://postgres:postgres@127.0.0.1:5432/autoerp_ci';
const base = 'http://127.0.0.1:3000';
const password = 'StrongPass123!';

async function seed() {
  const p = new Pool({ connectionString: adminUrl });
  for (const f of [
    'drizzle/0000_milky_invisible_woman.sql',
    'drizzle/0001_rls_and_audit.sql',
    'drizzle/0002_phase1_final_hardening.sql',
    'drizzle/0003_auth_credentials.sql',
    'drizzle/0004_payment_methods_rls_permissive.sql',
    'drizzle/0005_financial_periods_rls_permissive.sql',
    'drizzle/0006_security_deposit_authority.sql',
  ]) await p.query(fs.readFileSync(f, 'utf8'));

  await p.query(`INSERT INTO companies(id,document,name,status) VALUES
    ('company-g8-a','93939393000193','Tenant G8 A','ACTIVE'),
    ('company-g8-b','94949494000194','Tenant G8 B','ACTIVE')`);
  await p.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('g8-admin-a','company-g8-a','Admin G8 A','admin-a@g8.test','ADMIN',true,ARRAY['*']),
    ('g8-readonly-a','company-g8-a','Readonly G8 A','readonly-a@g8.test','READONLY',true,ARRAY[]::text[]),
    ('g8-admin-b','company-g8-b','Admin G8 B','admin-b@g8.test','ADMIN',true,ARRAY['*'])`);
  const hashes = await Promise.all([password,password,password].map(hashPassword));
  await p.query(`INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES
    ($1,$2,$3),($4,$5,$6),($7,$8,$9)`,[
      'company-g8-a','g8-admin-a',hashes[0],
      'company-g8-a','g8-readonly-a',hashes[1],
      'company-g8-b','g8-admin-b',hashes[2],
    ]);

  await p.query(`INSERT INTO contracts(id,company_id,driver_id,vehicle_id,status) VALUES
    ('contract-g8-a','company-g8-a','driver-g8-a','vehicle-g8-a','ACTIVE'),
    ('contract-g8-c','company-g8-a','driver-g8-c','vehicle-g8-c','ACTIVE'),
    ('contract-g8-d','company-g8-a','driver-g8-d','vehicle-g8-d','ACTIVE'),
    ('contract-g8-b','company-g8-b','driver-g8-b','vehicle-g8-b','ACTIVE')`);

  await p.query(`INSERT INTO financial_accounts(id,company_id,name,type,initial_balance,current_balance,status) VALUES
    ('acc-g8-a','company-g8-a','Conta G8 A','BANK','1000.00','1000.00','ACTIVE'),
    ('acc-g8-b','company-g8-b','Conta G8 B','BANK','5000.00','5000.00','ACTIVE')`);
  await p.query(`INSERT INTO payment_methods(id,company_id,name,type,fee_percentage,active) VALUES
    ('pm-g8-a','company-g8-a','PIX G8 A','PIX','0',true),
    ('pm-g8-b','company-g8-b','PIX G8 B','PIX','0',true)`);

  await p.query(`INSERT INTO security_deposits(
    id,company_id,contract_id,driver_id,vehicle_id,amount,original_amount,
    received_amount,used_amount,returned_amount,status,created_at,updated_at
  ) VALUES (
    'dep-g8-a','company-g8-a','contract-g8-a','driver-g8-a','vehicle-g8-a',
    '1000.00','1000.00','0','0','0','PENDING',now(),now()
  )`);

  await p.query(`CREATE ROLE autoerp_g8_app LOGIN PASSWORD 'autoerp_g8_pass'`);
  await p.query(`GRANT USAGE ON SCHEMA public TO autoerp_g8_app`);
  await p.query(`GRANT SELECT ON companies,users,user_credentials,contracts,payment_methods TO autoerp_g8_app`);
  await p.query(`GRANT SELECT,INSERT,UPDATE ON financial_accounts,security_deposits,security_deposit_movements,financial_transactions TO autoerp_g8_app`);
  await p.query(`GRANT INSERT ON audit_logs TO autoerp_g8_app`);
  await p.end();
}

async function waitForServer(logs: () => string) {
  for (let i=0;i<40;i++) {
    try {
      const r=await fetch(base+'/api/auth/me');
      if(r.status===401) return;
    } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('server did not start\n'+logs());
}

async function login(doc:string,email:string) {
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyDocument:doc,email,password})});
  if(r.status!==200) throw Error(`login ${email} ${r.status} ${await r.text()}`);
  const c=r.headers.get('set-cookie'); if(!c) throw Error('cookie missing'); return c.split(';')[0];
}

async function getDeposit(cookie:string|null,contractId:string) {
  return fetch(base+'/api/finance/security-deposits/by-contract/'+encodeURIComponent(contractId),{headers:{...(cookie?{cookie}:{})}});
}

async function receive(cookie:string|null,body:any) {
  return fetch(base+'/api/finance/security-deposits/receive',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
}

function eq(actual:unknown,expected:number,label:string) {
  if(Math.abs(Number(actual)-expected)>0.005) throw Error(`${label}: ${String(actual)} != ${expected}`);
}

async function httpAndAtomicity() {
  const db=new Pool({connectionString:adminUrl});

  let r=await getDeposit(null,'contract-g8-a'); if(r.status!==401) throw Error(`GET no-session ${r.status}`);
  r=await receive(null,{contractId:'contract-g8-a',amount:100,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a'}); if(r.status!==401) throw Error(`POST no-session ${r.status}`);
  console.log('G8_NO_SESSION=PASS');

  const adminA=await login('93939393000193','admin-a@g8.test');
  const readonlyA=await login('93939393000193','readonly-a@g8.test');
  const adminB=await login('94949494000194','admin-b@g8.test');
  console.log('G8_LOGIN=PASS');

  r=await getDeposit(adminA,'contract-g8-a'); if(r.status!==200) throw Error(`initial GET ${r.status}`);
  let j:any=await r.json(); if(!j.deposit||j.deposit.id!=='dep-g8-a'||j.deposit.status!=='PENDING') throw Error('initial deposit read');
  eq(j.deposit.receivedAmount,0,'initial received');
  r=await getDeposit(adminA,'contract-g8-b'); if(r.status!==200) throw Error(`cross GET ${r.status}`); j=await r.json(); if(j.deposit!==null) throw Error('cross tenant deposit leaked');
  console.log('G8_READ_TENANT_ISOLATION=PASS');

  const balanceBefore=Number((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance);
  r=await receive(readonlyA,{contractId:'contract-g8-a',amount:100,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a'}); if(r.status!==403) throw Error(`readonly ${r.status} ${await r.text()}`);
  eq((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance,balanceBefore,'readonly balance');
  console.log('G8_READONLY_BLOCKED=PASS');

  r=await receive(adminA,{contractId:'contract-g8-b',amount:100,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a'}); if(r.status!==404) throw Error(`cross contract ${r.status} ${await r.text()}`);
  r=await receive(adminA,{contractId:'contract-g8-a',amount:100,financialAccountId:'acc-g8-b',paymentMethodId:'pm-g8-a'}); if(r.status!==404) throw Error(`cross account ${r.status} ${await r.text()}`);
  r=await receive(adminA,{contractId:'contract-g8-a',amount:100,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-b'}); if(r.status!==404) throw Error(`cross payment method ${r.status} ${await r.text()}`);
  eq((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance,balanceBefore,'cross-tenant balance');
  console.log('G8_CROSS_TENANT_BLOCKED=PASS');

  r=await receive(adminA,{
    contractId:'contract-g8-a',amount:400,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a',
    companyId:'company-g8-b',userId:'g8-admin-b',userName:'FORGED',driverId:'driver-g8-b',vehicleId:'vehicle-g8-b'
  });
  if(r.status!==201) throw Error(`partial receive ${r.status} ${await r.text()}`);
  j=await r.json(); if(j.deposit.id!=='dep-g8-a'||j.deposit.status!=='PENDING') throw Error('partial deposit status'); eq(j.deposit.receivedAmount,400,'partial received');

  let q=await db.query(`SELECT * FROM security_deposits WHERE id='dep-g8-a'`); let dep=q.rows[0];
  if(dep.company_id!=='company-g8-a'||dep.driver_id!=='driver-g8-a'||dep.vehicle_id!=='vehicle-g8-a'||dep.contract_id!=='contract-g8-a') throw Error('forged deposit identity accepted');
  eq(dep.original_amount,1000,'original amount preserved'); eq(dep.received_amount,400,'db partial received');
  q=await db.query(`SELECT * FROM financial_transactions WHERE description='Recebimento de Caução (Contrato: contract-g8-a)' ORDER BY created_at`); if(q.rowCount!==1) throw Error('transaction count partial'); const tx1=q.rows[0];
  if(tx1.company_id!=='company-g8-a'||tx1.financial_account_id!=='acc-g8-a'||tx1.payment_method_id!=='pm-g8-a'||tx1.driver_id!=='driver-g8-a'||tx1.vehicle_id!=='vehicle-g8-a'||tx1.created_by_id!=='g8-admin-a'||tx1.type!=='INCOME') throw Error('transaction principal/contract authority failed'); eq(tx1.amount,400,'transaction amount');
  q=await db.query(`SELECT * FROM security_deposit_movements WHERE deposit_id='dep-g8-a'`); if(q.rowCount!==1) throw Error('movement partial count'); const mov=q.rows[0]; if(mov.financial_transaction_id!==tx1.id||mov.created_by_id!=='g8-admin-a'||mov.type!=='RECEIPT') throw Error('movement linkage/identity');
  q=await db.query(`SELECT user_id,changes FROM audit_logs WHERE entity_type='SecurityDeposit' AND entity_id='dep-g8-a' AND action='RECEIVE'`); if(q.rowCount!==1) throw Error('audit partial count'); const audit=q.rows[0]; if(audit.user_id!=='g8-admin-a'||JSON.parse(audit.changes).userName!=='Admin G8 A') throw Error('audit identity');
  eq((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance,1400,'partial account balance');
  console.log('G8_PARTIAL_ATOMIC_RECEIPT=PASS');
  console.log('G8_BROWSER_IDENTITY_IGNORED=PASS');

  r=await receive(adminA,{contractId:'contract-g8-a',amount:600,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a'}); if(r.status!==201) throw Error(`second receive ${r.status} ${await r.text()}`); j=await r.json(); if(j.deposit.status!=='RECEIVED') throw Error('full status'); eq(j.deposit.receivedAmount,1000,'full received');
  q=await db.query(`SELECT count(*)::int c, max(received_amount) received, max(status) status FROM security_deposits WHERE company_id='company-g8-a' AND contract_id='contract-g8-a'`); if(q.rows[0].c!==1||q.rows[0].status!=='RECEIVED') throw Error('duplicate deposit/full status'); eq(q.rows[0].received,1000,'db full received');
  q=await db.query(`SELECT count(*)::int c FROM security_deposit_movements WHERE deposit_id='dep-g8-a'`); if(q.rows[0].c!==2) throw Error('second movement missing');
  q=await db.query(`SELECT count(*)::int c FROM financial_transactions WHERE description='Recebimento de Caução (Contrato: contract-g8-a)'`); if(q.rows[0].c!==2) throw Error('second transaction missing');
  eq((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance,2000,'full account balance');
  console.log('G8_SECOND_RECEIPT_NO_DUPLICATE_DEPOSIT=PASS');

  r=await receive(adminA,{contractId:'contract-g8-c',amount:250,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a'}); if(r.status!==201) throw Error(`new deposit ${r.status} ${await r.text()}`); j=await r.json(); if(j.deposit.contractId!=='contract-g8-c'||j.deposit.status!=='RECEIVED'||j.deposit.driverId!=='driver-g8-c'||j.deposit.vehicleId!=='vehicle-g8-c') throw Error('new deposit contract authority'); eq(j.deposit.originalAmount,250,'new original'); eq(j.deposit.receivedAmount,250,'new received');
  console.log('G8_NEW_DEPOSIT_RECEIVED=PASS');

  const beforeRollback=Number((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance);
  await db.query(`CREATE OR REPLACE FUNCTION g8_fail_deposit_audit() RETURNS trigger AS $$ BEGIN IF NEW.entity_type='SecurityDeposit' AND NEW.action='RECEIVE' THEN RAISE EXCEPTION 'g8 forced audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await db.query(`CREATE TRIGGER g8_fail_deposit_audit_trigger BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION g8_fail_deposit_audit()`);
  r=await receive(adminA,{contractId:'contract-g8-d',amount:100,financialAccountId:'acc-g8-a',paymentMethodId:'pm-g8-a'}); if(r.status===201) throw Error('forced audit failure unexpectedly committed');
  await db.query(`DROP TRIGGER g8_fail_deposit_audit_trigger ON audit_logs`); await db.query(`DROP FUNCTION g8_fail_deposit_audit()`);
  q=await db.query(`SELECT count(*)::int c FROM security_deposits WHERE contract_id='contract-g8-d'`); if(q.rows[0].c!==0) throw Error('rollback left deposit');
  q=await db.query(`SELECT count(*)::int c FROM financial_transactions WHERE description='Recebimento de Caução (Contrato: contract-g8-d)'`); if(q.rows[0].c!==0) throw Error('rollback left transaction');
  q=await db.query(`SELECT count(*)::int c FROM security_deposit_movements m JOIN security_deposits d ON d.id=m.deposit_id WHERE d.contract_id='contract-g8-d'`); if(q.rows[0].c!==0) throw Error('rollback left movement');
  eq((await db.query(`SELECT current_balance FROM financial_accounts WHERE id='acc-g8-a'`)).rows[0].current_balance,beforeRollback,'rollback account balance');
  console.log('G8_ATOMIC_ROLLBACK=PASS');

  // Tenant B proves its own session remains isolated and usable.
  r=await receive(adminB,{contractId:'contract-g8-b',amount:300,financialAccountId:'acc-g8-b',paymentMethodId:'pm-g8-b'}); if(r.status!==201) throw Error(`tenant B receive ${r.status} ${await r.text()}`); j=await r.json(); if(j.deposit.companyId!=='company-g8-b'||j.deposit.driverId!=='driver-g8-b'||j.deposit.vehicleId!=='vehicle-g8-b') throw Error('tenant B authority');
  console.log('G8_TENANT_B=PASS');

  await db.end();
}

class MemoryStorage {
  private s=new Map<string,string>(); clear(){this.s.clear()} getItem(k:string){return this.s.get(k)??null} removeItem(k:string){this.s.delete(k)} setItem(k:string,v:string){this.s.set(k,String(v))} key(i:number){return[...this.s.keys()][i]??null} get length(){return this.s.size}
}

async function regressions() {
  process.env.NODE_ENV='test'; process.env.USE_PGLITE='true'; process.env.ALLOW_MOCK_AUTH='false';
  process.env.JWT_SECRET='security-2g8-ci-secret-at-least-32-bytes'; process.env.JWT_ISSUER='autoerp-ci'; process.env.JWT_AUDIENCE='autoerp-users';
  const st=new MemoryStorage(); Object.defineProperty(globalThis,'localStorage',{value:st,configurable:true}); Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
  const u=(p:string)=>pathToFileURL(path.join(process.cwd(),p)).href;
  const suites:[string,string,string,number][]=[
    ['AuthSession','src/auth/__tests__/authSessionTestRunner.ts','AuthSessionTestRunner',8],
    ['Bootstrap','src/server/__tests__/bootstrapTestRunner.ts','BootstrapTestRunner',5],
    ['SessionLogin','src/server/__tests__/sessionLoginTestRunner.ts','SessionLoginTestRunner',12],
    ['Password','src/server/__tests__/passwordTestRunner.ts','PasswordSecurityTestRunner',6],
    ['ServerAuth','src/server/__tests__/authTestRunner.ts','ServerAuthTestRunner',8],
    ['Admin','src/domain/admin/SecurityAdministrationService.test.ts','SecurityAdministrationTestRunner',4],
    ['Tenant','src/domain/admin/TenantConfigurationService.test.ts','TenantConfigurationTestRunner',4],
  ];
  for(const[n,f,k,e]of suites){const m:any=await import(u(f));const r=await m[k].runAllTests();if(r.passed!==e||r.total!==e||r.failed)throw Error(`${n} ${r.passed}/${r.total}`)}
  const saved=process.argv; process.argv=[];
  const{ContractTestRunner}=await import(u('src/domain/services/__tests__/contractTestRunner.ts'));
  const{FinanceTestRunner}=await import(u('src/domain/finance/__tests__/financeTestRunner.ts'));
  const{SecurityTestRunner}=await import(u('src/domain/services/__tests__/securityTestRunner.ts'));
  process.argv=saved;
  for(const[n,f,e]of [['Contract',()=>ContractTestRunner.runAllTests(),20],['Finance',()=>FinanceTestRunner.runAllTests(),46],['Security',()=>SecurityTestRunner.runAllTests(),35]]as any){st.clear();const r=await f();if(r.passed!==e||r.total!==e||r.failed)throw Error(`${n} ${r.passed}/${r.total}`)}
  console.log('G8_REGRESSIONS=PASS');
}

async function main() {
  await seed();
  let logs='';
  const child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,NODE_ENV:'production',USE_PGLITE:'false',ALLOW_MOCK_AUTH:'false',DATABASE_URL:'postgres://autoerp_g8_app:autoerp_g8_pass@127.0.0.1:5432/autoerp_ci',JWT_SECRET:'security-2g8-ci-secret-at-least-32-bytes',JWT_ISSUER:'autoerp-ci',JWT_AUDIENCE:'autoerp-users'}});
  child.stdout.on('data',d=>{logs+=d.toString()}); child.stderr.on('data',d=>{logs+=d.toString()});
  try { await waitForServer(()=>logs); await httpAndAtomicity(); } finally { child.kill('SIGTERM'); }
  await regressions();
}

main().catch(e=>{console.error('G8_VALIDATION_FATAL',e);process.exit(2)});
