import assert from 'node:assert/strict';
import { deriveTelemetryFleetScorecard } from '../telemetryFleetScorecardAuthority';

const empty=deriveTelemetryFleetScorecard([]);
assert.equal(empty.totalActiveTrackers,0);
assert.equal(empty.attentionTotal,0);
assert.deepEqual(empty.healthCounts,{HEALTHY:0,STALE:0,OFFLINE:0,ATTENTION:0,NO_DATA:0});
assert.deepEqual(empty.movementCounts,{UNAVAILABLE:0,MOVING:0,STOPPED:0,STALE:0});

const summary=deriveTelemetryFleetScorecard([
  {trackerId:'t1',vehicleId:'v1',healthState:'HEALTHY',movementState:'MOVING'},
  {trackerId:'t2',vehicleId:'v2',healthState:'OFFLINE',movementState:'STALE'},
  {trackerId:'t3',vehicleId:'v3',healthState:'ATTENTION',movementState:'UNAVAILABLE'},
  {trackerId:'t4',vehicleId:'v4',healthState:'NO_DATA',movementState:'STOPPED'},
]);
assert.equal(summary.totalActiveTrackers,4);
assert.equal(summary.healthCounts.HEALTHY,1);
assert.equal(summary.healthCounts.OFFLINE,1);
assert.equal(summary.healthCounts.ATTENTION,1);
assert.equal(summary.healthCounts.NO_DATA,1);
assert.equal(summary.movementCounts.MOVING,1);
assert.equal(summary.movementCounts.STALE,1);
assert.equal(summary.movementCounts.UNAVAILABLE,1);
assert.equal(summary.movementCounts.STOPPED,1);
assert.equal(summary.attentionTotal,3);
assert.equal(summary.attentionItems[0].trackerId,'t3');
assert.deepEqual(summary.attentionItems[0].reasons,['HEALTH_ATTENTION','MOVEMENT_UNAVAILABLE']);
assert.equal(summary.attentionItems[1].trackerId,'t2');
assert.throws(()=>deriveTelemetryFleetScorecard([{trackerId:'',vehicleId:'v',healthState:'HEALTHY',movementState:'MOVING'}]));
assert.throws(()=>deriveTelemetryFleetScorecard([],0));
console.log('TELEMETRY-1M fleet scorecard regression: PASS');
