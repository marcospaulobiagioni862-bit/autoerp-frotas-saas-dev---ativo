import assert from 'node:assert/strict';
import { deriveTelemetryContractExcessKm } from '../telemetryContractExcessKmAuthority';

const unavailableContract=deriveTelemetryContractExcessKm(null,1500,null);
assert.equal(unavailableContract.state,'UNAVAILABLE');
assert.equal(unavailableContract.telemetryTravelledKm,null);

const unavailableTelemetry=deriveTelemetryContractExcessKm(1000,null,500);
assert.equal(unavailableTelemetry.state,'UNAVAILABLE');

const unavailableRegression=deriveTelemetryContractExcessKm(1500,1499,500);
assert.equal(unavailableRegression.state,'UNAVAILABLE');

const within=deriveTelemetryContractExcessKm(1000,1399.999,500);
assert.equal(within.state,'WITHIN_LIMIT');
assert.equal(within.telemetryTravelledKm,399.999);
assert.equal(within.telemetryRemainingKm,100.001);
assert.equal(within.telemetryExcessKm,0);

const nearBoundary=deriveTelemetryContractExcessKm(1000,1400,500);
assert.equal(nearBoundary.state,'NEAR_LIMIT');
assert.equal(nearBoundary.telemetryRemainingKm,100);

const exactLimit=deriveTelemetryContractExcessKm(1000,1500,500);
assert.equal(exactLimit.state,'NEAR_LIMIT');
assert.equal(exactLimit.telemetryRemainingKm,0);
assert.equal(exactLimit.telemetryExcessKm,0);

const exceeded=deriveTelemetryContractExcessKm(1000,1500.001,500);
assert.equal(exceeded.state,'EXCEEDED');
assert.equal(exceeded.telemetryExcessKm,0.001);
assert.equal(exceeded.telemetryRemainingKm,-0.001);

for(const invalid of [
  ()=>deriveTelemetryContractExcessKm(-1,1000,500),
  ()=>deriveTelemetryContractExcessKm(1000,-1,500),
  ()=>deriveTelemetryContractExcessKm(1000,1200,-1),
  ()=>deriveTelemetryContractExcessKm(1000,1200,500,-1),
])assert.throws(invalid);

console.log('TELEMETRY-1J contract excess KM derivation regression: PASS');
