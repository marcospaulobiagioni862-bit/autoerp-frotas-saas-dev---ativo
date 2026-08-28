export type FleetTelemetryHealthState='HEALTHY'|'STALE'|'OFFLINE'|'ATTENTION'|'NO_DATA';
export type TelemetryMovementState='UNAVAILABLE'|'MOVING'|'STOPPED'|'STALE';
export type FleetTelemetryAttentionReason='HEALTH_ATTENTION'|'HEALTH_OFFLINE'|'HEALTH_STALE'|'HEALTH_NO_DATA'|'MOVEMENT_STALE'|'MOVEMENT_UNAVAILABLE';
export interface TelemetryFleetAttentionItem {trackerId:string;vehicleId:string;healthState:FleetTelemetryHealthState;movementState:TelemetryMovementState;reasons:FleetTelemetryAttentionReason[];}
export interface TelemetryFleetScorecardSummary {
  totalActiveTrackers:number;
  healthCounts:Record<FleetTelemetryHealthState,number>;
  movementCounts:Record<TelemetryMovementState,number>;
  attentionTotal:number;
  attentionItems:TelemetryFleetAttentionItem[];
}
const healthStates=['HEALTHY','STALE','OFFLINE','ATTENTION','NO_DATA'] as const;
const movementStates=['UNAVAILABLE','MOVING','STOPPED','STALE'] as const;
const attentionReasons=new Set<FleetTelemetryAttentionReason>(['HEALTH_ATTENTION','HEALTH_OFFLINE','HEALTH_STALE','HEALTH_NO_DATA','MOVEMENT_STALE','MOVEMENT_UNAVAILABLE']);
const allowedRoot=new Set(['totalActiveTrackers','healthCounts','movementCounts','attentionTotal','attentionItems']);
const allowedItem=new Set(['trackerId','vehicleId','healthState','movementState','reasons']);
function count(value:unknown):number{if(typeof value!=='number'||!Number.isInteger(value)||value<0)throw new Error('Invalid telemetry scorecard count');return value;}
function exactCounts<T extends readonly string[]>(value:unknown,keys:T):Record<T[number],number>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry scorecard counts');
  const item=value as Record<string,unknown>,allowedKeys=new Set<string>(keys);
  if(Object.keys(item).length!==keys.length||Object.keys(item).some(key=>!allowedKeys.has(key)))throw new Error('Unexpected telemetry scorecard count field');
  return Object.fromEntries(keys.map(key=>[key,count(item[key])])) as Record<T[number],number>;
}
function parse(value:unknown):TelemetryFleetScorecardSummary{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid telemetry scorecard response');
  const item=value as Record<string,unknown>;
  if(Object.keys(item).some(key=>!allowedRoot.has(key)))throw new Error('Unexpected telemetry scorecard field');
  const totalActiveTrackers=count(item.totalActiveTrackers),attentionTotal=count(item.attentionTotal);
  const healthCounts=exactCounts(item.healthCounts,healthStates),movementCounts=exactCounts(item.movementCounts,movementStates);
  if(!Array.isArray(item.attentionItems)||item.attentionItems.length>100)throw new Error('Invalid telemetry scorecard attention items');
  const attentionItems=item.attentionItems.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid telemetry scorecard attention item');
    const row=raw as Record<string,unknown>;
    if(Object.keys(row).some(key=>!allowedItem.has(key)))throw new Error('Unexpected telemetry scorecard attention field');
    if(typeof row.trackerId!=='string'||!row.trackerId||typeof row.vehicleId!=='string'||!row.vehicleId||!healthStates.includes(row.healthState as FleetTelemetryHealthState)||!movementStates.includes(row.movementState as TelemetryMovementState)||!Array.isArray(row.reasons)||row.reasons.length<1||row.reasons.some(reason=>!attentionReasons.has(reason as FleetTelemetryAttentionReason)))throw new Error('Invalid telemetry scorecard attention identity');
    return{trackerId:row.trackerId,vehicleId:row.vehicleId,healthState:row.healthState as FleetTelemetryHealthState,movementState:row.movementState as TelemetryMovementState,reasons:row.reasons as FleetTelemetryAttentionReason[]};
  });
  const healthTotal=Object.values(healthCounts).reduce((sum,value)=>sum+value,0),movementTotal=Object.values(movementCounts).reduce((sum,value)=>sum+value,0);
  if(healthTotal!==totalActiveTrackers||movementTotal!==totalActiveTrackers||attentionItems.length>attentionTotal)throw new Error('Inconsistent telemetry scorecard response');
  return{totalActiveTrackers,healthCounts,movementCounts,attentionTotal,attentionItems};
}
export class TelemetryFleetScorecardClient {
  static async get():Promise<TelemetryFleetScorecardSummary>{
    const response=await fetch('/api/telemetry/fleet-scorecard',{credentials:'include'});
    if(!response.ok)throw new Error(`Falha ao consultar resumo telemétrico da frota (${response.status}).`);
    const body=await response.json() as unknown;
    if(!body||typeof body!=='object'||Array.isArray(body)||!Object.prototype.hasOwnProperty.call(body,'item'))throw new Error('Resposta inválida do resumo telemétrico da frota.');
    return parse((body as {item:unknown}).item);
  }
}
