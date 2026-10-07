import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { matchesMaintenanceTemplate as matches, validateTemplateApplicability as validate } from '../../domain/maintenance/maintenanceTemplateApplicability';
import type { AuthenticatedPrincipal } from '../auth';

// Force disposable in-memory persistence before importing server dependencies.
process.env.NODE_ENV = 'test';
process.env.USE_PGLITE = 'true';
const { UnitOfWork } = await import('../../db/uow');
const { MaintenancePlanTemplateAuthority: authority } = await import('../maintenancePlanTemplateAuthority');
const { MaintenancePreventiveClient: client } = await import('../../api/maintenancePreventiveClient');
const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../drizzle/0074_maintenance_template_applicability.sql', import.meta.url), 'utf8');
const vehicle = { companyId:'a', brand:'Volkswagen', model:'Gol', yearModel:2020, currentKm:20000 };
const generic = { companyId:'a' };
assert(matches('a', generic, vehicle));
assert(matches('a', {...generic,manufacturer:'  volkswagen  '}, vehicle));
assert(!matches('a', {...generic,manufacturer:'Fiat'}, vehicle));
assert(matches('a', {...generic,manufacturer:'VOLKSWAGEN',model:' gol '}, vehicle));
assert(!matches('a', {...generic,manufacturer:'Volkswagen',model:'Polo'}, vehicle));
assert(matches('a', {...generic,model:'GOL  TRACK'}, {...vehicle,model:'Gol\tTrack'}));
assert(matches('a', {...generic,yearFrom:2020,yearTo:2020}, vehicle));
assert(!matches('a', {...generic,yearFrom:2021}, vehicle));
assert(!matches('a', {...generic,yearTo:2019}, vehicle));
assert(!matches('a', {...generic,yearFrom:2019}, {...vehicle,yearModel:undefined}));
assert(!matches('a', {...generic,yearTo:2025}, {...vehicle,yearModel:0}));
assert(!matches('a', {...generic,manufacturer:'Volkswagen'}, {...vehicle,brand:undefined}));
assert(!matches('a', {...generic,engine:'1.0'}, vehicle), 'unknown engine must fail closed');
// Engine matching is ready for authoritative data, but Vehicle currently supplies none.
assert(matches('a', {...generic,engine:' 1.0 MPI '}, {...vehicle,engine:'1.0 mpi'}));
assert(!matches('a', {...generic,engine:'1.0'}, {...vehicle,engine:'1.6'}));
const bands=[{kmMin:0,kmMax:19999},{kmMin:20000,kmMax:50000},{kmMin:50001}];
for(const [km,expected] of [[0,0],[19999,0],[20000,1],[50000,1],[50001,2],[900000,2]] as const){
  assert.deepEqual(bands.map((band,index)=>matches('a',{...generic,...band},{...vehicle,currentKm:km})?index:-1).filter(index=>index>=0),[expected]);
}
assert(!matches('a',{...generic,kmMin:100}, {...vehicle,currentKm:99}));
assert(!matches('a',{...generic,kmMax:50000}, {...vehicle,currentKm:50001}));
assert(!matches('a',generic,{...vehicle,currentKm:-1}));
assert(!matches('a',generic,{...vehicle,currentKm:20000.5}));
assert(!matches('a',{companyId:'b'},vehicle));
assert(!matches('a',generic,{...vehicle,companyId:'b'}));
assert(!matches('',generic,vehicle));
assert.deepEqual(validate({}),{});
assert.equal(validate({kmMin:null},{kmMin:10}).kmMin,undefined);
for(const bad of [{kmMin:10,kmMax:9},{yearFrom:2021,yearTo:2020},{kmMin:-1},{kmMax:1.5},{yearFrom:0},{manufacturer:' '},{engine:12},{kmMin:'20000'}]){
  assert.throws(()=>validate(bad as never));
}

