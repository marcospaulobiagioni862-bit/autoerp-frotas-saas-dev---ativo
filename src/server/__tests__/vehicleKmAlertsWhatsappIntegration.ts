import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { VehicleKmAlertAuthority } from '../vehicleKmAlertAuthority';
import { VehicleKmReadingAuthority } from '../vehicleKmReadingAuthority';
import { TelemetryAuthorityService } from '../telemetryAuthority';
import { generateOperationalPendings } from '../../domain/operations/serverOperationalPendingProjection';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function today():string{return new Date().toISOString().slice(0,10);}
function isoWeekday(dateOnly:string):number{const d=new Date(`${dateOnly}T00:00:00Z`).getUTCDay();return d===0?7:d;}

const companyId='km-alert-company-a';
const admin:AuthenticatedPrincipal={
  companyId,userId:'km-alert-admin-a',name:'KM Alert Admin',role:'ADMIN',permissions:['*'],
};
const driverId='km-alert-driver-a';
const vehicleId='km-alert-vehicle-a';
const trackerId='km-alert-tracker-a';

async function resetAndSeed():Promise<void>{
  await db.execute(sql`DELETE FROM tracker_telemetry_events WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM whatsapp_outbox WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM whatsapp_consents WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicle_km_reading_schedules WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicle_km_records WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM trackers WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM vehicles WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM drivers WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id=${companyId}`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at)
    VALUES(${companyId},'KM Alert Company','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${admin.userId},${companyId},'KM Alert Admin','km-alert-admin@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`
    INSERT INTO drivers(
      id,company_id,name,cpf,cnh,active,birth_date,phone,whatsapp,cnh_category,cnh_expiration,
      app_platforms,status,is_archived,created_at,updated_at
    ) VALUES(
      ${driverId},${companyId},'Motorista KM','52998224725','02650306461',true,'1990-01-01',
      '11987654321','11987654321','B','2035-01-01',ARRAY['synthetic'],'ACTIVE',false,NOW(),NOW()
    )
  `);
  await db.execute(sql`
    INSERT INTO vehicles(
      id,company_id,plate,renavam,brand,model,status,current_km,current_driver_id,is_archived,created_at,updated_at
    ) VALUES(
      ${vehicleId},${companyId},'KMA1A01','12345678901','VW','Gol','AVAILABLE',1000,${driverId},false,NOW(),NOW()
    )
  `);
  const due=today(),weekday=isoWeekday(due);
  await db.execute(sql`
    INSERT INTO vehicle_km_reading_schedules(
      company_id,vehicle_id,frequency,weekday,day_of_month,next_due_date,created_by,updated_by,created_at,updated_at
    ) VALUES(
      ${companyId},${vehicleId},'WEEKLY',${weekday},NULL,${due},${admin.userId},${admin.userId},NOW(),NOW()
    )
  `);
  await db.execute(sql`
    INSERT INTO whatsapp_consents(
      company_id,driver_id,phone_e164,status,consent_source,granted_by,granted_at,created_at,updated_at
    ) VALUES(
      ${companyId},${driverId},'+5511987654321','GRANTED','ERP_MANUAL',${admin.userId},NOW(),NOW(),NOW()
    )
  `);
}

