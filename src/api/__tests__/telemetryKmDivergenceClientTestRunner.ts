import { TrackerClient,parseTelemetryKmDivergenceSummary,type TelemetryKmDivergenceSummary } from '../trackerClient';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const summary:TelemetryKmDivergenceSummary={trackerId:'tracker/synthetic',vehicleId:'vehicle/synthetic',authoritativeVehicleKm:1000,telemetryOdometerKm:1012.5,differenceKm:12.5,direction:'TELEMETRY_ABOVE',thresholdKm:5};

async function main():Promise<void>{
  assert(parseTelemetryKmDivergenceSummary(summary).direction==='TELEMETRY_ABOVE','valid divergence rejected');
  const unavailable={...summary,telemetryOdometerKm:null,differenceKm:null,direction:'UNAVAILABLE' as const};
  assert(parseTelemetryKmDivergenceSummary(unavailable).direction==='UNAVAILABLE','unavailable divergence rejected');
  for(const unsafe of [{...summary,companyId:'other'},{...summary,rawPayload:{}},{...summary,imei:'555555555555555'},{...summary,direction:'UNAVAILABLE'},{...summary,differenceKm:null},{...summary,thresholdKm:-1}]){let rejected=false;try{parseTelemetryKmDivergenceSummary(unsafe);}catch{rejected=true;}assert(rejected,'unsafe divergence payload accepted');}
  const originalFetch=globalThis.fetch,requests:Array<{input:string;init?:RequestInit}>=[];
  try{
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{requests.push({input:String(input),init});return new Response(JSON.stringify({item:summary}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
    const loaded=await TrackerClient.getTelemetryKmDivergence('tracker/synthetic');
    assert(loaded.differenceKm===12.5&&loaded.direction==='TELEMETRY_ABOVE','divergence client result changed');
    assert(requests.length===1&&requests[0].input==='/api/trackers/tracker%2Fsynthetic/telemetry/km-divergence','tracker id not encoded in divergence request');
    assert((!requests[0].init?.method||requests[0].init?.method==='GET')&&requests[0].init?.credentials==='include'&&!requests[0].init?.body,'divergence client sent mutation or browser authority payload');
  }finally{globalThis.fetch=originalFetch;}
  console.log('TELEMETRY-1H1 KM divergence client regression: PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
