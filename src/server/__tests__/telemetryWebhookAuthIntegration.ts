import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { TelemetryAuthorityService } from '../telemetryAuthority';
import {
  TelemetryWebhookAuthenticationError,
  TelemetryWebhookAuthority,
  TelemetryWebhookReplayError,
  canonicalizeTelemetryWebhookBody,
  createTelemetryWebhookSignature,
} from '../telemetryWebhookAuth';
import type { AuthenticatedPrincipal } from '../auth';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rows(result: any): any[] { return Array.isArray(result?.rows) ? result.rows : []; }
const companyA='telemetry-1e-company-a',companyB='telemetry-1e-company-b';
const vehicleA='telemetry-1e-vehicle-a',vehicleB='telemetry-1e-vehicle-b';
const trackerA='telemetry-1e-tracker-a',trackerB='telemetry-1e-tracker-b';
const secretA='synthetic-test-secret-a-that-is-at-least-32-characters';
const secretB='synthetic-test-secret-b-that-is-at-least-32-characters';
const config=JSON.stringify({[companyA]:secretA,[companyB]:secretB});
const actorA:AuthenticatedPrincipal={companyId:companyA,userId:'telemetry-synthetic-webhook',name:'Synthetic Telemetry Webhook',role:'SYSTEM',permissions:['INGEST_TELEMETRY']};

async function rejectsAuthentication(callback:()=>unknown|Promise<unknown>,message:string):Promise<void>{
  let rejected=false;try{await callback();}catch(error){rejected=error instanceof TelemetryWebhookAuthenticationError;}assert(rejected,message);
}
async function seed():Promise<void>{
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyA},'Telemetry 1E A','ACTIVE',NOW(),NOW()),(${companyB},'Telemetry 1E B','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at) VALUES(${vehicleA},${companyA},'T1E1A01','T1E-A-REN','AVAILABLE',3210,NOW(),NOW()),(${vehicleB},${companyB},'T1E1B01','T1E-B-REN','AVAILABLE',6540,NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
  await db.execute(sql`INSERT INTO trackers(id,company_id,vehicle_id,serial_number,equipment_model,imei,monthly_cost,installation_date,status,created_at,updated_at) VALUES(${trackerA},${companyA},${vehicleA},'T1E-A-SERIAL','Synthetic GPS A','333333333333333',0,'2026-08-25','ACTIVE',NOW(),NOW()),(${trackerB},${companyB},${vehicleB},'T1E-B-SERIAL','Synthetic GPS B','444444444444444',0,'2026-08-25','ACTIVE',NOW(),NOW()) ON CONFLICT(id) DO NOTHING`);
}
async function main():Promise<void>{
  await seed();
  const now=new Date('2026-08-25T05:00:00.000Z');
  const timestamp=now.toISOString(),nonce='nonce_telemetry_1e_0001';
  const body={trackerId:trackerA,sourceEventId:'telemetry-1e-source-1',eventType:'HEARTBEAT',occurredAt:'2026-08-25T04:59:00.000Z',payload:{signal:'ok',nested:{b:2,a:1}}};
  assert(canonicalizeTelemetryWebhookBody({b:2,a:1})==='{"a":1,"b":2}','canonical body is not deterministic');
  const signature=createTelemetryWebhookSignature(secretA,companyA,timestamp,nonce,body);
  const verified=TelemetryWebhookAuthority.verify({companyId:companyA,timestamp,nonce,signature},body,now,config);
  assert(verified.companyId===companyA&&verified.nonce===nonce,'valid webhook was not verified');

  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp,nonce,signature},body,now,''),'missing configuration did not fail closed');
  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp,nonce,signature},body,now,'{'),'malformed configuration did not fail closed');
  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp,nonce,signature:'sha256='+('0'.repeat(64))},body,now,config),'invalid signature was accepted');
  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp,nonce,signature},{...body,sourceEventId:'tampered'},now,config),'altered body was accepted');
  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp:'2026-08-25T04:54:59.000Z',nonce,signature},body,now,config),'expired timestamp was accepted');
  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp:'2026-08-25T05:01:01.000Z',nonce,signature},body,now,config),'future timestamp was accepted');
  await rejectsAuthentication(()=>TelemetryWebhookAuthority.verify({companyId:companyA,timestamp,nonce:'short',signature},body,now,config),'invalid nonce was accepted');

  await TelemetryWebhookAuthority.claimNonce(verified);
  let replayRejected=false;try{await TelemetryWebhookAuthority.claimNonce(verified);}catch(error){replayRejected=error instanceof TelemetryWebhookReplayError;}assert(replayRejected,'same-tenant nonce replay was accepted');
  const nonceB={companyId:companyB,nonce:verified.nonce,signedAt:verified.signedAt};
  await TelemetryWebhookAuthority.claimNonce(nonceB);
  const nonceCounts=rows(await db.execute(sql`SELECT company_id,count(*)::int count FROM telemetry_webhook_nonces WHERE nonce=${nonce} GROUP BY company_id ORDER BY company_id`));
  assert(nonceCounts.length===2&&nonceCounts.every(row=>Number(row.count)===1),'nonce was not isolated by tenant');

  const beforePayables=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count);
  const first=await TelemetryAuthorityService.ingest(actorA,body);
  const duplicate=await TelemetryAuthorityService.ingest(actorA,body);
  assert(first.created&&!duplicate.created&&first.item.id===duplicate.item.id,'sourceEventId did not remain idempotent');
  const km=Number(rows(await db.execute(sql`SELECT current_km FROM vehicles WHERE company_id=${companyA} AND id=${vehicleA}`))[0].current_km);
  const afterPayables=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM account_payables WHERE company_id=${companyA}`))[0].count);
  assert(km===3210,'webhook ingestion changed authoritative vehicle KM');
  assert(beforePayables===afterPayables,'webhook ingestion created a financial payable');
  assert(!JSON.stringify(verified).includes(secretA),'verified result leaked webhook secret');
  assert(rows(await db.execute(sql`SELECT count(*)::int count FROM telemetry_webhook_nonces WHERE company_id=${companyA} AND nonce=${nonce}`))[0].count===1,'nonce claim was duplicated');
  console.log('TELEMETRY-1E authenticated synthetic webhook integration: PASS');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
