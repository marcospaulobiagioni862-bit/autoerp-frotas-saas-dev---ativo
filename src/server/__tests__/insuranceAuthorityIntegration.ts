import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { InsuranceAuthorityService,setInsuranceTestHooksForTests } from '../insuranceAuthority';
import { registerInsuranceRoutes } from '../insuranceRoutes';
import { materializeInsuranceAlerts } from '../insuranceAlerts';
import type { AuthenticatedPrincipal } from '../auth';

const require=createRequire(import.meta.url);const {Client}=require('pg') as typeof import('pg');
const companyA='security-2l-company-a',companyB='security-2l-company-b';
const adminA='security-2l-admin-a',readonlyA='security-2l-readonly-a';
const vehicleA='security-2l-vehicle-a',vehicleB='security-2l-vehicle-b';
const categoryA='security-2l-insurance-category-a';
const roleName='security_2l_rls_user',rolePassword='security-l-test-password';
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
async function one(query:any):Promise<any>{return rows(await db.execute(query))[0];}
const admin:AuthenticatedPrincipal={companyId:companyA,userId:adminA,name:'L Admin',role:'ADMIN',permissions:['*']};
const readonly:AuthenticatedPrincipal={companyId:companyA,userId:readonlyA,name:'L Viewer',role:'READONLY',permissions:[]};

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'L A','ACTIVE',NOW(),NOW()),(${companyB},'L B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES(${adminA},${companyA},'L Admin','l-admin@example.test','ADMIN',true,NOW(),NOW()),(${readonlyA},${companyA},'L Viewer','l-view@example.test','READONLY',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES(${vehicleA},${companyA},'LAA1A01','LREN-A','AVAILABLE',1000,NOW(),NOW()),(${vehicleB},${companyB},'LBB1B01','LREN-B','AVAILABLE',2000,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES(${categoryA},${companyA},'Seguro','EXPENSE',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function testHttpSecurity():Promise<void>{
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const who=req.header('x-test-principal');if(who==='admin')(req as any).principal=admin;if(who==='readonly')(req as any).principal=readonly;next();});registerInsuranceRoutes(app);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));const address=server.address();if(!address||typeof address==='string')throw new Error('test server unavailable');const base=`http://127.0.0.1:${address.port}`;
  try{
    let response=await fetch(`${base}/api/insurances`);assert(response.status===401,`no-session expected 401 got ${response.status}`);
    response=await fetch(`${base}/api/insurances`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'readonly'},body:JSON.stringify({vehicleId:vehicleA,insuranceCompany:'X',policyNumber:'X',coverageDetails:'X',deductibleAmount:0,totalPremiumAmount:0,installmentsCount:1,startDate:'2026-09-01',endDate:'2027-09-01'})});assert(response.status===403,`READONLY expected 403 got ${response.status}`);
    response=await fetch(`${base}/api/insurances`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin'},body:JSON.stringify({companyId:companyB,vehicleId:vehicleA,insuranceCompany:'X',policyNumber:'FORGED',coverageDetails:'X',deductibleAmount:0,totalPremiumAmount:0,installmentsCount:1,startDate:'2026-09-01',endDate:'2027-09-01'})});assert(response.status===400,`forged companyId expected 400 got ${response.status}`);
    response=await fetch(`${base}/api/insurances`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin'},body:JSON.stringify({vehicleId:vehicleB,insuranceCompany:'Cross',policyNumber:'CROSS',coverageDetails:'X',deductibleAmount:0,totalPremiumAmount:0,installmentsCount:1,startDate:'2026-09-01',endDate:'2027-09-01'})});assert(response.status===404,`cross tenant vehicle expected 404 got ${response.status}`);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

async function testAtomicInsurance():Promise<void>{
  setInsuranceTestHooksForTests({afterPayablesCreated:()=>{throw new Error('INDUCED_INSURANCE_AUDIT_FAILURE');}});let failed=false;
  try{await InsuranceAuthorityService.create(admin,{vehicleId:vehicleA,insuranceCompany:'Rollback Seguros',policyNumber:'L-ROLLBACK',coverageDetails:'Completa',deductibleAmount:100,totalPremiumAmount:900,installmentsCount:3,startDate:'2026-09-20',endDate:'2027-09-20',categoryId:categoryA});}catch(error){failed=String(error).includes('INDUCED_INSURANCE_AUDIT_FAILURE');}finally{setInsuranceTestHooksForTests({});}
  assert(failed,'induced insurance failure did not propagate');assert(Number((await one(sql`SELECT count(*)::int count FROM insurances WHERE company_id=${companyA} AND policy_number='L-ROLLBACK'`))?.count)===0,'insurance survived failed UoW');assert(Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND description LIKE 'Seguro Rollback Seguros%'`))?.count)===0,'insurance payables survived rollback');

  const insurance=await InsuranceAuthorityService.create(admin,{vehicleId:vehicleA,insuranceCompany:'Auto Proteção',policyNumber:'L-001',coverageDetails:'Cobertura completa',deductibleAmount:1500,totalPremiumAmount:1200,installmentsCount:3,startDate:'2026-09-20',endDate:'2027-09-20',brokerName:'Corretora L',categoryId:categoryA});
  assert(insurance.status==='ACTIVE'&&insurance.accountPayableIds?.length===3,'insurance aggregate did not link installments');
  const ap=rows(await db.execute(sql`SELECT origin_type,origin_id,vehicle_id,category_id,installment_number,total_installments,original_amount,due_date::date::text due_date FROM account_payables WHERE company_id=${companyA} AND origin_type='INSURANCE' AND origin_id=${insurance.id} ORDER BY installment_number`));
  assert(ap.length===3,'expected three insurance installments');assert(ap.every(row=>row.origin_type==='INSURANCE'&&row.origin_id===insurance.id&&row.vehicle_id===vehicleA&&row.category_id===categoryA),'insurance AP traceability mismatch');assert(ap.reduce((sum,row)=>sum+Number(row.original_amount),0)===1200,'insurance installment total mismatch');assert(ap[0].due_date==='2026-09-20'&&ap[1].due_date==='2026-10-20'&&ap[2].due_date==='2026-11-20','insurance installment due dates mismatch');
  let duplicate=false;try{await InsuranceAuthorityService.create(admin,{vehicleId:vehicleA,insuranceCompany:'Outra',policyNumber:'l-001',coverageDetails:'X',deductibleAmount:0,totalPremiumAmount:0,installmentsCount:1,startDate:'2026-09-20',endDate:'2027-09-20'});}catch{duplicate=true;}assert(duplicate,'tenant policy uniqueness not enforced');

  await UnitOfWork.run(companyA,async tx=>{await tx.getAttachmentRepo().create({id:randomUUID(),companyId:companyA,entityType:'Insurance',entityName:'Insurance',entityId:insurance.id,documentType:'INSURANCE_POLICY',fileName:'apolice.pdf',mimeType:'application/pdf',fileSize:100,uploadedBy:admin.name,storageProvider:'FILESYSTEM',storageKey:'test/insurance/apolice.pdf',checksum:'test-checksum',createdBy:admin.userId,isArchived:false,contentState:'READY',createdAt:new Date().toISOString()});const attachments=await tx.getAttachmentRepo().findByEntity(companyA,'Insurance',insurance.id);assert(attachments.length===1&&attachments[0].contentState==='READY','insurance attachment binding failed');});

  const cancelled=await InsuranceAuthorityService.cancel(admin,insurance.id,'Apólice substituída');assert(cancelled.status==='CANCELLED'&&cancelled.cancellationReason==='Apólice substituída','insurance cancellation semantic mismatch');
  assert(Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_type='INSURANCE' AND origin_id=${insurance.id}`))?.count)===3,'cancel erased financial history');
}

