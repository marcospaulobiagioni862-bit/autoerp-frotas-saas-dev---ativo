export type TelemetryMovementState='UNAVAILABLE'|'MOVING'|'STOPPED'|'STALE';
export interface TelemetryMovementSummary {
  trackerId:string;
  vehicleId:string;
  state:TelemetryMovementState;
  latestOccurredAt:string|null;
  previousOccurredAt:string|null;
  distanceMeters:number|null;
  elapsedSeconds:number|null;
}

const allowedKeys=new Set(['trackerId','vehicleId','state','latestOccurredAt','previousOccurredAt','distanceMeters','elapsedSeconds']);
const states=new Set<TelemetryMovementState>(['UNAVAILABLE','MOVING','STOPPED','STALE']);
function nullableDate(value:unknown):string|null{if(value===null)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid telemetry movement timestamp');return value;}
function nullableNonNegative(value:unknown):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Invalid telemetry movement metric');return value;}
function parse(value:unknown):TelemetryMovementSummary{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry movement response');
  const item=value as Record<string,unknown>;
  for(const key of Object.keys(item))if(!allowedKeys.has(key))throw new Error('Unexpected telemetry movement field');
  if(typeof item.trackerId!=='string'||typeof item.vehicleId!=='string'||!states.has(item.state as TelemetryMovementState))throw new Error('Invalid telemetry movement identity');
  const latestOccurredAt=nullableDate(item.latestOccurredAt),previousOccurredAt=nullableDate(item.previousOccurredAt),distanceMeters=nullableNonNegative(item.distanceMeters),elapsedSeconds=nullableNonNegative(item.elapsedSeconds);
  const state=item.state as TelemetryMovementState;
  if((state==='MOVING'||state==='STOPPED')&&(!latestOccurredAt||!previousOccurredAt||distanceMeters===null||elapsedSeconds===null))throw new Error('Incomplete telemetry movement response');
  if(state==='UNAVAILABLE'&&distanceMeters!==null)throw new Error('Inconsistent telemetry movement response');
  return{trackerId:item.trackerId,vehicleId:item.vehicleId,state,latestOccurredAt,previousOccurredAt,distanceMeters,elapsedSeconds};
}
export class TelemetryMovementAdvisoryClient {
  static async get(trackerId:string):Promise<TelemetryMovementSummary>{
    const response=await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/telemetry/movement`,{credentials:'include'});
    if(!response.ok)throw new Error(`Falha ao consultar movimento telemétrico (${response.status}).`);
    const body=await response.json() as unknown;
    if(!body||typeof body!=='object'||Array.isArray(body)||!Object.prototype.hasOwnProperty.call(body,'item'))throw new Error('Resposta inválida do movimento telemétrico.');
    return parse((body as {item:unknown}).item);
  }
}
