import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { RecurringAuthorityService } from '../recurringAuthority';
import { TrackerAuthorityService, setTrackerTestHooksForTests } from '../trackerAuthority';
import { registerTrackerRoutes } from '../trackerRoutes';
import type { AuthenticatedPrincipal } from '../auth';

const require=createRequire(import.meta.url);const {Client}=require('pg') as typeof import('pg');
const companyA='security-2k-company-a',companyB='security-2k-company-b';
const adminA='security-2k-admin-a',operationalA='security-2k-operational-a',readonlyA='security-2k-readonly-a';
const vehicleA='security-2k-vehicle-a',vehicleB='security-2k-vehicle-b';
const categoryA='security-2k-tracker-category-a';
const supplierA='security-2k-supplier-a',supplierB='security-2k-supplier-b';
const roleName='security_2k_rls_user',rolePassword='security-k-test-password';
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
async function one(query:any):Promise<any>{return rows(await db.execute(query))[0];}
const admin:AuthenticatedPrincipal={companyId:companyA,userId:adminA,name:'K Admin',role:'ADMIN',permissions:['*']};
const operational:AuthenticatedPrincipal={companyId:companyA,userId:operationalA,name:'K Operacional',role:'OPERATIONAL',permissions:[]};
const readonly:AuthenticatedPrincipal={companyId:companyA,userId:readonlyA,name:'K Viewer',role:'READONLY',permissions:[]};

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES (${companyA},'K A','ACTIVE',NOW(),NOW()),(${companyB},'K B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'K Admin','k-admin@example.test','ADMIN',true,NOW(),NOW()),
    (${operationalA},${companyA},'K Operational','k-op@example.test','OPERATIONAL',true,NOW(),NOW()),
    (${readonlyA},${companyA},'K Viewer','k-view@example.test','READONLY',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
    (${vehicleA},${companyA},'KAA1A01','KREN-A','AVAILABLE',1000,NOW(),NOW()),(${vehicleB},${companyB},'KBB1B01','KREN-B','AVAILABLE',2000,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES (${categoryA},${companyA},'Rastreador','EXPENSE',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO suppliers(id,company_id,name,document,category,status,created_at,updated_at) VALUES
    (${supplierA},${companyA},'Tracker Supplier A','K-SUP-A','Rastreador','ACTIVE',NOW(),NOW()),(${supplierB},${companyB},'Tracker Supplier B','K-SUP-B','Rastreador','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function testHttpSecurity():Promise<void>{
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const who=req.header('x-test-principal');if(who==='admin')(req as any).principal=admin;if(who==='op')(req as any).principal=operational;if(who==='readonly')(req as any).principal=readonly;next();});registerTrackerRoutes(app);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));const address=server.address();if(!address||typeof address==='string')throw new Error('test address unavailable');const base=`http://127.0.0.1:${address.port}`;
  try{
    let response=await fetch(`${base}/api/trackers`);assert(response.status===401,`no-session expected 401 got ${response.status}`);
    response=await fetch(`${base}/api/trackers`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'readonly'},body:JSON.stringify({})});assert(response.status===403,`READONLY expected 403 got ${response.status}`);
    response=await fetch(`${base}/api/trackers`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin'},body:JSON.stringify({companyId:companyB,vehicleId:vehicleA,equipmentModel:'X',imei:'111111111111111',monthlyCost:0,installationDate:'2026-09-01'})});assert(response.status===400,`forged companyId expected 400 got ${response.status}`);
    response=await fetch(`${base}/api/trackers`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'op'},body:JSON.stringify({vehicleId:vehicleB,equipmentModel:'Cross',imei:'222222222222222',monthlyCost:0,installationDate:'2026-09-01'})});assert(response.status===404,`cross tenant vehicle expected 404 got ${response.status}`);
    response=await fetch(`${base}/api/trackers`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'op'},body:JSON.stringify({vehicleId:vehicleA,equipmentModel:'Cross Supplier',imei:'333333333333333',monthlyCost:10,installationDate:'2026-09-01',supplierId:supplierB,categoryId:categoryA})});assert(response.status===404,`cross tenant supplier expected 404 got ${response.status}`);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

