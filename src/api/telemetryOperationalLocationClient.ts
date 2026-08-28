export type TelemetryOperationalLocationState='UNAVAILABLE'|'FRESH'|'STALE';
export interface TelemetryOperationalLocationSummary{trackerId:string;vehicleId:string;latitude:number|null;longitude:number|null;occurredAt:string|null;ageMinutes:number|null;state:TelemetryOperationalLocationState;}
type JsonRecord=Record<string,unknown>;
const states=new Set<TelemetryOperationalLocationState>(['UNAVAILABLE','FRESH','STALE']);
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry location response');return value as JsonRecord;}
function text(value:unknown,field:string):string{if(typeof value!=='string'||value.trim()==='')throw new Error(`Invalid telemetry location field: ${field}`);return value;}
function nullableCoordinate(value:unknown,min:number,max:number,field:string):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid telemetry location field: ${field}`);return value;}
function nullableDate(value:unknown):string|null{if(value===null)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid telemetry location timestamp');return new Date(value).toISOString();}
function nullableAge(value:unknown):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isInteger(value)||value<0)throw new Error('Invalid telemetry location age');return value;}
export function parseTelemetryOperationalLocationSummary(value:unknown):TelemetryOperationalLocationSummary{
  const item=record(value),allowed=new Set(['trackerId','vehicleId','latitude','longitude','occurredAt','ageMinutes','state']);if(Object.keys(item).some(key=>!allowed.has(key)))throw new Error('Unsafe telemetry location response');
  const state=text(item.state,'state') as TelemetryOperationalLocationState;if(!states.has(state))throw new Error('Invalid telemetry location state');
  const result={trackerId:text(item.trackerId,'trackerId'),vehicleId:text(item.vehicleId,'vehicleId'),latitude:nullableCoordinate(item.latitude,-90,90,'latitude'),longitude:nullableCoordinate(item.longitude,-180,180,'longitude'),occurredAt:nullableDate(item.occurredAt),ageMinutes:nullableAge(item.ageMinutes),state};
  const unavailable=result.latitude===null||result.longitude===null||result.occurredAt===null||result.ageMinutes===null;if((state==='UNAVAILABLE')!==unavailable)throw new Error('Inconsistent telemetry location response');return result;
}
export class TelemetryOperationalLocationClient{static async get(trackerId:string):Promise<TelemetryOperationalLocationSummary>{const response=await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/telemetry/location`,{credentials:'include',headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Falha ao consultar localização telemétrica (${response.status})`);const payload=record(await response.json());if(Object.keys(payload).some(key=>key!=='item'))throw new Error('Unsafe telemetry location envelope');return parseTelemetryOperationalLocationSummary(payload.item);}}
