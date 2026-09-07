import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import type { AuthenticatedPrincipal } from '../auth';
import {
  advanceVehicleKmInContext,
  VehicleKmReadingConflictError,
} from '../vehicleKmReadingAuthority';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}

const companyId='km-single-authority-company-a';
const vehicleId='km-single-authority-vehicle-a';
const principal:AuthenticatedPrincipal={
  companyId,
  userId:'km-single-authority-admin',
  name:'KM Single Authority Admin',
  role:'ADMIN',
  permissions:['*'],
};

async function currentKm():Promise<number>{
  const row=rows(await db.execute(sql`SELECT current_km FROM vehicles WHERE company_id=${companyId} AND id=${vehicleId}`))[0];
  return Number(row.current_km);
}

async function history():Promise<Array<{km:number;date:string;type:string}>>{
  return rows(await db.execute(sql`
    SELECT km_value,record_date,reading_type
    FROM vehicle_km_records
    WHERE company_id=${companyId} AND vehicle_id=${vehicleId}
    ORDER BY created_at,id
  `)).map(row=>({km:Number(row.km_value),date:String(row.record_date),type:String(row.reading_type)}));
}

async function advance(kmValue:number,date:string,notes:string){
  return UnitOfWork.run(companyId,async tx=>advanceVehicleKmInContext(tx,principal,{
    vehicleId,kmValue,recordDate:date,readingType:'PERIODIC',sourceType:'MANUAL',notes,advanceSchedule:false,
  }));
}

async function main():Promise<void>{
  await db.execute(sql`DELETE FROM vehicle_km_reading_schedules WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicle_km_records WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicles WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id=${companyId}`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyId},'KM Single Authority','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${principal.userId},${companyId},'KM Single Authority Admin','km-single-authority@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,is_archived,created_at,updated_at)
    VALUES(${vehicleId},${companyId},'KMS1A01','KMS-REN-001','AVAILABLE',10000,false,NOW(),NOW())
  `);

  const initial=await advance(10000,'2026-09-06','Leitura inicial de 10.000 KM');
  assert(initial.currentKm===10000&&initial.created,'initial KM history was not established');
  assert(await currentKm()===10000,'initial current KM changed unexpectedly');

  const updated=await advance(12000,'2026-09-07','Atualização recebida do motorista');
  assert(updated.previousKm===10000&&updated.currentKm===12000&&updated.distanceKm===2000,'10.000 -> 12.000 progression is wrong');
  assert(await currentKm()===12000,'vehicle snapshot did not synchronize to 12.000 KM');

  const firstHistory=await history();
  assert(firstHistory.length===2,'KM history must contain the old and new readings exactly once');
  assert(firstHistory[0].km===10000&&firstHistory[1].km===12000,'KM history lost the 10.000 -> 12.000 chronology');

  const retry=await advance(12000,'2026-09-07','Repetição da mesma atualização em outro ponto');
  assert(!retry.created&&retry.currentKm===12000,'same-day same-KM replay created a duplicate reading');
  assert((await history()).length===2,'same-day duplicate KM was persisted');

  let directSnapshotBlocked=false;
  try{
    await db.execute(sql`UPDATE vehicles SET current_km=13000 WHERE company_id=${companyId} AND id=${vehicleId}`);
  }catch{directSnapshotBlocked=true;}
  assert(directSnapshotBlocked,'direct current_km update bypassed KM history authority');
  assert(await currentKm()===12000,'blocked direct update changed the vehicle KM');

  let regressionBlocked=false;
  try{await advance(11000,'2026-09-08','Tentativa de regressão');}
  catch(error){regressionBlocked=error instanceof VehicleKmReadingConflictError;}
  assert(regressionBlocked,'regressive KM was accepted by the central authority');
  assert(await currentKm()===12000,'regressive KM changed the vehicle snapshot');

  await db.execute(sql`
    INSERT INTO vehicle_km_records(
      id,company_id,vehicle_id,km_value,record_date,reading_type,source_type,notes,created_at
    ) VALUES(
      'km-single-authority-direct-history',${companyId},${vehicleId},12500,'2026-09-08','PERIODIC','MANUAL',
      'Registro autoritativo inserido para validar sincronização do snapshot',NOW()
    )
  `);
  assert(await currentKm()===12500,'history insert did not synchronize vehicles.current_km');

  let duplicateBlocked=false;
  try{
    await db.execute(sql`
      INSERT INTO vehicle_km_records(
        id,company_id,vehicle_id,km_value,record_date,reading_type,source_type,notes,created_at
      ) VALUES(
        'km-single-authority-duplicate',${companyId},${vehicleId},12500,'2026-09-08','MAINTENANCE','MANUAL','Duplicado',NOW()
      )
    `);
  }catch{duplicateBlocked=true;}
  assert(duplicateBlocked,'same-day duplicate KM history was accepted');

  let directRegressionBlocked=false;
  try{
    await db.execute(sql`
      INSERT INTO vehicle_km_records(
        id,company_id,vehicle_id,km_value,record_date,reading_type,source_type,notes,created_at
      ) VALUES(
        'km-single-authority-regression',${companyId},${vehicleId},12400,'2026-09-09','PERIODIC','MANUAL','Regressão',NOW()
      )
    `);
  }catch{directRegressionBlocked=true;}
  assert(directRegressionBlocked,'database accepted a regressive KM record');
  assert(await currentKm()===12500,'database regression changed authoritative current KM');

  const finalHistory=await history();
  assert(finalHistory.map(item=>item.km).join(',')==='10000,12000,12500','final KM history chronology is inconsistent');

  const authoritySource=readFileSync(new URL('../vehicleKmReadingAuthority.ts',import.meta.url),'utf8');
  const runtimeFiles=[
    'vehicleRoutes.ts','vehicleDocumentIntakeRoutes.ts','vehicleInspectionRoutes.ts',
    'maintenanceAuthority.ts','maintenancePreventiveAuthority.ts','vehicleLifecycleRoutes.ts',
  ];
  for(const file of runtimeFiles){
    const source=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    assert(source.includes('advanceVehicleKmInContext'),`${file} does not use the central KM authority`);
    assert(!source.includes('getKmRecordRepo().create'),`${file} still creates KM history outside the central authority`);
  }
  assert(authoritySource.includes('findByIdForCompanyWithLock'),'central KM authority must lock the vehicle before accepting a reading');

  const migration=readFileSync(new URL('../../../drizzle/0068_vehicle_km_single_authority.sql',import.meta.url),'utf8');
  assert(migration.includes('trg_vehicle_current_km_guard'),'database current KM guard is missing');
  assert(migration.includes('trg_vehicle_km_record_sync_snapshot'),'database KM snapshot synchronization trigger is missing');
  assert(migration.includes('vehicle_km_records_daily_value_guard'),'database duplicate KM guard is missing');

  console.log('Vehicle KM single authority integration: PASS');
}

main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
