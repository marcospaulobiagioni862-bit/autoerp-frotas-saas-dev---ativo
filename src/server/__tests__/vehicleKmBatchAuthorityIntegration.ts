import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { TelemetryAuthorityService } from '../telemetryAuthority';
import {
  VehicleKmReadingAuthority,
  VehicleKmReadingValidationError,
} from '../vehicleKmReadingAuthority';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}

const companyId='km-batch-company-a';
const admin:AuthenticatedPrincipal={
  companyId,
  userId:'km-batch-admin-a',
  name:'KM Batch Admin',
  role:'ADMIN',
  permissions:['*'],
};
const vehicleA='km-batch-vehicle-a';
const vehicleB='km-batch-vehicle-b';
const trackerA='km-batch-tracker-a';
const photoA='km-batch-photo-a';

async function resetAndSeed():Promise<void>{
  await db.execute(sql`DELETE FROM tracker_telemetry_events WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicle_km_reading_schedules WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicle_km_records WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM file_attachments WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM trackers WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicles WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id=${companyId}`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyId},'KM Batch Company','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${admin.userId},${companyId},'KM Batch Admin','km-batch-admin@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,is_archived,created_at,updated_at)
    VALUES
      (${vehicleA},${companyId},'KMA1A01','KMA-REN-001','AVAILABLE',1000,false,NOW(),NOW()),
      (${vehicleB},${companyId},'KMB1B02','KMB-REN-002','AVAILABLE',2000,false,NOW(),NOW())
  `);
}

async function vehicleKm(vehicleId:string):Promise<number>{
  const row=rows(await db.execute(sql`SELECT current_km FROM vehicles WHERE company_id=${companyId} AND id=${vehicleId}`))[0];
  return Number(row.current_km);
}

async function main():Promise<void>{
  await resetAndSeed();

  const weekly=await VehicleKmReadingAuthority.upsertSchedule(admin,vehicleA,{frequency:'WEEKLY',weekday:1,dayOfMonth:null});
  assert(weekly.frequency==='WEEKLY'&&weekly.weekday===1,'weekly vehicle schedule was not persisted');
  const monthly=await VehicleKmReadingAuthority.upsertSchedule(admin,vehicleB,{frequency:'MONTHLY',weekday:null,dayOfMonth:31});
  assert(monthly.frequency==='MONTHLY'&&monthly.dayOfMonth===31,'monthly vehicle schedule was not persisted');
  const schedules=await VehicleKmReadingAuthority.listSchedules(companyId);
  assert(schedules.length===2,'vehicle schedules were not listed');

  let atomicRejected=false;
  try{
    await VehicleKmReadingAuthority.recordBatch(admin,[
      {vehicleId:vehicleA,sourceType:'MANUAL',kmValue:1100},
      {vehicleId:vehicleB,sourceType:'MANUAL',kmValue:1900},
    ]);
  }catch(error){atomicRejected=error instanceof VehicleKmReadingValidationError;}
  assert(atomicRejected,'regressive row did not reject the whole KM batch');
  assert(await vehicleKm(vehicleA)===1000,'atomic rollback failed for the valid row');
  assert(await vehicleKm(vehicleB)===2000,'atomic rollback failed for the invalid row');
  assert(Number(rows(await db.execute(sql`SELECT count(*)::int count FROM vehicle_km_records WHERE company_id=${companyId}`))[0].count)===0,'rejected batch left KM records behind');

  const manual=await VehicleKmReadingAuthority.recordBatch(admin,[
    {vehicleId:vehicleA,sourceType:'MANUAL',kmValue:1100},
    {vehicleId:vehicleB,sourceType:'MANUAL',kmValue:2100},
  ]);
  assert(manual.length===2&&manual.every(item=>item.created&&item.sourceType==='MANUAL'),'manual KM batch did not create both readings');
  assert(manual.find(item=>item.vehicleId===vehicleA)?.distanceKm===100,'manual KM distance for vehicle A is wrong');
  assert(await vehicleKm(vehicleA)===1100&&await vehicleKm(vehicleB)===2100,'manual KM batch did not update vehicles');

  await db.execute(sql`
    INSERT INTO file_attachments(
      id,company_id,entity_type,entity_name,entity_id,document_type,file_name,mime_type,url,size,file_size,
      storage_provider,storage_key,checksum,created_by,is_archived,content_state,created_at
    ) VALUES(
      ${photoA},${companyId},'Vehicle','Vehicle',${vehicleA},'KM_ODOMETER_PHOTO','odometro.jpg','image/jpeg',
      'attachment://km-batch-photo',1,1,'SERVER_FS','km/batch/photo','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ${admin.userId},false,'AVAILABLE',NOW()
    )
  `);
  const photo=await VehicleKmReadingAuthority.recordBatch(admin,[
    {vehicleId:vehicleA,sourceType:'DRIVER_PHOTO',kmValue:1150,sourceAttachmentId:photoA},
  ]);
  assert(photo[0].record.sourceType==='DRIVER_PHOTO'&&photo[0].record.sourceAttachmentId===photoA,'photo KM evidence was not preserved');
  assert(await vehicleKm(vehicleA)===1150,'photo KM did not update vehicle');

  await db.execute(sql`
    INSERT INTO trackers(
      id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at
    ) VALUES(
      ${trackerA},${companyId},${vehicleA},'KM-BATCH-SERIAL','Synthetic KM Tracker','555555555555555',0,'2026-09-01','ACTIVE',NOW(),NOW()
    )
  `);
  const telemetry=await TelemetryAuthorityService.ingest(admin,{
    trackerId:trackerA,
    sourceEventId:'km-batch-telemetry-1',
    eventType:'ODOMETER',
    occurredAt:new Date(Date.now()-60_000).toISOString(),
    payload:{odometerKm:1200,imei:'555555555555555'},
  });
  assert(telemetry.item.status==='ACCEPTED','tracker odometer was not accepted');
  const candidate=await VehicleKmReadingAuthority.trackerCandidate(companyId,vehicleA);
  assert(candidate.kmValue===1200&&candidate.trackerId===trackerA,'server did not derive tracker KM candidate');

  let spoofRejected=false;
  try{
    await VehicleKmReadingAuthority.recordBatch(admin,[{vehicleId:vehicleA,sourceType:'TRACKER',kmValue:9999}]);
  }catch(error){spoofRejected=error instanceof VehicleKmReadingValidationError;}
  assert(spoofRejected,'browser-supplied tracker KM was accepted');
  assert(await vehicleKm(vehicleA)===1150,'spoofed tracker KM mutated vehicle');

  const tracker=await VehicleKmReadingAuthority.recordBatch(admin,[{vehicleId:vehicleA,sourceType:'TRACKER'}]);
  assert(tracker[0].record.sourceType==='TRACKER'&&tracker[0].record.sourceTrackerId===trackerA,'tracker source metadata was not persisted');
  assert(tracker[0].currentKm===1200&&await vehicleKm(vehicleA)===1200,'server-derived tracker KM did not update vehicle');

  const sourceRows=rows(await db.execute(sql`
    SELECT source_type,source_attachment_id,source_tracker_id
    FROM vehicle_km_records
    WHERE company_id=${companyId} AND vehicle_id=${vehicleA}
    ORDER BY created_at,id
  `));
  assert(sourceRows.some(row=>row.source_type==='MANUAL'),'manual source missing from KM history');
  assert(sourceRows.some(row=>row.source_type==='DRIVER_PHOTO'&&row.source_attachment_id===photoA),'photo source missing from KM history');
  assert(sourceRows.some(row=>row.source_type==='TRACKER'&&row.source_tracker_id===trackerA),'tracker source missing from KM history');

  const financialWrites=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}`))[0].count);
  assert(financialWrites===0,'KM batch created financial transactions before the finance integration stage');

  console.log('Vehicle KM batch authority integration: PASS');
}

main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
