import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { TelemetryAuthorityService,resolveTelemetryRetentionDays } from '../telemetryAuthority';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
const companyA='telemetry-1f-company-a',companyB='telemetry-1f-company-b';
const vehicleA='telemetry-1f-vehicle-a',vehicleB='telemetry-1f-vehicle-b';
const trackerA='telemetry-1f-tracker-a',trackerB='telemetry-1f-tracker-b';

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'Telemetry 1F A','ACTIVE',NOW(),NOW()),(${companyB},'Telemetry 1F B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES(${vehicleA},${companyA},'T1F1A01','T1F-A-REN','AVAILABLE',4100,NOW(),NOW()),(${vehicleB},${companyB},'T1F1B01','T1F-B-REN','AVAILABLE',5200,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at) VALUES(${trackerA},${companyA},${vehicleA},'T1F-A-SERIAL','Synthetic GPS A','555555555555555',0,'2026-08-25','ACTIVE',NOW(),NOW()),(${trackerB},${companyB},${vehicleB},'T1F-B-SERIAL','Synthetic GPS B','666666666666666',0,'2026-08-25','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO tracker_telemetry_events(id,company_id,tracker_id,source_event_id,event_type,occurred_at,received_at,status,quarantine_reason,review_status,raw_payload,created_by,created_at) VALUES
    ('telemetry-1f-event-old',${companyA},${trackerA},'telemetry-1f-source-old','HEARTBEAT','2026-01-01T00:00:00Z','2026-01-01T00:00:01Z','ACCEPTED',NULL,NULL,'{"signal":"ok"}'::jsonb,'telemetry-1f-system','2026-01-01T00:00:01Z'),
    ('telemetry-1f-event-pending',${companyA},${trackerA},'telemetry-1f-source-pending','ODOMETER','2026-08-24T00:00:00Z','2026-08-24T00:00:01Z','QUARANTINED','ODOMETER_REGRESSION','PENDING','{"odometerKm":4099}'::jsonb,'telemetry-1f-system','2026-08-24T00:00:01Z')
    ON CONFLICT(id) DO NOTHING`);
}
async function main():Promise<void>{
  await seed();
  assert(resolveTelemetryRetentionDays('30')===30,'valid retention window rejected');
  for(const invalid of [undefined,'','7','3651','90.5','abc'])assert(resolveTelemetryRetentionDays(invalid)===90,'invalid retention window did not use safe default');
  const before=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM tracker_telemetry_events WHERE company_id=${companyA} AND tracker_id=${trackerA}`))[0].count);
  const summary=await TelemetryAuthorityService.observability(companyA,trackerA,new Date('2026-08-25T12:00:00.000Z'),'30');
  assert(summary.retentionDays===30&&summary.totalEvents===2&&summary.acceptedEvents===1&&summary.quarantinedEvents===1,'aggregate counts are incorrect');
  assert(summary.pendingReviewEvents===1&&summary.retentionEligibleEvents===1,'pending or retention eligibility count is incorrect');
  assert(summary.oldestReceivedAt==='2026-01-01T00:00:01.000Z'&&summary.newestReceivedAt==='2026-08-24T00:00:01.000Z','aggregate range is incorrect');
  assert(!Object.keys(summary).some(key=>['companyId','rawPayload','imei','latitude','longitude'].includes(key)),'observability leaked protected data');
  const after=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM tracker_telemetry_events WHERE company_id=${companyA} AND tracker_id=${trackerA}`))[0].count);
  assert(before===after,'observability deleted or mutated telemetry');
  let crossTenant=false;try{await TelemetryAuthorityService.observability(companyA,trackerB);}catch{crossTenant=true;}assert(crossTenant,'cross-tenant observability was exposed');
  const empty=await TelemetryAuthorityService.observability(companyB,trackerB,new Date('2026-08-25T12:00:00.000Z'),'90');
  assert(empty.totalEvents===0&&empty.oldestReceivedAt===null&&empty.newestReceivedAt===null,'empty observability summary is inconsistent');
  const vehicleKm=Number(rows(await db.execute(sql`SELECT current_km FROM vehicles WHERE company_id=${companyA} AND id=${vehicleA}`))[0].current_km);
  const payables=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count);
  assert(vehicleKm===4100&&payables===0,'observability changed KM or finance');
  console.log('TELEMETRY-1F read-only observability integration: PASS');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
