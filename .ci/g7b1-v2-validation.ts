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
  ]) await p.query(fs.readFileSync(f, 'utf8'));

  await p.query(`INSERT INTO companies(id,document,name,status) VALUES
    ('company-g7b1-a','77777777000177','Tenant G7B1 A','ACTIVE'),
    ('company-g7b1-b','88888888000188','Tenant G7B1 B','ACTIVE')`);
  await p.query(`INSERT INTO users(id,company_id,name,email,role,active,permissions) VALUES
    ('g7b1-admin-a','company-g7b1-a','Admin G7B1 A','admin-a@g7b1.test','ADMIN',true,ARRAY['*']),
    ('g7b1-admin-b','company-g7b1-b','Admin G7B1 B','admin-b@g7b1.test','ADMIN',true,ARRAY['*'])`);
  const [ha,hb] = await Promise.all([password,password].map(hashPassword));
  await p.query(`INSERT INTO user_credentials(company_id,user_id,password_hash) VALUES ($1,$2,$3),($4,$5,$6)`,
    ['company-g7b1-a','g7b1-admin-a',ha,'company-g7b1-b','g7b1-admin-b',hb]);

  await p.query(`INSERT INTO account_receivables(id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status) VALUES
    ('g7b1-ar-a1','company-g7b1-a','MANUAL','g7b1-ar-a1','cat-income','Receita normal','1000.00','5.00','20.00','10.00','1025.00','0','1025.00','2026-09-10','2026-09-10','PENDING'),
    ('g7b1-ar-a2','company-g7b1-a','MANUAL','g7b1-ar-a2','cat-income','Receita no ultimo dia','200.00','0','0','0','200.00','0','200.00','2026-09-30','2026-09-30','PENDING'),
    ('g7b1-ar-a3','company-g7b1-a','SECURITY_DEPOSIT','g7b1-dep-a','cat-income','Caução recebida','500.00','0','0','0','500.00','0','500.00','2026-09-12','2026-09-12','PENDING'),
    ('g7b1-ar-a4','company-g7b1-a','MANUAL','g7b1-cancel-a','cat-income','Cancelada','300.00','0','0','0','300.00','0','300.00','2026-09-15','2026-09-15','CANCELLED'),
    ('g7b1-ar-b1','company-g7b1-b','MANUAL','g7b1-ar-b1','cat-income','Receita tenant B','9000.00','0','0','0','9000.00','0','9000.00','2026-09-10','2026-09-10','PENDING')`);

  await p.query(`INSERT INTO account_payables(id,company_id,origin_type,origin_id,category_id,description,original_amount,discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,due_date,competence_date,status) VALUES
    ('g7b1-ap-a1','company-g7b1-a','MANUAL','g7b1-ap-a1','cat-expense','Despesa normal','400.00','0','0','0','400.00','0','400.00','2026-09-10','2026-09-10','PENDING'),
    ('g7b1-ap-a2','company-g7b1-a','MANUAL','g7b1-ap-a2','cat-expense','Despesa no ultimo dia','100.00','0','0','0','100.00','0','100.00','2026-09-30','2026-09-30','PENDING'),
    ('g7b1-ap-a3','company-g7b1-a','SECURITY_DEPOSIT','g7b1-dep-pay-a','cat-expense','Caução devolvida','150.00','0','0','0','150.00','0','150.00','2026-09-12','2026-09-12','PENDING'),
    ('g7b1-ap-b1','company-g7b1-b','MANUAL','g7b1-ap-b1','cat-expense','Despesa tenant B','8000.00','0','0','0','8000.00','0','8000.00','2026-09-10','2026-09-10','PENDING')`);

  await p.query(`INSERT INTO financial_transactions(id,company_id,financial_account_id,type,amount,payment_method_id,transaction_date,competence_date,description,is_reversed,created_by_id) VALUES
    ('g7b1-tx-a1','company-g7b1-a','acc-a','INCOME','800.00','pm-a','2026-09-10','2026-09-10','Receita caixa',false,'g7b1-admin-a'),
    ('g7b1-tx-a2','company-g7b1-a','acc-a','INCOME','200.00','pm-a','2026-09-30','2026-09-30','Receita ultimo dia',false,'g7b1-admin-a'),
    ('g7b1-tx-a3','company-g7b1-a','acc-a','EXPENSE','300.00','pm-a','2026-09-15','2026-09-15','Despesa caixa',false,'g7b1-admin-a'),
    ('g7b1-tx-a4','company-g7b1-a','acc-a','INCOME','100.00','pm-a','2026-09-16','2026-09-16','Caução recebida',false,'g7b1-admin-a'),
    ('g7b1-tx-a5','company-g7b1-a','acc-a','INCOME','500.00','pm-a','2026-09-17','2026-09-17','Receita estornada',true,'g7b1-admin-a'),
    ('g7b1-tx-b1','company-g7b1-b','acc-b','INCOME','9900.00','pm-b','2026-09-10','2026-09-10','Receita B',false,'g7b1-admin-b')`);

  await p.query(`CREATE ROLE autoerp_g7b1_app LOGIN PASSWORD 'autoerp_g7b1_pass'`);
  await p.query(`GRANT USAGE ON SCHEMA public TO autoerp_g7b1_app`);
  await p.query(`GRANT SELECT ON companies,users,user_credentials,account_receivables,account_payables,financial_transactions TO autoerp_g7b1_app`);
  await p.end();
}

