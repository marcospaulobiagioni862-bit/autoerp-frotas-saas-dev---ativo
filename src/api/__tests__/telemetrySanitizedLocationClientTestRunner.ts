import assert from 'node:assert/strict';
import { parseSanitizedTelemetryLocation } from '../telemetrySanitizedLocationClient';

const fresh=parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:-23.551,longitude:-46.633,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH'});
assert.equal(fresh.freshness,'FRESH');
assert.equal(fresh.latitude,-23.551);
assert.equal(parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:null,longitude:null,occurredAt:null,freshness:'UNAVAILABLE'}).freshness,'UNAVAILABLE');
assert.throws(()=>parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:-23.551,longitude:-46.633,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH',companyId:'secret'}),/Unsafe telemetry location response/);
assert.throws(()=>parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:91,longitude:-46.633,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH'}),/Invalid telemetry location field/);
assert.throws(()=>parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:null,longitude:null,occurredAt:null,freshness:'OFFLINE'}),/Inconsistent telemetry location response/);

console.log('telemetry sanitized location client regression: PASS');