async function main():Promise<void>{
  await resetAndSeed();

  let alerts=await VehicleKmAlertAuthority.listAlerts(companyId);
  assert(alerts.length===1,'due KM reading did not surface as an alert');
  const initial=alerts[0];
  assert(initial.stage==='DUE_TODAY','due-today KM alert stage is wrong');
  assert(initial.whatsappEligible===true,'eligible driver was blocked from KM WhatsApp');
  assert(initial.trackerFresh===false,'tracker freshness was reported without tracker evidence');

  const projected=generateOperationalPendings({companyId,kmReadingAlerts:alerts});
  assert(projected.length===1,'KM reading alert did not enter operational pending projection');
  assert(projected[0].category==='Quilometragem','KM pending category is wrong');
  assert(projected[0].actionKind==='REQUEST_KM_WHATSAPP','KM pending did not expose WhatsApp action');

  const first=await VehicleKmAlertAuthority.prepareWhatsappBatch(admin,[vehicleId]);
  assert(first.length===1&&first[0].status==='HELD_PROVIDER_DISABLED'&&first[0].created===true,'first KM WhatsApp preparation was not created');
  assert(first[0].providerCallApplied===false,'KM WhatsApp unexpectedly applied a provider call');

  const second=await VehicleKmAlertAuthority.prepareWhatsappBatch(admin,[vehicleId]);
  assert(second.length===1&&second[0].status==='HELD_PROVIDER_DISABLED'&&second[0].created===false,'KM WhatsApp preparation is not idempotent');
  assert(second[0].outboxId===first[0].outboxId,'idempotent KM WhatsApp replay changed outbox id');

  const outbox=rows(await db.execute(sql`
    SELECT template_key,reference_type,reference_id,status,template_parameters
    FROM whatsapp_outbox
    WHERE company_id=${companyId}
  `));
  assert(outbox.length===1,'KM WhatsApp created duplicate outbox rows');
  assert(outbox[0].template_key==='KM_READING_REQUEST','KM WhatsApp used the wrong template');
  assert(outbox[0].reference_type==='VEHICLE_KM_READING','KM WhatsApp used the wrong reference type');
  assert(String(outbox[0].reference_id)===`${vehicleId}:${today()}`,'KM WhatsApp reference did not bind to vehicle and reading cycle');
  assert(String(outbox[0].status)==='HELD_PROVIDER_DISABLED','KM WhatsApp must remain provider-disabled');

  const template=rows(await db.execute(sql`
    SELECT version,body_text,parameter_keys
    FROM whatsapp_template_catalog
    WHERE company_id=${companyId} AND template_key='KM_READING_REQUEST' AND status='ACTIVE'
  `));
  assert(template.length===1,'KM WhatsApp template was not auto-seeded for a company created after migrations');
  assert(String(template[0].body_text).includes('foto do odômetro'),'KM WhatsApp template does not request odometer evidence');

  await db.execute(sql`
    INSERT INTO trackers(
      id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at
    ) VALUES(
      ${trackerId},${companyId},${vehicleId},'KM-ALERT-SERIAL','Synthetic Tracker','555555555555555',0,'2026-09-01','ACTIVE',NOW(),NOW()
    )
  `);
  const telemetry=await TelemetryAuthorityService.ingest(admin,{
    trackerId,
    sourceEventId:'km-alert-telemetry-1',
    eventType:'ODOMETER',
    occurredAt:new Date(Date.now()-60_000).toISOString(),
    payload:{odometerKm:1200,imei:'555555555555555'},
  });
  assert(telemetry.item.status==='ACCEPTED','fresh tracker odometer was not accepted');

  alerts=await VehicleKmAlertAuthority.listAlerts(companyId);
  assert(alerts.length===1&&alerts[0].trackerFresh===true,'fresh tracker evidence was not detected');
  assert(alerts[0].whatsappEligible===false,'fresh tracker evidence did not suppress KM WhatsApp');
  assert(String(alerts[0].whatsappBlockedReason||'').includes('Rastreador'),'tracker suppression reason is missing');

  const trackerSuppressed=await VehicleKmAlertAuthority.prepareWhatsappBatch(admin,[vehicleId]);
  assert(trackerSuppressed.length===1&&trackerSuppressed[0].status==='SKIPPED','fresh tracker did not block KM WhatsApp preparation');

  await VehicleKmReadingAuthority.recordBatch(admin,[{vehicleId,sourceType:'TRACKER'}]);
  alerts=await VehicleKmAlertAuthority.listAlerts(companyId);
  assert(alerts.length===0,'KM alert remained after tracker reading advanced the schedule');

  const financialWrites=Number(rows(await db.execute(sql`
    SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyId}
  `))[0].count);
  assert(financialWrites===0,'KM alert/WhatsApp stage mutated finance before the finance integration stage');

  console.log('Vehicle KM alerts and WhatsApp integration: PASS');
}

main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
