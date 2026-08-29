import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { MaintenanceAuthorityService, setMaintenanceTestHooksForTests } from '../maintenanceAuthority';
import { registerMaintenanceRoutes } from '../maintenanceRoutes';
import type { AuthenticatedPrincipal } from '../auth';
import './maintenanceTimelineTestRunner';
import { runMaintenanceTimelineIntegration } from './maintenanceTimelineIntegration';
import { runMaintenanceSlaIntegration } from './maintenanceSlaIntegration';
import { runMaintenanceSlaRouteRegression } from './maintenanceSlaRoutesTestRunner';

const require = createRequire(import.meta.url);
const { Client } = require('pg') as typeof import('pg');

const companyA='security-2j1-company-a';
const companyB='security-2j1-company-b';
const adminA='security-2j1-admin-a';
const readonlyA='security-2j1-readonly-a';
const vehicleA='security-2j1-vehicle-a';
const vehicleB='security-2j1-vehicle-b';
const categoryA='security-2j1-maint-category-a';
const roleName='security_2j1_rls_user';
const rolePassword='security-j1-test-password';

function assert(condition: unknown, message: string): asserts condition { if(!condition) throw new Error(message); }
function rows(result:any):any[]{ return Array.isArray(result?.rows)?result.rows:[]; }
async function one(query:any):Promise<any>{ return rows(await db.execute(query))[0]; }

