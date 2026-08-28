import { UnitOfWork } from '../db/uow';
import { TelemetryAuthorityService,type TelemetryHealthStatus } from './telemetryAuthority';
import { TelemetryMovementAdvisoryAuthority,type TelemetryMovementState } from './telemetryMovementAdvisoryAuthority';

export type FleetTelemetryHealthState='HEALTHY'|'STALE'|'OFFLINE'|'ATTENTION'|'NO_DATA';
export type FleetTelemetryAttentionReason='HEALTH_ATTENTION'|'HEALTH_OFFLINE'|'HEALTH_STALE'|'HEALTH_NO_DATA'|'MOVEMENT_STALE'|'MOVEMENT_UNAVAILABLE';
export interface TelemetryFleetScorecardInput {trackerId:string;vehicleId:string;healthState:FleetTelemetryHealthState;movementState:TelemetryMovementState;}
export interface TelemetryFleetAttentionItem extends TelemetryFleetScorecardInput {reasons:FleetTelemetryAttentionReason[];}
export interface TelemetryFleetScorecardSummary {
  totalActiveTrackers:number;
  healthCounts:Record<FleetTelemetryHealthState,number>;
  movementCounts:Record<TelemetryMovementState,number>;
  attentionTotal:number;
  attentionItems:TelemetryFleetAttentionItem[];
}

const emptyHealth=():Record<FleetTelemetryHealthState,number>=>({HEALTHY:0,STALE:0,OFFLINE:0,ATTENTION:0,NO_DATA:0});
const emptyMovement=():Record<TelemetryMovementState,number>=>({UNAVAILABLE:0,MOVING:0,STOPPED:0,STALE:0});
function healthState(value:TelemetryHealthStatus):FleetTelemetryHealthState{
  if(value==='HEALTHY'||value==='STALE'||value==='OFFLINE'||value==='ATTENTION'||value==='NO_DATA')return value;
  throw new Error('Unexpected active tracker telemetry health state');
}
function reasons(item:TelemetryFleetScorecardInput):FleetTelemetryAttentionReason[]{
  const result:FleetTelemetryAttentionReason[]=[];
  if(item.healthState==='ATTENTION')result.push('HEALTH_ATTENTION');
  if(item.healthState==='OFFLINE')result.push('HEALTH_OFFLINE');
  if(item.healthState==='STALE')result.push('HEALTH_STALE');
  if(item.healthState==='NO_DATA')result.push('HEALTH_NO_DATA');
  if(item.movementState==='STALE')result.push('MOVEMENT_STALE');
  if(item.movementState==='UNAVAILABLE')result.push('MOVEMENT_UNAVAILABLE');
  return result;
}
const priority=(item:TelemetryFleetAttentionItem):number=>item.reasons.includes('HEALTH_ATTENTION')?0:item.reasons.includes('HEALTH_OFFLINE')?1:item.reasons.includes('HEALTH_STALE')?2:item.reasons.includes('HEALTH_NO_DATA')?3:item.reasons.includes('MOVEMENT_STALE')?4:5;
export function deriveTelemetryFleetScorecard(items:TelemetryFleetScorecardInput[],attentionLimit=50):TelemetryFleetScorecardSummary{
  if(!Number.isInteger(attentionLimit)||attentionLimit<1||attentionLimit>100)throw new Error('Invalid telemetry scorecard attention limit');
  const healthCounts=emptyHealth(),movementCounts=emptyMovement();
  const attention:TelemetryFleetAttentionItem[]=[];
  for(const item of items){
    if(!item.trackerId||!item.vehicleId)throw new Error('Invalid telemetry scorecard identity');
    healthCounts[item.healthState]+=1;
    movementCounts[item.movementState]+=1;
    const itemReasons=reasons(item);
    if(itemReasons.length)attention.push({...item,reasons:itemReasons});
  }
  attention.sort((a,b)=>priority(a)-priority(b)||a.trackerId.localeCompare(b.trackerId));
  const totalActiveTrackers=items.length;
  const healthTotal=Object.values(healthCounts).reduce((sum,value)=>sum+value,0);
  const movementTotal=Object.values(movementCounts).reduce((sum,value)=>sum+value,0);
  if(healthTotal!==totalActiveTrackers||movementTotal!==totalActiveTrackers)throw new Error('Inconsistent telemetry scorecard aggregate');
  return{totalActiveTrackers,healthCounts,movementCounts,attentionTotal:attention.length,attentionItems:attention.slice(0,attentionLimit)};
}

export class TelemetryFleetScorecardAuthority {
  static async get(companyId:string,referenceNow=new Date()):Promise<TelemetryFleetScorecardSummary>{
    const trackers=await UnitOfWork.run(companyId,async tx=>await tx.getTrackerRepo().findAllByCompany(companyId));
    const active=trackers.filter(item=>item.status==='ACTIVE');
    const snapshots=await Promise.all(active.map(async tracker=>{
      const[health,movement]=await Promise.all([
        TelemetryAuthorityService.health(companyId,tracker.id,referenceNow),
        TelemetryMovementAdvisoryAuthority.get(companyId,tracker.id,referenceNow),
      ]);
      return{trackerId:tracker.id,vehicleId:tracker.vehicleId,healthState:healthState(health.healthStatus),movementState:movement.state};
    }));
    return deriveTelemetryFleetScorecard(snapshots);
  }
}
