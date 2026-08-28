import './telemetryMovementAdvisoryTestRunner';
import assert from 'node:assert/strict';
import { deriveTelemetryLocationFreshness } from '../sanitizedTelemetryLocationAuthority';

const now=new Date('2026-08-28T12:00:00.000Z');
assert.equal(deriveTelemetryLocationFreshness(null,now),'UNAVAILABLE');
assert.equal(deriveTelemetryLocationFreshness('2026-08-28T10:00:00.000Z',now),'FRESH');
assert.equal(deriveTelemetryLocationFreshness('2026-08-28T09:59:59.999Z',now),'STALE');
assert.equal(deriveTelemetryLocationFreshness('2026-08-27T12:00:00.000Z',now),'STALE');
assert.equal(deriveTelemetryLocationFreshness('2026-08-27T11:59:59.999Z',now),'OFFLINE');
assert.throws(()=>deriveTelemetryLocationFreshness('invalid',now));
assert.throws(()=>deriveTelemetryLocationFreshness('2026-08-28T12:00:00.001Z',now));
console.log('TELEMETRY-1K sanitized location regression: PASS');
