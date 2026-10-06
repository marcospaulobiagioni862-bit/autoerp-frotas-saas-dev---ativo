export type TelemetryContractExcessKmState='UNAVAILABLE'|'WITHIN_LIMIT'|'NEAR_LIMIT'|'EXCEEDED';
export interface TelemetryContractExcessKmSummary {
  trackerId:string;
  vehicleId:string;
  contractId:string|null;
  contractNumber:string|null;
  referenceKm:number|null;
  telemetryOdometerKm:number|null;
  franchiseKm:number|null;
  telemetryTravelledKm:number|null;
  telemetryRemainingKm:number|null;
  telemetryExcessKm:number|null;
  nearLimitThresholdKm:number;
  state:TelemetryContractExcessKmState;
}
type JsonRecord=Record<string,unknown>;
const states=new Set<TelemetryContractExcessKmState>(['UNAVAILABLE','WITHIN_LIMIT','NEAR_LIMIT','EXCEEDED']);
function record(value:unknown):JsonRecord{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry contract KM response');return value as JsonRecord;}
function text(value:unknown,field:string):string{if(typeof value!=='string'||value.trim()==='')throw new Error(`Invalid telemetry contract field: ${field}`);return value;}
function nullableText(value:unknown,field:string):string|null{return value===null?null:text(value,field);}
function nonNegative(value:unknown,field:string):number{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>9_999_999)throw new Error(`Invalid telemetry contract KM: ${field}`);return value;}
function nullableNonNegative(value:unknown,field:string):number|null{return value===null?null:nonNegative(value,field);}
function nullableSigned(value:unknown,field:string):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>9_999_999)throw new Error(`Invalid telemetry contract KM: ${field}`);return value;}
export function parseTelemetryContractExcessKmSummary(value:unknown):TelemetryContractExcessKmSummary{
  const item=record(value),allowed=new Set(['trackerId','vehicleId','contractId','contractNumber','referenceKm','telemetryOdometerKm','franchiseKm','telemetryTravelledKm','telemetryRemainingKm','telemetryExcessKm','nearLimitThresholdKm','state']);
  if(Object.keys(item).some(key=>!allowed.has(key)))throw new Error('Unsafe telemetry contract KM response');
  const state=text(item.state,'state') as TelemetryContractExcessKmState;if(!states.has(state))throw new Error('Invalid telemetry contract KM state');
  const result:TelemetryContractExcessKmSummary={trackerId:text(item.trackerId,'trackerId'),vehicleId:text(item.vehicleId,'vehicleId'),contractId:nullableText(item.contractId,'contractId'),contractNumber:nullableText(item.contractNumber,'contractNumber'),referenceKm:nullableNonNegative(item.referenceKm,'referenceKm'),telemetryOdometerKm:nullableNonNegative(item.telemetryOdometerKm,'telemetryOdometerKm'),franchiseKm:nullableNonNegative(item.franchiseKm,'franchiseKm'),telemetryTravelledKm:nullableNonNegative(item.telemetryTravelledKm,'telemetryTravelledKm'),telemetryRemainingKm:nullableSigned(item.telemetryRemainingKm,'telemetryRemainingKm'),telemetryExcessKm:nullableNonNegative(item.telemetryExcessKm,'telemetryExcessKm'),nearLimitThresholdKm:nonNegative(item.nearLimitThresholdKm,'nearLimitThresholdKm'),state};
  if(state==='UNAVAILABLE'&&(result.telemetryTravelledKm!==null||result.telemetryRemainingKm!==null||result.telemetryExcessKm!==null))throw new Error('Inconsistent unavailable telemetry contract KM response');
  if(state!=='UNAVAILABLE'&&(result.contractId===null||result.referenceKm===null||result.telemetryOdometerKm===null||result.franchiseKm===null||result.telemetryTravelledKm===null||result.telemetryRemainingKm===null||result.telemetryExcessKm===null))throw new Error('Inconsistent available telemetry contract KM response');
  return result;
}
export class TelemetryContractExcessKmClient {
  static async get(trackerId:string):Promise<TelemetryContractExcessKmSummary>{
    const response=await fetch(`/api/trackers/${encodeURIComponent(trackerId)}/telemetry/contract-excess-km`,{credentials:'include',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Falha ao consultar KM contratual telemétrico (${response.status})`);
    const payload=record(await response.json());if(Object.keys(payload).some(key=>key!=='item'))throw new Error('Unsafe telemetry contract KM envelope');
    return parseTelemetryContractExcessKmSummary(payload.item);
  }
}
