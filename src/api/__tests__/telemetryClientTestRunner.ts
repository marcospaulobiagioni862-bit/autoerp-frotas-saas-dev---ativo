import { TrackerClient,parseTelemetryEventSummary,type TelemetryEventSummary } from '../trackerClient';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}

const accepted:TelemetryEventSummary={
  id:'telemetry-event-1',
  trackerId:'tracker/synthetic',
  sourceEventId:'synthetic-heartbeat-1',
  eventType:'HEARTBEAT',
  occurredAt:'2026-08-25T02:00:00.000Z',
  receivedAt:'2026-08-25T02:00:01.000Z',
  status:'ACCEPTED',
  quarantineReason:null,
};
const quarantined:TelemetryEventSummary={
  ...accepted,
  id:'telemetry-event-2',
  sourceEventId:'synthetic-odometer-2',
  eventType:'ODOMETER',
  status:'QUARANTINED',
  quarantineReason:'ODOMETER_REGRESSION',
};

async function main():Promise<void>{
  assert(parseTelemetryEventSummary(accepted).status==='ACCEPTED','accepted summary rejected');
  assert(parseTelemetryEventSummary(quarantined).quarantineReason==='ODOMETER_REGRESSION','quarantine summary rejected');

  for(const unsafe of [
    {...accepted,rawPayload:{latitude:-23.5,longitude:-46.6}},
    {...accepted,companyId:'foreign-tenant'},
    {...accepted,imei:'111111111111111'},
    {...accepted,status:'QUARANTINED',quarantineReason:null},
  ]){
    let rejected=false;try{parseTelemetryEventSummary(unsafe);}catch{rejected=true;}
    assert(rejected,'unsafe or inconsistent telemetry response accepted');
  }

  const originalFetch=globalThis.fetch;
  const requests:Array<{input:string;init?:RequestInit}>=[];
  try{
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      requests.push({input:String(input),init});
      return new Response(JSON.stringify({items:[accepted,quarantined]}),{status:200,headers:{'content-type':'application/json'}});
    }) as typeof fetch;
    const listed=await TrackerClient.listTelemetry('tracker/synthetic',200);
    assert(listed.length===2,'telemetry list not parsed');
    assert(requests.length===1,'telemetry client emitted unexpected requests');
    assert(requests[0].input==='/api/trackers/tracker%2Fsynthetic/telemetry?limit=50','tracker id or safe limit not enforced');
    assert(!requests[0].init?.method||requests[0].init?.method==='GET','telemetry client emitted a mutation');
    assert(requests[0].init?.credentials==='include','telemetry query omitted authenticated session');
    assert(!requests[0].init?.body,'telemetry query sent browser authority payload');
  }finally{globalThis.fetch=originalFetch;}
  console.log('Telemetry client read-only authority tests PASS');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
