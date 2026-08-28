import type { TelemetryFleetAttentionItem } from '../../../api/telemetryFleetScorecardClient';
import { createTelemetryScorecardTriageCounts,triageTelemetryScorecardItems } from '../telemetryFleetScorecardTriage';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}

export function runTelemetryFleetScorecardTriageRegression():void{
  const items:TelemetryFleetAttentionItem[]=[
    {trackerId:'tracker-stale',vehicleId:'vehicle-c',healthState:'STALE',movementState:'STALE',reasons:['HEALTH_STALE','MOVEMENT_STALE']},
    {trackerId:'tracker-offline',vehicleId:'vehicle-b',healthState:'OFFLINE',movementState:'UNAVAILABLE',reasons:['HEALTH_OFFLINE','MOVEMENT_UNAVAILABLE']},
    {trackerId:'tracker-attention',vehicleId:'vehicle-a',healthState:'ATTENTION',movementState:'STOPPED',reasons:['HEALTH_ATTENTION']},
    {trackerId:'tracker-no-data',vehicleId:'vehicle-d',healthState:'NO_DATA',movementState:'UNAVAILABLE',reasons:['HEALTH_NO_DATA','MOVEMENT_UNAVAILABLE']},
  ];
  const originalOrder=items.map(item=>item.trackerId).join(',');
  const counts=createTelemetryScorecardTriageCounts(items);
  assert(counts.health.OFFLINE===1&&counts.health.ATTENTION===1&&counts.health.STALE===1&&counts.health.NO_DATA===1,'health triage counts changed');
  assert(counts.movement.UNAVAILABLE===2&&counts.movement.STALE===1&&counts.movement.STOPPED===1,'movement triage counts changed');
  assert(counts.reason.MOVEMENT_UNAVAILABLE===2&&counts.reason.HEALTH_OFFLINE===1,'reason triage counts changed');
  const all=triageTelemetryScorecardItems(items,{health:'ALL',movement:'ALL',reason:'ALL'});
  assert(all.map(item=>item.trackerId).join(',')==='tracker-offline,tracker-attention,tracker-stale,tracker-no-data','deterministic triage priority changed');
  const offline=triageTelemetryScorecardItems(items,{health:'OFFLINE',movement:'ALL',reason:'ALL'});
  assert(offline.length===1&&offline[0].trackerId==='tracker-offline','health filter hid or leaked scorecard items');
  const unavailable=triageTelemetryScorecardItems(items,{health:'ALL',movement:'UNAVAILABLE',reason:'ALL'});
  assert(unavailable.length===2&&unavailable.every(item=>item.movementState==='UNAVAILABLE'),'movement filter hid or leaked scorecard items');
  const reason=triageTelemetryScorecardItems(items,{health:'ALL',movement:'ALL',reason:'MOVEMENT_UNAVAILABLE'});
  assert(reason.length===2&&reason.every(item=>item.reasons.includes('MOVEMENT_UNAVAILABLE')),'reason filter hid or leaked scorecard items');
  const combined=triageTelemetryScorecardItems(items,{health:'NO_DATA',movement:'UNAVAILABLE',reason:'HEALTH_NO_DATA'});
  assert(combined.length===1&&combined[0].trackerId==='tracker-no-data','combined telemetry scorecard filters are inconsistent');
  assert(items.map(item=>item.trackerId).join(',')===originalOrder,'local telemetry scorecard triage mutated authorized input');
  console.log('TELEMETRY-1N local fleet scorecard triage regression: PASS');
}