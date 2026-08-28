import assert from 'node:assert/strict';
import './telemetryContractExcessKmTestRunner';
import './telemetrySanitizedLocationClientTestRunner';
import { deriveTelemetryMaintenanceAdvisory } from '../telemetryMaintenanceAdvisoryAuthority';

const unavailableTelemetry = deriveTelemetryMaintenanceAdvisory(1000, null, 1500);
assert.deepEqual(unavailableTelemetry, {
  authoritativeVehicleKm: 1000,
  telemetryOdometerKm: null,
  nextDueKm: 1500,
  telemetryKmRemaining: null,
  state: 'UNAVAILABLE',
});

const unavailablePlan = deriveTelemetryMaintenanceAdvisory(1000, 1200, null);
assert.equal(unavailablePlan.state, 'UNAVAILABLE');
assert.equal(unavailablePlan.telemetryKmRemaining, null);

assert.equal(deriveTelemetryMaintenanceAdvisory(1000, 1499.999, 2000).state, 'NOT_DUE');
const boundary = deriveTelemetryMaintenanceAdvisory(1000, 1500, 2000);
assert.equal(boundary.state, 'DUE_SOON');
assert.equal(boundary.telemetryKmRemaining, 500);
assert.equal(deriveTelemetryMaintenanceAdvisory(1000, 2000, 2000).state, 'DUE');
const overdue = deriveTelemetryMaintenanceAdvisory(1000, 2050.125, 2000);
assert.equal(overdue.state, 'DUE');
assert.equal(overdue.telemetryKmRemaining, -50.125);

for (const invalid of [
  () => deriveTelemetryMaintenanceAdvisory(-1, 1000, 1500),
  () => deriveTelemetryMaintenanceAdvisory(1000, -1, 1500),
  () => deriveTelemetryMaintenanceAdvisory(1000, 1000, -1),
  () => deriveTelemetryMaintenanceAdvisory(1000, 1000, 1500, -1),
]) {
  assert.throws(invalid);
}

console.log('TELEMETRY-1I1 maintenance advisory derivation regression: PASS');
