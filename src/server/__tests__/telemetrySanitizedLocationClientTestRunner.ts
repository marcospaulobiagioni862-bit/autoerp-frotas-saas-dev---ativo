import assert from 'node:assert/strict';
import { parseSanitizedTelemetryLocation } from '../../api/telemetrySanitizedLocationClient';

const fresh=parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:-23.551,longitude:-46.633,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH'});
assert.equal(fresh.freshness,'FRESH');
assert.equal(fresh.latitude,-23.551);
assert.equal(parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:null,longitude:null,occurredAt:null,freshness:'UNAVAILABLE'}).freshness,'UNAVAILABLE');
assert.equal(parseSanitizedTelemetryLocation({trackerId:'t1',vehicleId:'v1',latitude:-23.551,longitude:-46.633,occurredAt:'2026-08-27T10:00:00.000Z',freshness:'OFFLINE'}).freshness,'OFFLINE');
for(const invalid of [
  {trackerId:'t1',vehicleId:'v1',latitude:91,longitude:0,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH'},
  {trackerId:'t1',vehicleId:'v1',latitude:0,longitude:181,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH'},
  {trackerId:'t1',vehicleId:'v1',latitude:null,longitude:null,occurredAt:null,freshness:'FRESH'},
  {trackerId:'t1',vehicleId:'v1',latitude:-23.551,longitude:-46.633,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'UNKNOWN'},
  {trackerId:'t1',vehicleId:'v1',latitude:-23.551,longitude:-46.633,occurredAt:'2026-08-28T15:00:00.000Z',freshness:'FRESH',companyId:'unsafe'},
])assert.throws(()=>parseSanitizedTelemetryLocation(invalid));
console.log('TELEMETRY-1K2 sanitized location client regression: PASS');
