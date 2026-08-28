import type { FleetTelemetryAttentionReason,FleetTelemetryHealthState,TelemetryFleetAttentionItem,TelemetryMovementState } from '../../api/telemetryFleetScorecardClient';

export const TELEMETRY_SCORECARD_HEALTH_FILTERS=['ALL','ATTENTION','OFFLINE','STALE','NO_DATA','HEALTHY'] as const;
export const TELEMETRY_SCORECARD_MOVEMENT_FILTERS=['ALL','STALE','UNAVAILABLE','STOPPED','MOVING'] as const;
export const TELEMETRY_SCORECARD_REASON_FILTERS=['ALL','HEALTH_OFFLINE','HEALTH_ATTENTION','HEALTH_STALE','HEALTH_NO_DATA','MOVEMENT_STALE','MOVEMENT_UNAVAILABLE'] as const;

export type TelemetryScorecardHealthFilter=typeof TELEMETRY_SCORECARD_HEALTH_FILTERS[number];
export type TelemetryScorecardMovementFilter=typeof TELEMETRY_SCORECARD_MOVEMENT_FILTERS[number];
export type TelemetryScorecardReasonFilter=typeof TELEMETRY_SCORECARD_REASON_FILTERS[number];

export interface TelemetryScorecardTriageFilters{
  health:TelemetryScorecardHealthFilter;
  movement:TelemetryScorecardMovementFilter;
  reason:TelemetryScorecardReasonFilter;
}

export interface TelemetryScorecardTriageCounts{
  health:Record<FleetTelemetryHealthState,number>;
  movement:Record<TelemetryMovementState,number>;
  reason:Record<FleetTelemetryAttentionReason,number>;
}

const healthPriority:Record<FleetTelemetryHealthState,number>={OFFLINE:0,ATTENTION:1,STALE:2,NO_DATA:3,HEALTHY:4};
const movementPriority:Record<TelemetryMovementState,number>={STALE:0,UNAVAILABLE:1,STOPPED:2,MOVING:3};
const reasonPriority:Record<FleetTelemetryAttentionReason,number>={HEALTH_OFFLINE:0,HEALTH_ATTENTION:1,HEALTH_STALE:2,HEALTH_NO_DATA:3,MOVEMENT_STALE:4,MOVEMENT_UNAVAILABLE:5};

export const createTelemetryScorecardTriageCounts=(items:readonly TelemetryFleetAttentionItem[]):TelemetryScorecardTriageCounts=>{
  const health:Record<FleetTelemetryHealthState,number>={HEALTHY:0,STALE:0,OFFLINE:0,ATTENTION:0,NO_DATA:0};
  const movement:Record<TelemetryMovementState,number>={UNAVAILABLE:0,MOVING:0,STOPPED:0,STALE:0};
  const reason:Record<FleetTelemetryAttentionReason,number>={HEALTH_ATTENTION:0,HEALTH_OFFLINE:0,HEALTH_STALE:0,HEALTH_NO_DATA:0,MOVEMENT_STALE:0,MOVEMENT_UNAVAILABLE:0};
  for(const item of items){
    health[item.healthState]+=1;
    movement[item.movementState]+=1;
    for(const value of new Set(item.reasons))reason[value]+=1;
  }
  return{health,movement,reason};
};

export const triageTelemetryScorecardItems=(items:readonly TelemetryFleetAttentionItem[],filters:TelemetryScorecardTriageFilters):TelemetryFleetAttentionItem[]=>{
  return items
    .filter(item=>(filters.health==='ALL'||item.healthState===filters.health)&&(filters.movement==='ALL'||item.movementState===filters.movement)&&(filters.reason==='ALL'||item.reasons.includes(filters.reason)))
    .slice()
    .sort((left,right)=>{
      const healthDelta=healthPriority[left.healthState]-healthPriority[right.healthState];if(healthDelta!==0)return healthDelta;
      const leftReason=Math.min(...left.reasons.map(reason=>reasonPriority[reason])),rightReason=Math.min(...right.reasons.map(reason=>reasonPriority[reason]));
      const reasonDelta=leftReason-rightReason;if(reasonDelta!==0)return reasonDelta;
      const movementDelta=movementPriority[left.movementState]-movementPriority[right.movementState];if(movementDelta!==0)return movementDelta;
      const vehicleDelta=left.vehicleId.localeCompare(right.vehicleId);if(vehicleDelta!==0)return vehicleDelta;
      return left.trackerId.localeCompare(right.trackerId);
    });
};