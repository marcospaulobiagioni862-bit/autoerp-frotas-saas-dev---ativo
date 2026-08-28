import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { TelemetryAuthorityService,TelemetryConflictError,deriveTelemetryHealthStatus } from '../telemetryAuthority';
import { TelemetryKmDivergenceAuthority,deriveTelemetryKmDivergence } from '../telemetryKmDivergenceAuthority';
import type { AuthenticatedPrincipal } from '../auth';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
const companyA='telemetry-1a-company-a',companyB='telemetry-1a-company-b',vehicleA='telemetry-1a-vehicle-a',vehicleB='telemetry-1a-vehicle-b',trackerA='telemetry-1a-tracker-a',trackerB='telemetry-1a-tracker-b';
const adminA:AuthenticatedPrincipal={companyId:companyA,userId:'telemetry-1a-admin',name:'Telemetry Admin',role:'ADMIN',permissions:['*']};

async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'Telemetry A','ACTIVE',NOW(),NOW()),(${companyB},'Telemetry B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES(${adminA.userId},${companyA},'Telemetry Admin','telemetry@example.test','ADMIN',true,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES(${vehicleA},${companyA},'TLA1A01','TLA-REN','AVAILABLE',1000,NOW(),NOW()),(${vehicleB},${companyB},'TLB1B01','TLB-REN','AVAILABLE',2000,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at) VALUES(${trackerA},${companyA},${vehicleA},'TLA-SERIAL','Synthetic GPS A','111111111111111',0,'2026-08-25','ACTIVE',NOW(),NOW()),(${trackerB},${companyB},${vehicleB},'TLB-SERIAL','Synthetic GPS B','222222222222222',0,'2026-08-25','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}

