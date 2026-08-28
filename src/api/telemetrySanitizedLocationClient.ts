export type TelemetryLocationFreshness='UNAVAILABLE'|'FRESH'|'STALE'|'OFFLINE';
export interface SanitizedTelemetryLocation{trackerId:string;vehicleId:string;latitude:number|null;longitude:number|null;occurredAt:string|null;freshness:TelemetryLocationFreshness;}
type JsonRecord=Record<string,unknown>;
const freshnessValues=new Set<TelemetryLocationFreshness>(['UNAVAILABLE','FRESH','STALE','OFFLINE']);
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry location response');return value as JsonRecord;}
function text(value:unknown,field:string):string{if(typeof value!=='string'||value.trim()==='')throw new Error(`Invalid telemetry location field: ${field}`);return value;}
function nullableCoordinate(value:unknown,min:number,max:number,field:string):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid telemetry location field: ${field}`);return value;}
function nullableTimestamp(value:unknown):string|null{if(value===null)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid telemetry location timestamp');return new Date(value).toISOString();}
export function parseSanitizedTelemetryLocation(value:unknown):SanitizedTelemetryLocation{
  const item=record(value),allowed=new Set(['trackerId','vehicleId','latitude','longitude','occurredAt','freshness']);
  if(Object.keys(item).some(key=>!allowed.has(key)))throw new Error('Unsafe telemetry location response');
  const freshness=text(item.freshness,'freshness') as TelemetryLocationFreshness;if(!freshnessValues.has(freshness))throw new Error('Invalid telemetry location freshness');
  const result={trackerId:text(item.trackerId,'trackerId'),vehicleId:text(item.vehicleId,'vehicleId'),latitude:nullableCoordinate(item.latitude,-90,90,'latitude'),longitude:nullableCoordinate(item.longitude,-180,180,'longitude'),occurredAt:nullableTimestamp(item.occurredAt),freshness};
  const unavailable=result.latitude===null||result.longitude===null||result.occurredAt===null;
  if((freshness==='UNAVAILABLE')!==unavailable)throw new Error('Inconsistent telemetry location response');
  return result;
}
export class TelemetrySanitizedLocationClient{
  static async get(trackerId:string):Promise<SanitizedTelemetryLocation>{
    const response=await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/telemetry/location`,{credentials:'include',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Falha ao consultar localização telemétrica (${response.status})`);
    const payload=record(await response.json());if(Object.keys(payload).some(key=>key!=='item'))throw new Error('Unsafe telemetry location envelope');
    return parseSanitizedTelemetryLocation(payload.item);
  }
}