async function waitForServer(logs: () => string) {
  for (let i=0;i<30;i++) {
    try {
      const r = await fetch(base + '/api/auth/me');
      if (r.status === 401) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not start\n' + logs());
}

async function login(doc:string,email:string) {
  const r = await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyDocument:doc,email,password})});
  if(r.status!==200) throw Error(`login ${email} ${r.status} ${await r.text()}`);
  const c=r.headers.get('set-cookie'); if(!c) throw Error('cookie missing'); return c.split(';')[0];
}

async function getDre(cookie:string|null,regime:string,start='2026-09-01',end='2026-09-30',forged?:string) {
  return fetch(`${base}/api/finance/reports/dre?start=${start}&end=${end}&regime=${regime}`,{headers:{...(cookie?{cookie}:{}),...(forged?{'x-company-id':forged}:{})}});
}

function eq(actual:unknown, expected:number, label:string) {
  if (Math.abs(Number(actual)-expected)>0.0001) throw Error(`${label}: ${String(actual)} != ${expected}`);
}

async function httpParity() {
  let r=await getDre(null,'CASH'); if(r.status!==401)throw Error(`no-session ${r.status}`); console.log('G7B1_NO_SESSION=PASS');
  const ca=await login('77777777000177','admin-a@g7b1.test'); const cb=await login('88888888000188','admin-b@g7b1.test'); console.log('G7B1_LOGIN=PASS');
  r=await getDre(ca,'BAD'); if(r.status!==400)throw Error(`invalid regime ${r.status}`); console.log('G7B1_INVALID_PARAMS=PASS');
  r=await getDre(ca,'ACCRUAL','2026-09-01','2026-09-30','company-g7b1-b'); if(r.status!==200)throw Error(`accrual A ${r.status} ${await r.text()}`); let j:any=await r.json(); let d=j.report;
  eq(d.grossRevenue.amount,1200,'accrual gross'); eq(d.directCosts.amount,500,'accrual costs'); eq(d.financialResult.amount,25,'accrual financial'); eq(d.netProfit,725,'accrual net'); eq(d.breakdown.maintenanceCosts,200,'accrual maintenance'); eq(d.breakdown.insuranceCosts,150,'accrual insurance'); eq(d.breakdown.trackerCosts,100,'accrual tracker'); eq(d.breakdown.trafficTicketCosts,50,'accrual ticket'); console.log('G7B1_ACCRUAL_EXACT=PASS');
  r=await getDre(ca,'CASH','2026-09-01','2026-09-30','company-g7b1-b'); if(r.status!==200)throw Error(`cash A ${r.status} ${await r.text()}`); j=await r.json(); d=j.report;
  eq(d.grossRevenue.amount,1000,'cash gross'); eq(d.directCosts.amount,300,'cash costs'); eq(d.netProfit,700,'cash net'); eq(d.breakdown.maintenanceCosts,120,'cash maintenance'); eq(d.breakdown.insuranceCosts,90,'cash insurance'); eq(d.breakdown.trackerCosts,60,'cash tracker'); eq(d.breakdown.trafficTicketCosts,30,'cash ticket'); console.log('G7B1_CASH_EXACT=PASS');
  r=await getDre(cb,'ACCRUAL'); if(r.status!==200)throw Error(`accrual B ${r.status}`); j=await r.json(); d=j.report; eq(d.grossRevenue.amount,9000,'tenant B gross'); eq(d.directCosts.amount,8000,'tenant B costs'); console.log('G7B1_TENANT_ISOLATION=PASS');
  console.log('G7B1_FORGED_TENANT_HEADER=IGNORED');
}

