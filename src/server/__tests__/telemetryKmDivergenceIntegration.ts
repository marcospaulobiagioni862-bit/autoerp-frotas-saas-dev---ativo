import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { TelemetryAuthorityService } from '../telemetryAuthority';
import { TelemetryKmDivergenceAuthority,deriveTelemetryKmDivergence } from '../telemetryKmDivergenceAuthority';
import type { AuthenticatedPrincipal } from '../auth';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
const companyA='telemetry-1h-company-a',companyB='telemetry-1h-company-b';
const vehicleA='telemetry-1h-vehicle-a',vehicleB='telemetry-1h-vehicle-b';
const trackerA='telemetry-1h-tracker-a',trackerB='telemetry-1h-tracker-b';
const adminA:AuthenticatedPrincipal={companyId:companyA,userId:'telemetry-1h-admin-a',name:'Telemetry 1H Admin',role:'ADMIN',permissions:['*']};

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'Telemetry 1H A','ACTIVE',NOW(),NOW()),(${companyB},'Telemetry 1H B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES(${adminA.userId},${companyA},'Telemetry 1H Admin','telemetry-1h@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES(${vehicleA},${companyA},'THA1A01','THA-REN','AVAILABLE',1000,NOW(),NOW()),(${vehicleB},${companyB},'THB1B01','THB-REN','AVAILABLE',2200,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at) VALUES(${trackerA},${companyA},${vehicleA},'THA-SERIAL','Synthetic GPS A','333333333333333',0,'2026-08-28','ACTIVE',NOW(),NOW()),(${trackerB},${companyB},${vehicleB},'THB-SERIAL','Synthetic GPS B','444444444444444',0,'2026-08-28','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function main():Promise<void>{
  await seed();
  const empty=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(empty.direction==='UNAVAILABLE'&&empty.telemetryOdometerKm===null&&empty.differenceKm===null,'missing accepted odometer invented a KM value');
  const occurredAt=new Date(Date.now()-60_000).toISOString();
  const accepted=await TelemetryAuthorityService.ingest(adminA,{trackerId:trackerA,sourceEventId:'telemetry-1h-accepted-1',eventType:'ODOMETER',occurredAt,payload:{odometerKm:1012.5,imei:'333333333333333'}});
  assert(accepted.item.status==='ACCEPTED','baseline odometer was not accepted');
  const above=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(above.authoritativeVehicleKm===1000&&above.telemetryOdometerKm===1012.5&&above.differenceKm===12.5&&above.direction==='TELEMETRY_ABOVE'&&above.thresholdKm===5,'accepted odometer divergence is incorrect');
  const quarantined=await TelemetryAuthorityService.ingest(adminA,{trackerId:trackerA,sourceEventId:'telemetry-1h-quarantine-1',eventType:'ODOMETER',occurredAt,payload:{odometerKm:900,imei:'333333333333333'}});
  assert(quarantined.item.status==='QUARANTINED','regressive odometer was not quarantined');
  const afterQuarantine=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(afterQuarantine.telemetryOdometerKm===1012.5&&afterQuarantine.direction==='TELEMETRY_ABOVE','quarantined odometer became authoritative reference');
  await db.execute(sql`UPDATE vehicles SET current_km=1010 WHERE company_id=${companyA} AND id=${vehicleA}`);
  const aligned=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(aligned.differenceKm===2.5&&aligned.direction==='ALIGNED','threshold alignment is incorrect');
  await db.execute(sql`UPDATE vehicles SET current_km=1025 WHERE company_id=${companyA} AND id=${vehicleA}`);
  const below=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(below.differenceKm===12.5&&below.direction==='TELEMETRY_BELOW','telemetry-below direction is incorrect');
  let crossTenant=false;try{await TelemetryKmDivergenceAuthority.get(companyA,trackerB);}catch{crossTenant=true;}assert(crossTenant,'cross-tenant tracker divergence was exposed');
  assert(deriveTelemetryKmDivergence(1000,1005).direction==='ALIGNED','threshold boundary must be aligned');
  assert(deriveTelemetryKmDivergence(1000,1005.001).direction==='TELEMETRY_ABOVE','above-threshold boundary failed');
  const vehicleKm=Number(rows(await db.execute(sql`SELECT current_km FROM vehicles WHERE company_id=${companyA} AND id=${vehicleA}`))[0].current_km);
  assert(vehicleKm===1025,'divergence read mutated authoritative vehicle KM');
  const financialWrites=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM financial_transactions WHERE company_id=${companyA}`))[0].count);
  assert(financialWrites===0,'KM divergence read created a financial transaction');
  console.log('TELEMETRY-1H1 authoritative KM divergence integration: PASS');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
