import express from 'express';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { OperationalAuthorityService, OperationalConflictError } from '../operationalAuthority';
import { registerOperationalRoutes } from '../operationalRoutes';

const require=createRequire(import.meta.url);const {Client}=require('pg') as typeof import('pg');
const companyA='security-2o-company-a',companyB='security-2o-company-b',adminA='security-2o-admin-a',adminB='security-2o-admin-b',viewerA='security-2o-viewer-a';
const roleName='security_2o_rls_user',rolePassword='security-2o-test-password';
const principalA:AuthenticatedPrincipal={companyId:companyA,userId:adminA,name:'2O Admin A',role:'ADMIN',permissions:['*']};
const principalB:AuthenticatedPrincipal={companyId:companyB,userId:adminB,name:'2O Admin B',role:'ADMIN',permissions:['*']};
const viewer:AuthenticatedPrincipal={companyId:companyA,userId:viewerA,name:'2O Viewer',role:'READONLY',permissions:[]};
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
async function one(query:any):Promise<any>{return rows(await db.execute(query))[0];}

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'2O A','ACTIVE',NOW(),NOW()),(${companyB},'2O B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'2O Admin A','2o-admin-a@example.test','ADMIN',true,NOW(),NOW()),
    (${viewerA},${companyA},'2O Viewer','2o-viewer-a@example.test','READONLY',true,NOW(),NOW()),
    (${adminB},${companyB},'2O Admin B','2o-admin-b@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,is_archived,created_at,updated_at) VALUES
    ('security-2o-vehicle-a',${companyA},'OAA1A01','2OREN-A','AVAILABLE',1000,false,NOW(),NOW()),
    ('security-2o-vehicle-b',${companyB},'OBB1B01','2OREN-B','AVAILABLE',1000,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function staticInvariant():Promise<void>{
  const files=['src/components/incidents/OperationalIncidentCenterView.tsx','src/components/tasks/OperationalTasksView.tsx','src/components/operations/ExecutiveOperationsCenterView.tsx'];
  const combined=(await Promise.all(files.map(file=>readFile(file,'utf8')))).join('\n');
  for(const marker of ['company-main-uuid','company-default-358','usr-exec-358','OperationsExecutiveTestRunner','ExecutiveOperationsService','OperationalIncidentService','OperationalTaskService','TaskService','IncidentManagementService','localStorage','StorageAdapter'])assert(!combined.includes(marker),`migrated production graph still contains ${marker}`);
  const client=await readFile('src/api/operationalAuthorityClient.ts','utf8');assert(client.includes("credentials:'include'"),'operational client is not session-authenticated');assert(!client.includes('companyId:'),'operational client sends tenant identity');
  const routes=await readFile('src/server/operationalRoutes.ts','utf8');assert(routes.includes("'companyId'"),'forged tenant field is not rejected');assert(routes.includes('requirePrincipal'),'operational routes are not authenticated');
}

async function coreRules():Promise<{taskId:string;incidentId:string}>{
  const taskInput={title:'Resolver bloqueio operacional',description:'Tarefa canônica SECURITY-2O',category:'OPERATIONAL_GENERAL' as const,priority:'P1' as const,severity:'HIGH' as const,sourceType:'MANUAL' as const,sourceId:'security-2o-task-source-a',entityType:'SYSTEM' as const,entityId:'operations',dueAt:'2026-12-31T12:00:00.000Z'};
  const task=await OperationalAuthorityService.createTask(principalA,taskInput,'security-2o-create-task-a');
  const replay=await OperationalAuthorityService.createTask(principalA,taskInput,'security-2o-create-task-a');assert(task.id===replay.id,'task idempotency did not replay the committed response');
  const started=await OperationalAuthorityService.transitionTask(principalA,task.id,{status:'IN_PROGRESS',reason:'start'},'security-2o-task-start');assert(started.status==='IN_PROGRESS','task did not start');
  const blocked=await OperationalAuthorityService.transitionTask(principalA,task.id,{status:'BLOCKED',reason:'dependency'},'security-2o-task-block');assert(blocked.status==='BLOCKED'&&blocked.blockedReason==='dependency','task block state mismatch');
  const unblocked=await OperationalAuthorityService.executeQuickAction(principalA,'UNBLOCK_TASK',task.id,'dependency removed','security-2o-task-unblock');assert(unblocked.success&&unblocked.item?.status==='IN_PROGRESS','executive quick action did not use canonical task authority');
  let invalid=false;try{await OperationalAuthorityService.transitionTask(principalA,task.id,{status:'CLOSED',reason:'skip'},'security-2o-task-invalid');}catch(error){invalid=error instanceof OperationalConflictError;}assert(invalid,'invalid task transition was accepted');

  const incidentInput={title:'Falha operacional crítica',description:'Incidente canônico SECURITY-2O',severity:'SEV1' as const,priority:'P1' as const,source:'MANUAL' as const,category:'OPERATIONAL_ERROR' as const,impactDescription:'Operação degradada',fingerprint:'security-2o-incident-a'};
  const incident=await OperationalAuthorityService.createIncident(principalA,incidentInput,'security-2o-create-incident-a');
  const incidentReplay=await OperationalAuthorityService.createIncident(principalA,incidentInput,'security-2o-create-incident-a');assert(incident.id===incidentReplay.id,'incident idempotency did not replay committed response');
  const ack=await OperationalAuthorityService.transitionIncident(principalA,incident.id,{status:'ACKNOWLEDGED',comment:'ack'},'security-2o-incident-ack');assert(ack.status==='ACKNOWLEDGED','incident acknowledgement failed');
  const inv=await OperationalAuthorityService.transitionIncident(principalA,incident.id,{status:'INVESTIGATING',comment:'investigate'},'security-2o-incident-investigate');assert(inv.status==='INVESTIGATING','incident investigation failed');
  const resolved=await OperationalAuthorityService.executeQuickAction(principalA,'RESOLVE_INCIDENT',incident.id,'root cause controlled','security-2o-incident-resolve');assert(resolved.success&&resolved.item?.status==='RESOLVED','executive incident resolution did not use canonical authority');

  await OperationalAuthorityService.createTask(principalB,{...taskInput,sourceId:'security-2o-task-source-b',title:'Tenant B task'},'security-2o-create-task-b');
  await OperationalAuthorityService.createIncident(principalB,{...incidentInput,title:'Tenant B incident',fingerprint:'security-2o-incident-b'},'security-2o-create-incident-b');
  const tasksA=await OperationalAuthorityService.listTasks(principalA);const incidentsA=await OperationalAuthorityService.listIncidents(principalA);assert(tasksA.every(item=>item.companyId===companyA),'task authority leaked cross tenant');assert(incidentsA.every(item=>item.companyId===companyA),'incident authority leaked cross tenant');
  const snapshot=await OperationalAuthorityService.getExecutiveSnapshot(principalA);assert(snapshot.companyId===companyA&&snapshot.activeTasks>=1,'executive snapshot is not tenant authoritative');assert(snapshot.topPriorityActions.every(item=>item.entityId!==''),'executive priorities contain invalid entity');
  const saved=await one(sql`SELECT count(*)::int count FROM executive_operation_snapshots WHERE company_id=${companyA}`);assert(Number(saved.count)>=1,'executive snapshot was not persisted');
  return {taskId:task.id,incidentId:incident.id};
}

async function httpSecurity():Promise<void>{
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const who=req.header('x-test-principal');if(who==='admin')(req as any).principal=principalA;if(who==='viewer')(req as any).principal=viewer;next();});registerOperationalRoutes(app);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));const address=server.address();if(!address||typeof address==='string')throw new Error('server unavailable');const base=`http://127.0.0.1:${address.port}`;
  try{
    let response=await fetch(`${base}/api/operations/tasks`);assert(response.status===401,`no-session expected 401 got ${response.status}`);
    response=await fetch(`${base}/api/operations/tasks`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'viewer','x-idempotency-key':'security-2o-http-viewer'},body:JSON.stringify({title:'No',description:'No',category:'OPERATIONAL_GENERAL',priority:'P2',severity:'MEDIUM',sourceType:'MANUAL',sourceId:'viewer',entityType:'SYSTEM',entityId:'operations'})});assert(response.status===403,`READONLY write expected 403 got ${response.status}`);
    response=await fetch(`${base}/api/operations/tasks`,{method:'POST',headers:{'content-type':'application/json','x-test-principal':'admin','x-idempotency-key':'security-2o-http-forge'},body:JSON.stringify({title:'Forge',description:'Forge',category:'OPERATIONAL_GENERAL',priority:'P2',severity:'MEDIUM',sourceType:'MANUAL',sourceId:'forge',entityType:'SYSTEM',entityId:'operations',companyId:companyB,userId:adminB,role:'ADMIN'})});assert(response.status===400,`forged identity expected 400 got ${response.status}`);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