async function main():Promise<void>{
  await seed();
  const noOdometer=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(noOdometer.direction==='UNAVAILABLE'&&noOdometer.telemetryOdometerKm===null&&noOdometer.differenceKm===null,'missing accepted odometer invented divergence');
  const occurredAt=new Date(Date.now()-60_000).toISOString();
  const beforePayables=rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count;
  const first=await TelemetryAuthorityService.ingest(adminA,{trackerId:trackerA,sourceEventId:'synthetic-odometer-1',eventType:'ODOMETER',occurredAt,payload:{odometerKm:1000,imei:'111111111111111'}});
  assert(first.created&&first.item.status==='ACCEPTED'&&first.item.reviewStatus===null,'first synthetic odometer not accepted');
  const replay=await TelemetryAuthorityService.ingest(adminA,{trackerId:trackerA,sourceEventId:'synthetic-odometer-1',eventType:'ODOMETER',occurredAt,payload:{odometerKm:1000}});
  assert(!replay.created&&replay.item.id===first.item.id,'replay was not idempotent');
  const regressive=await TelemetryAuthorityService.ingest(adminA,{trackerId:trackerA,sourceEventId:'synthetic-odometer-2',eventType:'ODOMETER',occurredAt,payload:{odometerKm:999}});
  assert(regressive.item.status==='QUARANTINED'&&regressive.item.quarantineReason==='ODOMETER_REGRESSION'&&regressive.item.reviewStatus==='PENDING','regressive odometer not pending human review');
  const divergence=await TelemetryKmDivergenceAuthority.get(companyA,trackerA);
  assert(divergence.direction==='ALIGNED'&&divergence.authoritativeVehicleKm===1000&&divergence.telemetryOdometerKm===1000&&divergence.differenceKm===0&&divergence.thresholdKm===5,'accepted KM divergence is incorrect');
  assert(deriveTelemetryKmDivergence(1000,1006).direction==='TELEMETRY_ABOVE'&&deriveTelemetryKmDivergence(1000,994).direction==='TELEMETRY_BELOW','KM divergence direction derivation failed');

  let acceptedReviewDenied=false;
  try{await TelemetryAuthorityService.review(adminA,trackerA,first.item.id,{decision:'DISMISSED',reason:'Evento aceito não deve ser revisado'});}catch{acceptedReviewDenied=true;}
  assert(acceptedReviewDenied,'accepted event was reviewable');
  let crossTenant=false;
  try{await TelemetryAuthorityService.review(adminA,trackerB,regressive.item.id,{decision:'ACKNOWLEDGED',reason:'Tentativa de outro tenant'});}catch{crossTenant=true;}
  assert(crossTenant,'cross-tenant review was accepted');
  let crossTenantDivergence=false;try{await TelemetryKmDivergenceAuthority.get(companyA,trackerB);}catch{crossTenantDivergence=true;}assert(crossTenantDivergence,'cross-tenant KM divergence was exposed');

  const auditBefore=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TrackerTelemetryEvent' AND entity_id=${regressive.item.id} AND action='UPDATE'`))[0].count);
  const reviewed=await TelemetryAuthorityService.review(adminA,trackerA,regressive.item.id,{decision:'ACKNOWLEDGED',reason:'Divergência confirmada em revisão humana'});
  assert(reviewed.changed&&reviewed.item.reviewStatus==='ACKNOWLEDGED'&&reviewed.item.reviewReason==='Divergência confirmada em revisão humana'&&reviewed.item.reviewedAt!==null,'review was not persisted');
  const reviewReplay=await TelemetryAuthorityService.review(adminA,trackerA,regressive.item.id,{decision:'ACKNOWLEDGED',reason:'Divergência confirmada em revisão humana'});
  assert(!reviewReplay.changed&&reviewReplay.item.reviewStatus==='ACKNOWLEDGED','exact review replay was not idempotent');
  let conflict=false;
  try{await TelemetryAuthorityService.review(adminA,trackerA,regressive.item.id,{decision:'DISMISSED',reason:'Tentativa conflitante'});}catch(error){conflict=error instanceof TelemetryConflictError;}
  assert(conflict,'conflicting review did not fail closed');
  const auditAfter=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM audit_logs WHERE company_id=${companyA} AND entity_type='TrackerTelemetryEvent' AND entity_id=${regressive.item.id} AND action='UPDATE'`))[0].count);
  assert(auditAfter===auditBefore+1,'review replay duplicated audit or review was not audited');

  const listed=await TelemetryAuthorityService.list(companyA,trackerA);
  assert(listed.length===2&&listed.every(item=>!Object.prototype.hasOwnProperty.call(item,'rawPayload')&&!Object.prototype.hasOwnProperty.call(item,'reviewedBy')&&!Object.prototype.hasOwnProperty.call(item,'companyId')&&!Object.prototype.hasOwnProperty.call(item,'imei')),'list leaked protected telemetry data');
  assert(listed.some(item=>item.id===regressive.item.id&&item.reviewStatus==='ACKNOWLEDGED'),'reviewed event missing from sanitized list');
  const health=await TelemetryAuthorityService.health(companyA,trackerA);
  assert(health.healthStatus==='ATTENTION'&&health.lastAcceptedOdometerKm===1000&&health.quarantinedLast24h===1,'server-derived tracker health is incorrect');
  assert(!Object.prototype.hasOwnProperty.call(health,'rawPayload')&&!Object.prototype.hasOwnProperty.call(health,'companyId')&&!Object.prototype.hasOwnProperty.call(health,'imei'),'health summary leaked protected telemetry');
  let crossTenantHealth=false;try{await TelemetryAuthorityService.health(companyA,trackerB);}catch{crossTenantHealth=true;}assert(crossTenantHealth,'cross-tenant health was exposed');
  const now=new Date('2026-08-25T12:00:00.000Z');
  assert(deriveTelemetryHealthStatus('ACTIVE',null,0,now)==='NO_DATA','NO_DATA boundary failed');
  assert(deriveTelemetryHealthStatus('ACTIVE','2026-08-25T11:00:00.000Z',0,now)==='HEALTHY','HEALTHY boundary failed');
  assert(deriveTelemetryHealthStatus('ACTIVE','2026-08-25T09:00:00.000Z',0,now)==='STALE','STALE boundary failed');
  assert(deriveTelemetryHealthStatus('ACTIVE','2026-08-24T11:00:00.000Z',0,now)==='OFFLINE','OFFLINE boundary failed');
  assert(deriveTelemetryHealthStatus('ACTIVE','2026-08-25T11:00:00.000Z',1,now)==='ATTENTION','ATTENTION boundary failed');
  assert(deriveTelemetryHealthStatus('REMOVED','2026-08-25T11:00:00.000Z',0,now)==='INACTIVE','INACTIVE boundary failed');
  const vehicleKm=rows(await db.execute(sql`SELECT current_km FROM vehicles WHERE company_id=${companyA} AND id=${vehicleA}`))[0].current_km;
  assert(Number(vehicleKm)===1000,'telemetry review or divergence read changed authoritative vehicle KM');
  const afterPayables=rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count;
  assert(Number(beforePayables)===Number(afterPayables),'telemetry review or divergence read created a financial payable');
  console.log('TELEMETRY-1D/1H synthetic authority, human review and KM divergence integration: PASS');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