const adminPrincipal:AuthenticatedPrincipal={companyId:companyA,userId:adminA,name:'J1 Admin',role:'ADMIN',permissions:['*']};
const readonlyPrincipal:AuthenticatedPrincipal={companyId:companyA,userId:readonlyA,name:'J1 Viewer',role:'READONLY',permissions:[]};

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies (id,name,status,created_at,updated_at) VALUES (${companyA},'J1 Company A','ACTIVE',NOW(),NOW()),(${companyB},'J1 Company B','ACTIVE',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users (id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'J1 Admin','j1-admin@example.test','ADMIN',true,NOW(),NOW()),
    (${readonlyA},${companyA},'J1 Viewer','j1-viewer@example.test','READONLY',true,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles (id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES
    (${vehicleA},${companyA},'J1A1A01','J1RENAVAM-A','AVAILABLE',10000,NOW(),NOW()),
    (${vehicleB},${companyB},'J1B1B01','J1RENAVAM-B','AVAILABLE',20000,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_categories (id,company_id,name,type,active,created_at,updated_at) VALUES (${categoryA},${companyA},'Manutenção','EXPENSE',true,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
}

async function testHttpSecurity():Promise<void>{
  const app=express(); app.use(express.json());
  app.use((req,_res,next)=>{ const who=req.header('x-test-principal'); if(who==='admin') (req as any).principal=adminPrincipal; if(who==='readonly') (req as any).principal=readonlyPrincipal; next(); });
  registerMaintenanceRoutes(app);
  const server=createServer(app); await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',()=>resolve()));
  const address=server.address(); if(!address||typeof address==='string') throw new Error('test server address unavailable');
  const base=`http://127.0.0.1:${address.port}`;
  try {
    let response=await fetch(`${base}/api/maintenance/work-orders`); assert(response.status===401,`no-session expected 401 got ${response.status}`);
    response=await fetch(`${base}/api/maintenance/work-orders`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'readonly'},body:JSON.stringify({number:'FORBIDDEN'})});
    assert(response.status===403,`READONLY write expected 403 got ${response.status}`);
    response=await fetch(`${base}/api/maintenance/work-orders`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin'},body:JSON.stringify({companyId:companyB,number:'FORGED',vehicleId:vehicleA,entryKm:10000,description:'forged'})});
    assert(response.status===400,`forged authority expected 400 got ${response.status}`);
  } finally { await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve())); }
}

async function testAtomicLifecycle():Promise<void>{
  const supplier=await MaintenanceAuthorityService.createSupplier(adminPrincipal,{name:'Oficina J1',document:'12.345.678/0001-90',phone:'11999999999',category:'Oficina'});
  const part=await MaintenanceAuthorityService.createPart(adminPrincipal,{code:'PAST-J1',name:'Pastilha',category:'Freios',unit:'UN',currentCost:100,minimumStock:0,currentStock:10});
  const wo=await MaintenanceAuthorityService.createWorkOrder(adminPrincipal,{
    number:'OS-J1-001',vehicleId:vehicleA,supplierId:supplier.id,entryKm:10000,description:'Freios',
    parts:[{partId:part.id,quantity:2,unitCost:0.01}], laborItems:[{description:'Mão de obra',hours:1,hourlyRate:50}],discount:0,
  });
  assert(wo.subtotalParts===200,`catalog cost was not authoritative: ${wo.subtotalParts}`);
  assert(wo.total===250,`server total expected 250 got ${wo.total}`);

  const started=await MaintenanceAuthorityService.startWorkOrder(adminPrincipal,wo.id); assert(started.status==='IN_PROGRESS','start did not move OS');
  let vehicle=await one(sql`SELECT status,current_km FROM vehicles WHERE id=${vehicleA}`); assert(vehicle.status==='MAINTENANCE','vehicle not moved to MAINTENANCE');
  const kmBefore=Number((await one(sql`SELECT count(*)::int count FROM vehicle_km_records WHERE company_id=${companyA} AND vehicle_id=${vehicleA} AND reading_type='MAINTENANCE'`))?.count||0);

  setMaintenanceTestHooksForTests({afterPayableCreated:()=>{ throw new Error('INDUCED_AFTER_PAYABLE'); }});
  let failed=false;
  try { await MaintenanceAuthorityService.completeWorkOrder(adminPrincipal,wo.id,{exitKm:10125,categoryId:categoryA,dueDate:'2026-09-20',installmentsCount:2}); }
  catch(error){ failed=String(error).includes('INDUCED_AFTER_PAYABLE'); }
  finally { setMaintenanceTestHooksForTests({}); }
  assert(failed,'induced failure did not propagate');
  const apAfterFailure=await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_type='MAINTENANCE' AND origin_id=${wo.id}`);
  assert(Number(apAfterFailure?.count)===0,'payable survived failed transaction');
  const woAfterFailure=await one(sql`SELECT status,account_payable_id FROM work_orders WHERE id=${wo.id}`); assert(woAfterFailure.status==='IN_PROGRESS'&&!woAfterFailure.account_payable_id,'work order survived partially completed');
  vehicle=await one(sql`SELECT status,current_km FROM vehicles WHERE id=${vehicleA}`); assert(vehicle.status==='MAINTENANCE'&&Number(vehicle.current_km)===10000,'vehicle mutated despite rollback');
  const kmAfterFailure=Number((await one(sql`SELECT count(*)::int count FROM vehicle_km_records WHERE company_id=${companyA} AND vehicle_id=${vehicleA} AND reading_type='MAINTENANCE'`))?.count||0);
  assert(kmAfterFailure===kmBefore,'KM record survived failed transaction');

  const [c1,c2]=await Promise.all([
    MaintenanceAuthorityService.completeWorkOrder(adminPrincipal,wo.id,{exitKm:10125,categoryId:categoryA,dueDate:'2026-09-20',installmentsCount:2}),
    MaintenanceAuthorityService.completeWorkOrder(adminPrincipal,wo.id,{exitKm:10125,categoryId:categoryA,dueDate:'2026-09-20',installmentsCount:2}),
  ]);
  assert(c1.status==='COMPLETED'&&c2.status==='COMPLETED','concurrent completion did not converge');
  const ap=await db.execute(sql`SELECT id,installment_number,total_installments,original_amount FROM account_payables WHERE company_id=${companyA} AND origin_type='MAINTENANCE' AND origin_id=${wo.id} ORDER BY installment_number`);
  assert(rows(ap).length===2,`expected exactly two installments got ${rows(ap).length}`);
  assert(rows(ap).reduce((sum,row)=>sum+Number(row.original_amount),0)===250,'installment sum mismatch');
  const kmAfter=Number((await one(sql`SELECT count(*)::int count FROM vehicle_km_records WHERE company_id=${companyA} AND vehicle_id=${vehicleA} AND reading_type='MAINTENANCE'`))?.count||0);
  assert(kmAfter===kmBefore+1,`expected one maintenance KM record got ${kmAfter-kmBefore}`);
  vehicle=await one(sql`SELECT status,current_km FROM vehicles WHERE id=${vehicleA}`); assert(vehicle.status==='AVAILABLE'&&Number(vehicle.current_km)===10125,'completion did not restore vehicle/KM');

  const retry=await MaintenanceAuthorityService.completeWorkOrder(adminPrincipal,wo.id,{exitKm:10125,categoryId:categoryA,dueDate:'2026-09-20',installmentsCount:2});
  assert(retry.status==='COMPLETED','retry should be idempotent');
  assert(Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND origin_type='MAINTENANCE' AND origin_id=${wo.id}`))?.count)===2,'retry duplicated payable');

  const second=await MaintenanceAuthorityService.createWorkOrder(adminPrincipal,{number:'OS-J1-002',vehicleId:vehicleA,entryKm:10125,description:'Regression test',laborItems:[{description:'Teste',hours:1,hourlyRate:10}]});
  await MaintenanceAuthorityService.startWorkOrder(adminPrincipal,second.id);
  let regressionRejected=false;
  try { await MaintenanceAuthorityService.completeWorkOrder(adminPrincipal,second.id,{exitKm:10000,categoryId:categoryA,dueDate:'2026-09-20'}); }
  catch { regressionRejected=true; }
  assert(regressionRejected,'regressive exit KM was accepted');
  await MaintenanceAuthorityService.cancelWorkOrder(adminPrincipal,second.id,'Teste concluído');
  vehicle=await one(sql`SELECT status FROM vehicles WHERE id=${vehicleA}`); assert(vehicle.status==='AVAILABLE','cancel did not restore vehicle consistency');
}