const db=new PGlite();
const originalRun=UnitOfWork.run;
const originalFetch=globalThis.fetch;
const dialect=new PgDialect();
const principal={companyId:'a',userId:'u',name:'Test',role:'ADMIN',permissions:['*']} as AuthenticatedPrincipal;
const contextFor=(tx:any)=>({
  getRawTransaction:()=>({execute:(statement:SQL)=>{const q=dialect.sqlToQuery(statement);return tx.query(q.sql,q.params);}}),
  getVehicleRepo:()=>({findByIdForCompanyWithLock:async(companyId:string,id:string)=>{
    const r=await tx.query('SELECT * FROM vehicles WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,id]);
    const v=r.rows[0];return v?{id:v.id,companyId:v.company_id,brand:v.brand,model:v.model,yearModel:v.year_model,currentKm:v.current_km,isArchived:v.is_archived,status:v.status}:null;
  }}),
  getAuditLogRepo:()=>({create:async(item:any)=>{await tx.query('INSERT INTO audit_events(company_id,entity_id) VALUES($1,$2)',[item.companyId,item.entityId]);}}),
});
try{
  await db.exec(`
    CREATE TABLE work_orders(id text,company_id text,status text,exit_km integer,completed_at timestamptz);
    CREATE TABLE vehicles(id text PRIMARY KEY,company_id text,brand text,model text,year_model integer,current_km integer,is_archived boolean DEFAULT false,status text DEFAULT 'AVAILABLE');
    CREATE TABLE audit_events(company_id text,entity_id text);
    INSERT INTO vehicles(id,company_id,brand,model,year_model,current_km) VALUES('v','a','Volkswagen','Gol',2020,20000),('foreign','b','Volkswagen','Gol',2020,20000);
  `);
  for(const name of ['0020_preventive_maintenance_authority.sql','0061_maintenance_global_plan_templates.sql','0069_maintenance_library_metadata.sql']){
    await db.exec(readFileSync(new URL(`../../../drizzle/${name}`,import.meta.url),'utf8'));
  }
  await db.exec("INSERT INTO maintenance_plan_templates(id,company_id,code,name,maintenance_type,interval_km,active,created_by) VALUES('legacy','a','LEGACY','Legacy','TEST',1000,true,'u')");
  await db.exec(migration);
  assert.equal((await db.query('SELECT * FROM maintenance_plans')).rows.length,0,'migration must not materialize plans');
  assert.equal((await db.query<any>("SELECT manufacturer,km_min,engine FROM maintenance_plan_templates WHERE id='legacy'")).rows[0].manufacturer,null);
  UnitOfWork.run=(async(_companyId:string,callback:any)=>db.transaction(async tx=>callback(contextFor(tx)))) as typeof UnitOfWork.run;
  const compatible=await authority.create(principal,{name:'Compatible M1',active:true,intervalKm:1000,manufacturer:' Volkswagen ',model:'Gol',yearFrom:2020,yearTo:2020,kmMin:20000,kmMax:50000});
  const incompatible=await authority.create(principal,{name:'Incompatible M1',active:true,intervalKm:1000,manufacturer:'Fiat'});
  const engine=await authority.create(principal,{name:'Engine M1',active:true,intervalKm:1000,engine:'1.0'});
  const other=await authority.create({...principal,companyId:'b'},{name:'Foreign M1',active:true,intervalKm:1000});
  assert.equal((await db.query('SELECT * FROM maintenance_plans')).rows.length,0,'saving active templates must not materialize');
  const apply=(templateId?:string,id='v')=>UnitOfWork.run('a',tx=>authority.applyToVehicleContext(tx,principal,{id,currentKm:999999},templateId));
  assert.equal(await apply(incompatible.id),0);
  assert.equal(await apply(engine.id),0);
  assert.equal(await apply(compatible.id),1);
  assert.equal(await apply(compatible.id),0,'eligible replay must be idempotent');
  assert.deepEqual(await Promise.all([apply(compatible.id),apply(compatible.id)]),[0,0]);
  await assert.rejects(()=>apply(other.id));
  await assert.rejects(()=>apply(compatible.id,'foreign'));
  const plan=(await db.query<any>('SELECT * FROM maintenance_plans WHERE template_id=$1',[compatible.id])).rows[0];
  assert.equal(plan.last_execution_km,20000,'must ignore supplied stale/spoofed KM');
  assert.equal(plan.next_due_km,21000);
  assert.equal(await apply('legacy'),1,'legacy generic template must still work');
  // The same transactional hook used by both vehicle-creation entry points.
  await UnitOfWork.run('a',async tx=>{
    await tx.getRawTransaction().execute((await import('drizzle-orm')).sql`INSERT INTO vehicles(id,company_id,brand,model,year_model,current_km) VALUES('new','a','Volkswagen','Gol',2020,20000)`);
    assert.equal(await authority.applyToVehicleContext(tx,principal,{id:'new',currentKm:20000}),2);
  });
  assert.equal((await db.query('SELECT * FROM maintenance_plans WHERE template_id=$1',[incompatible.id])).rows.length,0);
  const countBefore=(await db.query('SELECT * FROM maintenance_plans')).rows.length;
  assert.equal((await authority.applyToFleet(principal)).plansCreated,0);
  assert.equal((await db.query('SELECT * FROM maintenance_plans')).rows.length,countBefore);
  const updated=await authority.update(principal,compatible.id,{manufacturer:'Fiat',kmMin:50001,kmMax:null});
  assert.equal(updated.manufacturer,'Fiat');assert.equal(updated.kmMin,50001);assert.equal(updated.kmMax,undefined);
  assert.equal(await apply(compatible.id),0);
  assert.equal((await db.query('SELECT * FROM maintenance_plans')).rows.length,countBefore,'criteria edits must preserve existing history');
  await assert.rejects(()=>authority.update(principal,compatible.id,{kmMax:20}));
  await assert.rejects(()=>db.exec("UPDATE maintenance_plan_templates SET km_min=20,km_max=10 WHERE id='legacy'"));
  // Client round-trip preserves criteria; never performs matching itself.
  globalThis.fetch=(async()=>new Response(JSON.stringify({items:[updated]}))) as typeof fetch;
  assert.equal((await client.listTemplates())[0].kmMin,50001);
  globalThis.fetch=(async()=>new Response(JSON.stringify({items:[{...updated,kmMin:'50001'}]}))) as typeof fetch;
  await assert.rejects(()=>client.listTemplates());
  await db.exec("INSERT INTO vehicles(id,company_id,brand,model,year_model,current_km) VALUES('concurrent','a','Volkswagen','Gol',2020,20000)");
  const concurrent=await Promise.all([apply('legacy','concurrent'),apply('legacy','concurrent')]);
  assert.deepEqual(concurrent.sort(),[0,1],'concurrent first application must create exactly one plan');
  await db.exec('CREATE ROLE m1_rls; GRANT SELECT ON maintenance_plan_templates TO m1_rls; SET ROLE m1_rls;');
  await db.query("SELECT set_config('app.current_tenant','a',false)");
  assert((await db.query<any>('SELECT company_id FROM maintenance_plan_templates')).rows.every(row=>row.company_id==='a'),'template RLS leaked another tenant');
  await db.exec('RESET ROLE');
  assert.match(source('server/vehicleRoutes.ts'),/MaintenancePlanTemplateAuthority\.applyToVehicleContext/);
  assert.match(source('server/vehicleDocumentIntakeRoutes.ts'),/MaintenancePlanTemplateAuthority\.applyToVehicleContext/);
  const panel=source('components/maintenance/MaintenancePreventivePanel.tsx');
  const save=panel.slice(panel.indexOf('const saveTemplate='),panel.indexOf('const saveGlobalRule='));
  assert(!save.includes('applyTemplatesToFleet'),'saving must not apply to fleet');
  assert(!panel.includes('matchesMaintenanceTemplate'),'frontend must not duplicate matching');
  assert(!/INSERT\s+INTO\s+maintenance_plans/i.test(migration));
  const startup=readFileSync(new URL('../../../server.ts',import.meta.url),'utf8');
  assert(!/applyToFleet|applyTemplatesToFleet/.test(startup),'startup must not apply templates to fleet');
  console.log('Maintenance M1: PASS — generic/legacy, text/year/engine, all KM boundaries, materialization, replay, tenant, vehicle creation, no mass-apply, migration and client');
}finally{
  UnitOfWork.run=originalRun;globalThis.fetch=originalFetch;await db.close();
}
