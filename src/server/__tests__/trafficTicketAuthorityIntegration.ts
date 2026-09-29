import express from 'express';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db} from '../../db';
import {UnitOfWork} from '../../db/uow';
import {
  TrafficTicketAuthorityService,isTrafficTicketDiscountAvailable,setTrafficTicketTestHooksForTests,
} from '../trafficTicketAuthority';
import {TrafficTicketVehicleOperationalAuthorityService} from '../trafficTicketVehicleOperationalAuthority';
import {registerTrafficTicketRoutes} from '../trafficTicketRoutes';
import {registerAttachmentRoutes} from '../attachmentRoutes';
import {TicketResponsibility,TicketStatus} from '../../types/enums';
import type {AuthenticatedPrincipal} from '../auth';

const require=createRequire(import.meta.url);const {Client}=require('pg') as typeof import('pg');
const companyA='security-2m-company-a',companyB='security-2m-company-b',adminA='security-2m-admin-a',readonlyA='security-2m-readonly-a';
const vehicleA='security-2m-vehicle-a',vehicleB='security-2m-vehicle-b',driverA='security-2m-driver-a',driverB='security-2m-driver-b';
const expenseA='security-2m-expense-a',incomeA='security-2m-income-a';
const roleName='security_2m_rls_user',rolePassword='security-m-test-password';
const admin:AuthenticatedPrincipal={companyId:companyA,userId:adminA,name:'M Admin',role:'ADMIN',permissions:['*']};
const readonly:AuthenticatedPrincipal={companyId:companyA,userId:readonlyA,name:'M Viewer',role:'READONLY',permissions:[]};
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
async function one(query:any):Promise<any>{return rows(await db.execute(query))[0];}
function input(autoNumber:string,responsibility:TicketResponsibility,extra:any={}){
  return {vehicleId:vehicleA,autoNumber,organName:'DETRAN',infractionCode:'745-50',description:'Teste SECURITY-2M',infractionDate:'2026-08-01',infractionTime:'14:35',dueDate:'2026-09-10',originalAmount:200,points:4,responsibility,baseExpenseCategoryId:expenseA,...extra};
}

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'M A','ACTIVE',NOW(),NOW()),(${companyB},'M B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES(${adminA},${companyA},'M Admin','m-admin@example.test','ADMIN',true,NOW(),NOW()),(${readonlyA},${companyA},'M Viewer','m-view@example.test','READONLY',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES(${vehicleA},${companyA},'MAA1A01','MREN-A','AVAILABLE',1000,NOW(),NOW()),(${vehicleB},${companyB},'MBB1B01','MREN-B','AVAILABLE',2000,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO drivers(id,company_id,name,cpf,cnh,active,birth_date,phone,whatsapp,cnh_category,cnh_expiration,app_platforms,status,is_archived,created_at,updated_at)
    VALUES(${driverA},${companyA},'Motorista A','11111111111','CNH-A',true,'1990-01-01','11999999999','11999999999','B','2030-01-01',ARRAY[]::text[],'ACTIVE',false,NOW(),NOW()),
          (${driverB},${companyB},'Motorista B','22222222222','CNH-B',true,'1990-01-01','11888888888','11888888888','B','2030-01-01',ARRAY[]::text[],'ACTIVE',false,NOW(),NOW())
    ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at)
    VALUES(${expenseA},${companyA},'Multas','EXPENSE',true,NOW(),NOW()),(${incomeA},${companyA},'Reembolso de Multas','INCOME',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function httpSecurity():Promise<void>{
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const who=req.header('x-test-principal');if(who==='admin')(req as any).principal=admin;if(who==='readonly')(req as any).principal=readonly;next();});registerTrafficTicketRoutes(app);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));const address=server.address();if(!address||typeof address==='string')throw new Error('server unavailable');const base=`http://127.0.0.1:${address.port}`;
  try{
    let response=await fetch(`${base}/api/traffic-tickets`);assert(response.status===401,`no-session expected 401 got ${response.status}`);
    response=await fetch(`${base}/api/traffic-tickets`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'readonly'},body:JSON.stringify(input('M-HTTP-READONLY',TicketResponsibility.COMPANY))});assert(response.status===403,`READONLY expected 403 got ${response.status}`);
    response=await fetch(`${base}/api/traffic-tickets`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin'},body:JSON.stringify({...input('M-HTTP-FORGE',TicketResponsibility.COMPANY),companyId:companyB})});assert(response.status===400,`forged company expected 400 got ${response.status}`);
    response=await fetch(`${base}/api/traffic-tickets`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin'},body:JSON.stringify({...input('M-HTTP-CROSS',TicketResponsibility.COMPANY),vehicleId:vehicleB})});assert(response.status===404,`cross tenant vehicle expected 404 got ${response.status}`);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

async function atomicityAndRules():Promise<string>{
  setTrafficTicketTestHooksForTests({afterBasePayableCreated:()=>{throw new Error('INDUCED_M_FAILURE');}});let rolled=false;
  try{await TrafficTicketAuthorityService.create(admin,input('M-ROLLBACK',TicketResponsibility.COMPANY));}catch(error){rolled=String(error).includes('INDUCED_M_FAILURE');}finally{setTrafficTicketTestHooksForTests({});}
  let invalidTime=false;try{await TrafficTicketAuthorityService.create(admin,input('M-BAD-TIME',TicketResponsibility.COMPANY,{infractionTime:'24:61'}));}catch(error){invalidTime=String(error).includes('Horário da infração inválido');}assert(invalidTime,'invalid infraction time was accepted');
  assert(rolled,'induced failure did not propagate');
  assert(Number((await one(sql`SELECT count(*)::int count FROM traffic_tickets WHERE company_id=${companyA} AND auto_number='M-ROLLBACK'`))?.count)===0,'ticket survived rollback');
  assert(Number((await one(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA} AND description LIKE 'Multa M-ROLLBACK%'`))?.count)===0,'base AP survived rollback');
  assert(Number((await one(sql`SELECT count(*)::int count FROM operational_tasks WHERE company_id=${companyA} AND source_type='TRAFFIC_TICKET' AND title LIKE '%M-ROLLBACK%'`))?.count)===0,'operational alert survived rollback');

  const driver=await TrafficTicketAuthorityService.create(admin,input('M-DRIVER',TicketResponsibility.DRIVER,{driverId:driverA,driverIncomeCategoryId:incomeA,dueDate:'2099-09-10'}));
  assert(driver.item.status===TicketStatus.CHARGED_DRIVER&&Boolean(driver.item.payableId)&&Boolean(driver.item.receivableId)&&!driver.item.nicPayableId,'DRIVER aggregate mismatch');
  assert(!driver.item.contractId,'ticket without a matching contract must remain without contract linkage');
  const driverAp=await one(sql`SELECT origin_type,origin_id,vehicle_id,original_amount FROM account_payables WHERE id=${driver.item.payableId}`);
  const driverAr=await one(sql`SELECT origin_type,origin_id,vehicle_id,driver_id,original_amount FROM account_receivables WHERE id=${driver.item.receivableId}`);
  assert(driverAp.origin_type==='TRAFFIC_TICKET_COMPANY'&&driverAp.origin_id===driver.item.id&&driverAp.vehicle_id===vehicleA&&Number(driverAp.original_amount)===200,'DRIVER base AP traceability mismatch');
  assert(driverAr.origin_type==='TRAFFIC_TICKET_DRIVER'&&driverAr.origin_id===driver.item.id&&driverAr.driver_id===driverA&&Number(driverAr.original_amount)===200,'DRIVER AR traceability mismatch');
  const driverTask=await one(sql`SELECT title,description,category,priority,severity,status,source_type,source_id,entity_type,entity_id,assigned_team,due_at FROM operational_tasks WHERE company_id=${companyA} AND source_type='TRAFFIC_TICKET' AND source_id=${driver.item.id}`);
  assert(driverTask?.title==='Tratar multa M-DRIVER'&&driverTask.category==='FINE'&&driverTask.priority==='P2'&&driverTask.severity==='MEDIUM'&&driverTask.status==='OPEN','DRIVER operational alert classification mismatch');
  assert(driverTask.entity_type==='TRAFFIC_TICKET'&&driverTask.entity_id===driver.item.id&&driverTask.assigned_team==='OPERATIONS','DRIVER operational alert traceability mismatch');
  assert(['Auto: M-DRIVER','Veículo: MAA1A01','Motorista: Motorista A','Contrato: não localizado','Pontos: 4','Valor: R$ 200,00','Infração: 2026-08-01 às 14:35','Responsabilidade: DRIVER'].every(value=>String(driverTask.description).includes(value))&&String(driverTask.due_at).startsWith('2099-09-10'),'DRIVER operational alert context mismatch');

  const company=await TrafficTicketAuthorityService.create(admin,input('M-COMPANY',TicketResponsibility.COMPANY));
  assert(company.item.status===TicketStatus.COMPANY_PAYABLE_CREATED&&Boolean(company.item.payableId)&&!company.item.receivableId&&!company.item.nicPayableId,'COMPANY aggregate mismatch');
  assert(!company.item.driverId,'COMPANY responsibility must never persist driver_id');
  let companyDriverRejected=false;
  try{await TrafficTicketAuthorityService.create(admin,input('M-COMPANY-DRIVER',TicketResponsibility.COMPANY,{driverId:driverA}));}
  catch(error){companyDriverRejected=String(error).includes('não aceita motorista');}
  assert(companyDriverRejected,'COMPANY responsibility accepted browser/user driver authority');
  await TrafficTicketAuthorityService.cancel(admin,company.item.id,'Auto de infração cancelado');
  const cancelledTask=await one(sql`SELECT status,version FROM operational_tasks WHERE company_id=${companyA} AND source_type='TRAFFIC_TICKET' AND source_id=${company.item.id}`);
  assert(cancelledTask?.status==='CANCELLED'&&Number(cancelledTask.version)===2,'cancelled ticket left an actionable operational task');

  const unidentified=await TrafficTicketAuthorityService.create(admin,input('M-UNIDENTIFIED',TicketResponsibility.UNIDENTIFIED,{nicExpenseCategoryId:expenseA}));
  assert(unidentified.item.status===TicketStatus.PENDING_IDENTIFICATION&&Boolean(unidentified.item.payableId)&&Boolean(unidentified.item.nicPayableId)&&!unidentified.item.receivableId,'UNIDENTIFIED aggregate mismatch');
  const unidentifiedTask=await one(sql`SELECT title,priority,severity,source_id FROM operational_tasks WHERE company_id=${companyA} AND source_type='TRAFFIC_TICKET' AND source_id=${unidentified.item.id}`);
  assert(unidentifiedTask?.title==='Identificar condutor da multa M-UNIDENTIFIED'&&unidentifiedTask.priority==='P1'&&unidentifiedTask.severity==='HIGH','UNIDENTIFIED alert must prioritize driver identification');
  const totals=await one(sql`SELECT sum(original_amount)::numeric total,count(*)::int count FROM account_payables WHERE company_id=${companyA} AND id IN (${unidentified.item.payableId!},${unidentified.item.nicPayableId!})`);
  assert(Number(totals.total)===400&&Number(totals.count)===2,'NIC default must produce two separate APs totaling 2x');

  let duplicate=false;try{await TrafficTicketAuthorityService.create(admin,input('m-company',TicketResponsibility.COMPANY));}catch{duplicate=true;}assert(duplicate,'tenant auto number uniqueness not enforced');

  let companyTransitionDriverRejected=false;
  try{await TrafficTicketAuthorityService.changeResponsibility(admin,unidentified.item.id,{responsibility:TicketResponsibility.COMPANY,driverId:driverA});}
  catch(error){companyTransitionDriverRejected=String(error).includes('não aceita motorista');}
  assert(companyTransitionDriverRejected,'COMPANY responsibility transition accepted driver authority');

  const changed=await TrafficTicketAuthorityService.changeResponsibility(admin,unidentified.item.id,{responsibility:TicketResponsibility.DRIVER,driverId:driverA,driverIncomeCategoryId:incomeA});
  assert(changed.item.payableId===unidentified.item.payableId&&Boolean(changed.item.receivableId)&&!changed.item.nicPayableId,'responsibility transition did not preserve base AP/reconcile secondary obligations');
  const reclassifiedTask=await one(sql`SELECT title,description,priority,severity,status,version FROM operational_tasks WHERE company_id=${companyA} AND source_type='TRAFFIC_TICKET' AND source_id=${changed.item.id}`);
  assert(reclassifiedTask?.title==='Tratar multa M-UNIDENTIFIED'&&reclassifiedTask.priority==='P2'&&reclassifiedTask.severity==='MEDIUM'&&reclassifiedTask.status==='OPEN'&&Number(reclassifiedTask.version)===2,'responsibility transition did not reclassify the operational task');
  assert(String(reclassifiedTask.description).includes('Motorista: Motorista A')&&String(reclassifiedTask.description).includes('Responsabilidade: DRIVER'),'responsibility transition left stale operational alert context');
  const oldNic=await one(sql`SELECT status FROM account_payables WHERE id=${unidentified.item.nicPayableId}`);assert(oldNic.status==='CANCELLED','old NIC not cancelled');

  const blocked=await TrafficTicketAuthorityService.create(admin,input('M-PAID-BLOCK',TicketResponsibility.UNIDENTIFIED,{nicExpenseCategoryId:expenseA}));
  await db.execute(sql`UPDATE account_payables SET paid_amount=1,balance_amount=original_amount-1,status='PARTIALLY_PAID' WHERE id=${blocked.item.nicPayableId}`);
  let conflict=false;try{await TrafficTicketAuthorityService.changeResponsibility(admin,blocked.item.id,{responsibility:TicketResponsibility.COMPANY});}catch(error){conflict=String(error).includes('Não é possível cancelar');}
  assert(conflict,'paid/partial NIC was cancelled without reversal');
  const stillUnidentified=await TrafficTicketAuthorityService.getDetails(companyA,blocked.item.id);assert(stillUnidentified?.item.responsibility===TicketResponsibility.UNIDENTIFIED,'failed transition was not rolled back');

  assert(isTrafficTicketDiscountAvailable({discountedAmount:160,discountDueDate:'2026-08-20'},'2026-08-20'),'discount boundary should include deadline');
  assert(!isTrafficTicketDiscountAvailable({discountedAmount:160,discountDueDate:'2026-08-20'},'2026-08-21'),'discount must expire after deadline');
  return driver.item.id;
}

async function contractResolutionAndVehiclePending():Promise<void>{
  const contractId='security-2m-contract-resolved';
  await db.execute(sql`
    INSERT INTO contracts(id,company_id,driver_id,vehicle_id,status,contract_number,start_date,end_date,rental_amount,billing_periodicity,billing_due_day_of_week,billing_due_day_of_month,security_deposit_amount,franchise_km,excess_km_rate,signature_required,is_archived,created_at,updated_at)
    VALUES(${contractId},${companyA},${driverA},${vehicleA},'CLOSED','CTR-RESOLVED','2026-07-15','2026-08-15',1000,'WEEKLY',1,1,0,0,0,true,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING
  `);
  const companyWithoutContract=await TrafficTicketAuthorityService.create(admin,input('M-COMPANY-NO-CONTRACT-LINK',TicketResponsibility.COMPANY));
  assert(!companyWithoutContract.item.contractId&&!companyWithoutContract.item.driverId&&Boolean(companyWithoutContract.item.payableId)&&!companyWithoutContract.item.receivableId&&!companyWithoutContract.item.nicPayableId,'COMPANY must create only base AP and ignore resolvable contract/driver');

  const resolved=await TrafficTicketAuthorityService.create(admin,input('M-RESOLVED',TicketResponsibility.DRIVER,{driverIncomeCategoryId:incomeA}));
  assert(resolved.item.contractId===contractId&&resolved.item.driverId===driverA,'single contract covering infraction date was not resolved');
  const alert=await one(sql`SELECT description FROM operational_tasks WHERE company_id=${companyA} AND source_type='TRAFFIC_TICKET' AND source_id=${resolved.item.id} AND category='FINE'`);
  assert(String(alert?.description||'').includes('Contrato: CTR-RESOLVED'),'resolved contract was not propagated to operational alert');

  const first=await TrafficTicketVehicleOperationalAuthorityService.create(admin,resolved.item.id,'DOCUMENTATION');
  const replay=await TrafficTicketVehicleOperationalAuthorityService.create(admin,resolved.item.id,'DOCUMENTATION');
  assert(first.created&&first.category==='DOCUMENT'&&!replay.created&&replay.taskId===first.taskId,'vehicle documentation pending must be idempotent');
  const task=await one(sql`SELECT category,source_type,source_id,entity_type,entity_id,status,idempotency_key FROM operational_tasks WHERE company_id=${companyA} AND id=${first.taskId}`);
  assert(task?.category==='DOCUMENT'&&task.source_type==='TRAFFIC_TICKET_VEHICLE_ACTION'&&task.source_id===`${resolved.item.id}:DOCUMENTATION`&&task.entity_type==='VEHICLE'&&task.entity_id===vehicleA&&task.status==='OPEN','vehicle operational pending traceability mismatch');
  assert(String(task.idempotency_key)===`traffic-ticket-vehicle-action:${resolved.item.id}:DOCUMENTATION`,'vehicle operational pending idempotency key mismatch');
}

async function overlappingContractIsFailClosed():Promise<void>{
  const historical=[['security-2m-contract-1','FINISHED'],['security-2m-contract-2','CLOSED']] as const;
  for(const [id,status] of historical)await db.execute(sql`
    INSERT INTO contracts(id,company_id,driver_id,vehicle_id,status,contract_number,start_date,end_date,rental_amount,billing_periodicity,billing_due_day_of_week,billing_due_day_of_month,security_deposit_amount,franchise_km,excess_km_rate,signature_required,is_archived,created_at,updated_at)
    VALUES(${id},${companyA},${driverA},${vehicleA},${status},${id},'2026-07-01','2026-09-30',1000,'WEEKLY',1,1,0,0,0,true,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING
  `);
  const count=await one(sql`SELECT count(*)::int count FROM contracts WHERE company_id=${companyA} AND vehicle_id=${vehicleA} AND id IN ('security-2m-contract-1','security-2m-contract-2')`);
  assert(Number(count.count)===2,'historical overlap fixture was not created');
  let rejected=false;try{await TrafficTicketAuthorityService.create(admin,input('M-OVERLAP',TicketResponsibility.DRIVER,{driverIncomeCategoryId:incomeA}));}catch{rejected=true;}
  assert(rejected,'overlapping contracts assigned driver arbitrarily');
}

async function attachmentBinding(ticketId:string):Promise<void>{
  await UnitOfWork.run(companyA,async tx=>{await tx.getAttachmentRepo().create({id:randomUUID(),companyId:companyA,entityType:'TrafficTicket',entityName:'TrafficTicket',entityId:ticketId,documentType:'TRAFFIC_TICKET_NOTICE',fileName:'multa.pdf',mimeType:'application/pdf',fileSize:10,uploadedBy:admin.name,storageProvider:'SERVER_FS',storageKey:'test/multa.pdf',checksum:'checksum',createdBy:admin.userId,isArchived:false,contentState:'AVAILABLE',createdAt:new Date().toISOString()});});
  const app=express();app.use((req,_res,next)=>{(req as any).principal=admin;next();});registerAttachmentRoutes(app);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));const address=server.address();if(!address||typeof address==='string')throw new Error('attachment server unavailable');
  try{const response=await fetch(`http://127.0.0.1:${address.port}/api/attachments?entityType=TrafficTicket&entityId=${encodeURIComponent(ticketId)}`);assert(response.status===200,`ticket attachment binding expected 200 got ${response.status}`);const payload:any=await response.json();assert(Array.isArray(payload.items)&&payload.items.length===1,'ticket attachment not returned');}
  finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

async function rls():Promise<void>{
  await db.execute(sql`INSERT INTO traffic_tickets(id,company_id,vehicle_id,auto_number,amount,issue_date,status,organ_name,infraction_code,description,infraction_date,due_date,original_amount,points,responsibility,created_by,responsibility_version,canonical_ready,created_at,updated_at)
    VALUES('security-2m-ticket-b',${companyB},${vehicleB},'M-B',100,'2026-08-01','COMPANY_PAYABLE_CREATED','DETRAN','X','B','2026-08-01','2026-09-01',100,0,'COMPANY','seed',0,true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE ON traffic_tickets TO ${roleName}`));
  const url=new URL(process.env.DATABASE_URL||'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');const client=new Client({host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1),user:roleName,password:rolePassword});await client.connect();
  try{await client.query('BEGIN');await client.query(`SELECT set_config('app.current_tenant',$1,true)`,[companyA]);const visible=await client.query('SELECT company_id FROM traffic_tickets WHERE canonical_ready=true');assert(visible.rows.every((row:any)=>row.company_id===companyA),'traffic ticket RLS leaked another tenant');let denied=false;try{await client.query(`INSERT INTO traffic_tickets(id,company_id,vehicle_id,auto_number,amount,issue_date,status,organ_name,infraction_code,description,infraction_date,due_date,original_amount,points,responsibility,created_by,responsibility_version,canonical_ready) VALUES('security-2m-cross',$1,$2,'CROSS',100,'2026-08-01','COMPANY_PAYABLE_CREATED','X','X','X','2026-08-01','2026-09-01',100,0,'COMPANY','x',0,true)`,[companyB,vehicleB]);}catch{denied=true;}assert(denied,'RLS allowed cross-tenant insert');await client.query('ROLLBACK');}
  finally{await client.end();await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));}
}

async function main():Promise<void>{await seed();await httpSecurity();const ticketId=await atomicityAndRules();await contractResolutionAndVehiclePending();await overlappingContractIsFailClosed();await attachmentBinding(ticketId);await rls();console.log('SECURITY-2M traffic ticket authority integration: PASS');}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});