async function testRls():Promise<void>{
  await db.execute(sql`INSERT INTO suppliers (id,company_id,name,document,category,status) VALUES ('j1-supplier-b',${companyB},'B Supplier','B-DOC','Oficina','ACTIVE') ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));
  await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE ON suppliers, parts, work_orders, work_order_parts, work_order_services, work_order_labor TO ${roleName}`));
  const url=new URL(process.env.DATABASE_URL||'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');
  const client=new Client({host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1),user:roleName,password:rolePassword});
  await client.connect();
  try {
    await client.query('BEGIN'); await client.query(`SELECT set_config('app.current_tenant',$1,true)`,[companyA]);
    const visible=await client.query(`SELECT company_id FROM suppliers`); assert(visible.rows.every((row:any)=>row.company_id===companyA),'RLS leaked another tenant');
    let rejected=false;
    try { await client.query(`INSERT INTO suppliers (id,company_id,name,document,category,status) VALUES ('j1-cross-tenant',$1,'X','X-DOC','X','ACTIVE')`,[companyB]); }
    catch { rejected=true; }
    assert(rejected,'RLS allowed cross-tenant insert');
    await client.query('ROLLBACK');
  } finally {
    await client.end();
    await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));
  }
}

async function main():Promise<void>{
  await seed();
  await testHttpSecurity();
  await testAtomicLifecycle();
  await testRls();
  await runMaintenanceTimelineIntegration();
  await runMaintenanceSlaIntegration();
  await runMaintenanceSlaRouteRegression();
  console.log('SECURITY-2J1 maintenance authority integration: PASS');
}
main().then(()=>process.exit(0)).catch((error)=>{console.error(error);process.exit(1);});