async function testExpirationAlerts():Promise<void>{
  const expired=await InsuranceAuthorityService.create(admin,{vehicleId:vehicleA,insuranceCompany:'Prazo Seguros',policyNumber:'L-EXPIRED',coverageDetails:'Básica',deductibleAmount:0,totalPremiumAmount:0,installmentsCount:1,startDate:'2025-08-19',endDate:'2026-08-19'});
  const first=await materializeInsuranceAlerts(companyA,'2026-08-20');assert(first>=1,'post-due insurance alert not materialized');
  const persisted=await one(sql`SELECT status FROM insurances WHERE company_id=${companyA} AND id=${expired.id}`);assert(persisted.status==='EXPIRED','expired policy not promoted to EXPIRED');
  const before=Number((await one(sql`SELECT count(*)::int count FROM notifications WHERE company_id=${companyA} AND entity_type='Insurance' AND entity_id=${expired.id} AND alert_stage='POST_DUE'`))?.count);await materializeInsuranceAlerts(companyA,'2026-08-20');const after=Number((await one(sql`SELECT count(*)::int count FROM notifications WHERE company_id=${companyA} AND entity_type='Insurance' AND entity_id=${expired.id} AND alert_stage='POST_DUE'`))?.count);assert(before===after,'insurance alerts were not deduplicated');
}

async function testRls():Promise<void>{
  await db.execute(sql`INSERT INTO insurances(id,company_id,vehicle_id,insurance_company,policy_number,coverage_details,deductible_amount,total_premium_amount,installments_count,start_date,end_date,status,created_by) VALUES('security-2l-ins-b',${companyB},${vehicleB},'B Seguros','B-001','B',0,0,1,'2026-01-01','2027-01-01','ACTIVE','seed') ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE ON insurances TO ${roleName}`));
  const url=new URL(process.env.DATABASE_URL||'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');const client=new Client({host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1),user:roleName,password:rolePassword});await client.connect();
  try{await client.query('BEGIN');await client.query(`SELECT set_config('app.current_tenant',$1,true)`,[companyA]);const visible=await client.query('SELECT company_id FROM insurances');assert(visible.rows.every((row:any)=>row.company_id===companyA),'insurance RLS leaked another tenant');let rejected=false;try{await client.query(`INSERT INTO insurances(id,company_id,vehicle_id,insurance_company,policy_number,coverage_details,deductible_amount,total_premium_amount,installments_count,start_date,end_date,status,created_by) VALUES('security-2l-cross',$1,$2,'X','X','X',0,0,1,'2026-01-01','2027-01-01','ACTIVE','x')`,[companyB,vehicleB]);}catch{rejected=true;}assert(rejected,'insurance RLS allowed cross-tenant insert');await client.query('ROLLBACK');}
  finally{await client.end();await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));}
}

async function main():Promise<void>{await seed();await testHttpSecurity();await testAtomicInsurance();await testExpirationAlerts();await testRls();console.log('SECURITY-2L insurance authority integration: PASS');}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