class MemoryStorage {
  private s=new Map<string,string>(); clear(){this.s.clear()} getItem(k:string){return this.s.get(k)??null} removeItem(k:string){this.s.delete(k)} setItem(k:string,v:string){this.s.set(k,String(v))} key(i:number){return[...this.s.keys()][i]??null} get length(){return this.s.size}
}

async function regressions() {
  process.env.NODE_ENV='test'; process.env.USE_PGLITE='true'; process.env.ALLOW_MOCK_AUTH='false';
  process.env.JWT_SECRET='security-2g7b1-ci-secret-at-least-32-bytes'; process.env.JWT_ISSUER='autoerp-ci'; process.env.JWT_AUDIENCE='autoerp-users';
  const st=new MemoryStorage(); Object.defineProperty(globalThis,'localStorage',{value:st,configurable:true}); Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
  const u=(p:string)=>pathToFileURL(path.join(process.cwd(),p)).href;
  const suites:[string,string,string,number][]=[
    ['AuthSession','src/auth/__tests__/authSessionTestRunner.ts','AuthSessionTestRunner',8],['Bootstrap','src/server/__tests__/bootstrapTestRunner.ts','BootstrapTestRunner',5],['SessionLogin','src/server/__tests__/sessionLoginTestRunner.ts','SessionLoginTestRunner',12],['Password','src/server/__tests__/passwordTestRunner.ts','PasswordSecurityTestRunner',6],['ServerAuth','src/server/__tests__/authTestRunner.ts','ServerAuthTestRunner',8],['Admin','src/domain/admin/SecurityAdministrationService.test.ts','SecurityAdministrationTestRunner',4],['Tenant','src/domain/admin/TenantConfigurationService.test.ts','TenantConfigurationTestRunner',4],
  ];
  for(const[n,f,k,e]of suites){const m:any=await import(u(f));const r=await m[k].runAllTests();if(r.passed!==e||r.total!==e||r.failed)throw Error(`${n} ${r.passed}/${r.total}`)}
  const saved=process.argv; process.argv=[];
  const{ContractTestRunner}=await import(u('src/domain/services/__tests__/contractTestRunner.ts')); const{FinanceTestRunner}=await import(u('src/domain/finance/__tests__/financeTestRunner.ts')); const{SecurityTestRunner}=await import(u('src/domain/services/__tests__/securityTestRunner.ts')); process.argv=saved;
  for(const[n,f,e]of [['Contract',()=>ContractTestRunner.runAllTests(),20],['Finance',()=>FinanceTestRunner.runAllTests(),46],['Security',()=>SecurityTestRunner.runAllTests(),35]]as any){st.clear();const r=await f();if(r.passed!==e||r.total!==e||r.failed)throw Error(`${n} ${r.passed}/${r.total}`)}
  console.log('G7B1_REGRESSIONS=PASS');
}

async function main() {
  await seed();
  let out='';
  const child=spawn(process.execPath,['dist/server.mjs'],{env:{...process.env,NODE_ENV:'production',USE_PGLITE:'false',ALLOW_MOCK_AUTH:'false',DATABASE_URL:'postgres://autoerp_g7b1_app:autoerp_g7b1_pass@127.0.0.1:5432/autoerp_ci',JWT_SECRET:'security-2g7b1-ci-secret-at-least-32-bytes',JWT_ISSUER:'autoerp-ci',JWT_AUDIENCE:'autoerp-users'}});
  child.stdout.on('data',d=>{out+=d.toString()}); child.stderr.on('data',d=>{out+=d.toString()});
  try { await waitForServer(()=>out); await httpParity(); } finally { child.kill('SIGTERM'); }
  await regressions();
}

main().catch(e=>{console.error('G7B1_V2_FATAL',e);process.exit(2)});