async function testAtomicRecurringLifecycle():Promise<void>{
  setTrackerTestHooksForTests({afterTrackerCreated:()=>{throw new Error('INDUCED_TRACKER_RULE_FAILURE');}});let failed=false;
  try{await TrackerAuthorityService.create(admin,{vehicleId:vehicleA,equipmentModel:'Rollback GPS',imei:'444444444444444',monthlyCost:50,installationDate:'2026-09-01',supplierId:supplierA,categoryId:categoryA});}catch(error){failed=String(error).includes('INDUCED_TRACKER_RULE_FAILURE');}finally{setTrackerTestHooksForTests({});}
  assert(failed,'induced failure did not propagate');assert(Number((await one(sql`SELECT count(*)::int count FROM trackers WHERE company_id=${companyA} AND imei='444444444444444'`))?.count)===0,'tracker survived failed aggregate');

  const tracker=await TrackerAuthorityService.create(admin,{vehicleId:vehicleA,equipmentModel:'Concox K',imei:'555555555555555',chipCarrier:'Vivo',chipNumber:'11999990000',monthlyCost:65,installationDate:'2026-09-01',supplierId:supplierA,categoryId:categoryA});
  let rule=await one(sql`SELECT id,status,amount,category_id,vehicle_id,supplier_id,next_generation_date::text next_date FROM recurring_rules WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`);
  assert(rule&&rule.status==='ACTIVE'&&Number(rule.amount)===65&&rule.category_id===categoryA,'tracker recurring rule not created canonically');
  const retry=await TrackerAuthorityService.create(admin,{vehicleId:vehicleA,equipmentModel:'Concox K',imei:'555555555555555',chipCarrier:'Vivo',chipNumber:'11999990000',monthlyCost:65,installationDate:'2026-09-01',supplierId:supplierA,categoryId:categoryA});assert(retry.id===tracker.id,'identical create retry did not converge');
  assert(Number((await one(sql`SELECT count(*)::int count FROM recurring_rules WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`))?.count)===1,'retry duplicated recurring rule');

  const first=await RecurringAuthorityService.processTenant(companyA,'2026-09-01','security-2k-worker-1');assert(first.failed===0&&first.processed===1,'scheduler did not create first tracker AP');
  let apCount=Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`))?.count);assert(apCount===1,`expected one tracker AP got ${apCount}`);
  const replay=await RecurringAuthorityService.processTenant(companyA,'2026-09-01','security-2k-worker-replay');assert(replay.processed===0&&replay.failed===0,'scheduler replayed same tracker period');

  await TrackerAuthorityService.update(admin,tracker.id,{monthlyCost:0});rule=await one(sql`SELECT status,active FROM recurring_rules WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`);assert(rule.status==='PAUSED'&&rule.active===false,'zero cost did not pause recurring rule');
  const paused=await RecurringAuthorityService.processTenant(companyA,'2026-10-01','security-2k-worker-paused');assert(paused.processed===0,'paused rule generated AP');

  await TrackerAuthorityService.update(admin,tracker.id,{monthlyCost:80});rule=await one(sql`SELECT status,amount FROM recurring_rules WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`);assert(rule.status==='ACTIVE'&&Number(rule.amount)===80,'positive cost did not resume/sync rule');
  const second=await RecurringAuthorityService.processTenant(companyA,'2026-10-01','security-2k-worker-2');assert(second.failed===0&&second.processed===1,'resumed rule did not generate next AP');
  apCount=Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`))?.count);assert(apCount===2,'tracker AP period count mismatch');

  const removed=await TrackerAuthorityService.remove(admin,tracker.id,'Equipamento substituído');assert(removed.status==='REMOVED','remove did not persist');rule=await one(sql`SELECT status,active FROM recurring_rules WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`);assert(rule.status==='COMPLETED'&&rule.active===false,'remove did not complete rule');
  await RecurringAuthorityService.processTenant(companyA,'2026-11-01','security-2k-worker-after-remove');assert(Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_type='TRACKER' AND origin_id=${tracker.id}`))?.count)===2,'removed tracker generated future AP');
}

async function testConcurrentReplacement():Promise<void>{
  const [a,b]=await Promise.all([
    TrackerAuthorityService.create(operational,{vehicleId:vehicleA,equipmentModel:'Concurrent A',imei:'666666666666666',monthlyCost:0,installationDate:'2026-09-10'}),
    TrackerAuthorityService.create(operational,{vehicleId:vehicleA,equipmentModel:'Concurrent B',imei:'777777777777777',monthlyCost:0,installationDate:'2026-09-10'}),
  ]);assert(a.id!==b.id,'concurrent requests collapsed different devices');
  const active=await db.execute(sql`SELECT id FROM trackers WHERE company_id=${companyA} AND vehicle_id=${vehicleA} AND status='ACTIVE'`);assert(rows(active).length===1,`expected exactly one ACTIVE tracker got ${rows(active).length}`);
}

async function testRls():Promise<void>{
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,status,created_at,updated_at) VALUES ('security-2k-legacy-b',${companyB},${vehicleB},'LEGACY-B','INACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE ON trackers TO ${roleName}`));
  const url=new URL(process.env.DATABASE_URL||'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');const client=new Client({host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1),user:roleName,password:rolePassword});await client.connect();
  try{await client.query('BEGIN');await client.query(`SELECT set_config('app.current_tenant',$1,true)`,[companyA]);const visible=await client.query('SELECT company_id FROM trackers');assert(visible.rows.every((r:any)=>r.company_id===companyA),'tracker RLS leaked tenant');let rejected=false;try{await client.query(`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,status) VALUES ('security-2k-cross',$1,$2,'X','INACTIVE')`,[companyB,vehicleB]);}catch{rejected=true;}assert(rejected,'tracker RLS allowed cross-tenant insert');await client.query('ROLLBACK');}
  finally{await client.end();await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));}
}

async function main():Promise<void>{await seed();await testHttpSecurity();await testAtomicRecurringLifecycle();await testConcurrentReplacement();await testRls();console.log('SECURITY-2K tracker authority integration: PASS');}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
