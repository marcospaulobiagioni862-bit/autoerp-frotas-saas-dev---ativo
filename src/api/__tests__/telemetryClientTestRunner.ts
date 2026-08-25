import { TrackerClient,parseTelemetryEventSummary,parseTelemetryHealthSummary,type TelemetryEventSummary,type TelemetryHealthSummary } from '../trackerClient';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}

const accepted:TelemetryEventSummary={
  id:'telemetry-event-1',trackerId:'tracker/synthetic',sourceEventId:'synthetic-heartbeat-1',eventType:'HEARTBEAT',
  occurredAt:'2026-08-25T02:00:00.000Z',receivedAt:'2026-08-25T02:00:01.000Z',status:'ACCEPTED',quarantineReason:null,
  reviewStatus:null,reviewReason:null,reviewedAt:null,
};
const quarantined:TelemetryEventSummary={
  ...accepted,id:'telemetry-event-2',sourceEventId:'synthetic-odometer-2',eventType:'ODOMETER',status:'QUARANTINED',
  quarantineReason:'ODOMETER_REGRESSION',reviewStatus:'PENDING',
};
const reviewed:TelemetryEventSummary={
  ...quarantined,reviewStatus:'ACKNOWLEDGED',reviewReason:'Divergência confirmada em revisão humana',reviewedAt:'2026-08-25T02:10:00.000Z',
};
const health:TelemetryHealthSummary={
  trackerId:'tracker/synthetic',healthStatus:'ATTENTION',lastCommunicationAt:'2026-08-25T02:00:01.000Z',
  lastAcceptedEventAt:'2026-08-25T02:00:01.000Z',latestAcceptedEventType:'HEARTBEAT',lastAcceptedOdometerKm:1000,quarantinedLast24h:1,
};

async function main():Promise<void>{
  assert(parseTelemetryEventSummary(accepted).status==='ACCEPTED','accepted summary rejected');
  assert(parseTelemetryEventSummary(quarantined).reviewStatus==='PENDING','pending quarantine summary rejected');
  assert(parseTelemetryEventSummary(reviewed).reviewStatus==='ACKNOWLEDGED','reviewed quarantine summary rejected');
  assert(parseTelemetryHealthSummary(health).healthStatus==='ATTENTION','health summary rejected');
  for(const unsafeHealth of [{...health,rawPayload:{}},{...health,companyId:'foreign-tenant'},{...health,imei:'111111111111111'},{...health,healthStatus:'NO_DATA'}]){let rejected=false;try{parseTelemetryHealthSummary(unsafeHealth);}catch{rejected=true;}assert(rejected,'unsafe or inconsistent health summary accepted');}
  for(const unsafe of [
    {...accepted,rawPayload:{latitude:-23.5,longitude:-46.6}},
    {...accepted,companyId:'foreign-tenant'},
    {...accepted,imei:'111111111111111'},
    {...accepted,reviewedBy:'internal-user'},
    {...accepted,status:'QUARANTINED',quarantineReason:null,reviewStatus:'PENDING'},
    {...quarantined,reviewStatus:'ACKNOWLEDGED',reviewReason:null,reviewedAt:null},
  ]){let rejected=false;try{parseTelemetryEventSummary(unsafe);}catch{rejected=true;}assert(rejected,'unsafe or inconsistent telemetry response accepted');}

  const originalFetch=globalThis.fetch;
  const requests:Array<{input:string;init?:RequestInit}>=[];
  try{
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      requests.push({input:String(input),init});
      const url=String(input);
      const payload=url.endsWith('/telemetry/health')?{item:health}:url.endsWith('/review')?{item:reviewed,changed:true}:{items:[accepted,quarantined]};
      return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    }) as typeof fetch;
    const listed=await TrackerClient.listTelemetry('tracker/synthetic',200);assert(listed.length===2,'telemetry list not parsed');
    const loadedHealth=await TrackerClient.getTelemetryHealth('tracker/synthetic');assert(loadedHealth.lastAcceptedOdometerKm===1000,'derived odometer not parsed');
    const result=await TrackerClient.reviewTelemetry('tracker/synthetic','event/review','ACKNOWLEDGED','Divergência confirmada em revisão humana');assert(result.changed&&result.item.reviewStatus==='ACKNOWLEDGED','telemetry review not parsed');
    assert(requests.length===3,'telemetry client emitted unexpected requests');
    assert(requests[0].input==='/api/trackers/tracker%2Fsynthetic/telemetry?limit=50','tracker id or safe limit not enforced');
    assert(!requests[0].init?.method||requests[0].init?.method==='GET','telemetry list emitted a mutation');
    assert(requests[0].init?.credentials==='include'&&!requests[0].init?.body,'telemetry list sent browser authority payload');
    assert(requests[1].input==='/api/trackers/tracker%2Fsynthetic/telemetry/health','health tracker id not encoded');
    assert(!requests[1].init?.method||requests[1].init?.method==='GET','health client emitted a mutation');
    assert(requests[1].init?.credentials==='include'&&!requests[1].init?.body,'health query sent browser authority payload');
    assert(requests[2].input==='/api/trackers/tracker%2Fsynthetic/telemetry/event%2Freview/review','review path identifiers not encoded');
    assert(requests[2].init?.method==='POST'&&requests[2].init?.credentials==='include','review omitted authenticated POST');
    const body=JSON.parse(String(requests[2].init?.body)) as Record<string,unknown>;
    assert(JSON.stringify(Object.keys(body).sort())===JSON.stringify(['decision','reason']),'review sent protected browser authority fields');
    assert(body.decision==='ACKNOWLEDGED'&&body.reason==='Divergência confirmada em revisão humana','review body changed human decision');
  }finally{globalThis.fetch=originalFetch;}
  console.log('Telemetry client authority and human review tests PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
