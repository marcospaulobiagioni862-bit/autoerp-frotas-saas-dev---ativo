import { TelemetryFleetScorecardClient,type TelemetryFleetScorecardSummary } from '../telemetryFleetScorecardClient';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const summary:TelemetryFleetScorecardSummary={
  totalActiveTrackers:2,
  healthCounts:{HEALTHY:1,STALE:0,OFFLINE:1,ATTENTION:0,NO_DATA:0},
  movementCounts:{UNAVAILABLE:0,MOVING:1,STOPPED:0,STALE:1},
  attentionTotal:1,
  attentionItems:[{trackerId:'tracker-2',vehicleId:'vehicle-2',healthState:'OFFLINE',movementState:'STALE',reasons:['HEALTH_OFFLINE','MOVEMENT_STALE']}],
};

async function expectRejected(payload:unknown):Promise<void>{
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=(async()=>new Response(JSON.stringify({item:payload}),{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
    let rejected=false;try{await TelemetryFleetScorecardClient.get();}catch{rejected=true;}assert(rejected,'unsafe telemetry fleet scorecard payload accepted');
  }finally{globalThis.fetch=originalFetch;}
}

export async function runTelemetryFleetScorecardClientRegression():Promise<void>{
  const originalFetch=globalThis.fetch,requests:Array<{input:string;init?:RequestInit}>=[];
  try{
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push({input:String(input),init});return new Response(JSON.stringify({item:summary}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
    const loaded=await TelemetryFleetScorecardClient.get();
    assert(loaded.totalActiveTrackers===2&&loaded.attentionItems[0].reasons.length===2,'valid telemetry fleet scorecard rejected');
    assert(requests.length===1&&requests[0].input==='/api/telemetry/fleet-scorecard','telemetry fleet scorecard path changed');
    assert((!requests[0].init?.method||requests[0].init?.method==='GET')&&requests[0].init?.credentials==='include'&&!requests[0].init?.body,'telemetry fleet scorecard client emitted mutation or browser authority payload');
  }finally{globalThis.fetch=originalFetch;}
  await expectRejected({...summary,companyId:'foreign-tenant'});
  await expectRejected({...summary,coordinates:{latitude:-23.5,longitude:-46.6}});
  await expectRejected({...summary,healthCounts:{...summary.healthCounts,SECRET:1}});
  await expectRejected({...summary,totalActiveTrackers:3});
  await expectRejected({...summary,attentionItems:[{...summary.attentionItems[0],imei:'111111111111111'}]});
  await expectRejected({...summary,attentionItems:[{...summary.attentionItems[0],reasons:['UNKNOWN_REASON']}]});
  console.log('TELEMETRY-1M fleet scorecard client regression: PASS');
}