async function rls():Promise<void>{
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));await db.execute(sql.raw(`CREATE ROLE ${roleName} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`));await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${roleName}`));
  for(const table of ['operational_tasks','operational_task_events','operational_incidents','operational_incident_actions','operational_command_idempotency','executive_operation_snapshots'])await db.execute(sql.raw(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO ${roleName}`));
  const url=new URL(process.env.DATABASE_URL||'postgres://postgres:postgres@127.0.0.1:5432/autoerp_phase1_test');const client=new Client({host:url.hostname,port:Number(url.port||5432),database:url.pathname.slice(1),user:roleName,password:rolePassword});await client.connect();
  try{await client.query('BEGIN');await client.query(`SELECT set_config('app.current_tenant',$1,true)`,[companyA]);const visible=await client.query('SELECT company_id FROM operational_tasks');assert(visible.rows.length>0&&visible.rows.every((row:any)=>row.company_id===companyA),'operational task RLS leaked another tenant');const incidentVisible=await client.query('SELECT company_id FROM operational_incidents');assert(incidentVisible.rows.length>0&&incidentVisible.rows.every((row:any)=>row.company_id===companyA),'operational incident RLS leaked another tenant');let denied=false;try{await client.query(`INSERT INTO operational_tasks(id,company_id,title,description,category,priority,severity,status,source_type,source_id,entity_type,entity_id,created_by_user_id,created_by_name,due_at,correlation_id,idempotency_key) VALUES('security-2o-cross',$1,'Cross','Cross','OPERATIONAL_GENERAL','P2','MEDIUM','OPEN','MANUAL','cross','SYSTEM','operations','x','x',NOW()+INTERVAL '1 day','cross','cross')`,[companyB]);}catch{denied=true;}assert(denied,'RLS allowed cross-tenant operational insert');await client.query('ROLLBACK');}
  finally{await client.end();await db.execute(sql.raw(`DROP OWNED BY ${roleName}`));await db.execute(sql.raw(`DROP ROLE IF EXISTS ${roleName}`));}
}

async function main():Promise<void>{await staticInvariant();await seed();const ids=await coreRules();await httpSecurity();await rls();console.log(JSON.stringify({suite:'SECURITY-2O operational authority',status:'PASS',taskId:ids.taskId,incidentId:ids.incidentId}));}
main().catch(error=>{console.error(error);process.exit(1);});
