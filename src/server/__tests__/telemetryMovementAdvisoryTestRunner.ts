import assert from 'node:assert/strict';
import { deriveTelemetryMovement } from '../telemetryMovementAdvisoryAuthority';

const now=new Date('2026-08-28T12:00:00.000Z');
const point=(latitude:number,longitude:number,occurredAt:string)=>({latitude,longitude,occurredAt});
assert.deepEqual(deriveTelemetryMovement(null,null,now),{state:'UNAVAILABLE',latestOccurredAt:null,previousOccurredAt:null,distanceMeters:null,elapsedSeconds:null});
assert.equal(deriveTelemetryMovement(point(-23.55,-46.63,'2026-08-28T11:00:00.000Z'),null,now).state,'UNAVAILABLE');
assert.equal(deriveTelemetryMovement(point(-23.55,-46.63,'2026-08-28T09:59:59.999Z'),point(-23.55,-46.63,'2026-08-28T09:50:00.000Z'),now).state,'STALE');
const stopped=deriveTelemetryMovement(point(-23.5501,-46.6301,'2026-08-28T11:00:00.000Z'),point(-23.55,-46.63,'2026-08-28T10:55:00.000Z'),now);
assert.equal(stopped.state,'STOPPED');
assert.equal(stopped.elapsedSeconds,300);
const moving=deriveTelemetryMovement(point(-23.548,-46.628,'2026-08-28T11:00:00.000Z'),point(-23.55,-46.63,'2026-08-28T10:55:00.000Z'),now);
assert.equal(moving.state,'MOVING');
assert.ok((moving.distanceMeters??0)>100);
assert.throws(()=>deriveTelemetryMovement(point(-23.55,-46.63,'2026-08-28T10:00:00.000Z'),point(-23.55,-46.63,'2026-08-28T10:00:00.000Z'),now));
assert.throws(()=>deriveTelemetryMovement(point(-23.55,-46.63,'2026-08-28T12:00:00.001Z'),point(-23.55,-46.63,'2026-08-28T11:59:00.000Z'),now));
console.log('TELEMETRY-1L movement advisory regression: PASS');
