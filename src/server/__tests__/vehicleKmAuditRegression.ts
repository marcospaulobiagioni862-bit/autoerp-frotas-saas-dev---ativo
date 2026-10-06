import assert from 'node:assert/strict';
import { recordVehicleKm } from '../vehicleKmAuthority';

let vehicle: any = { id: 'audit-vehicle', companyId: 'audit-company', currentKm: 10000, status: 'AVAILABLE' };
const readings: any[] = [];
let updates = 0;
const context: any = {
  getVehicleRepo: () => ({ findByIdForCompanyWithLock: async () => vehicle, updateForCompany: async (_company: string, _id: string, patch: any) => { updates++; vehicle = { ...vehicle, ...patch }; return vehicle; } }),
  getKmRecordRepo: () => ({ create: async (item: any) => { readings.push(item); return item; } }),
};
const input = { vehicleId: vehicle.id, kmValue: 9999, readingType: 'PERIODIC' as const, recordDate: '2026-10-01' };
await assert.rejects(() => recordVehicleKm(context, 'audit-company', input), /menor/);
assert.equal(readings.length, 0);
await recordVehicleKm(context, 'audit-company', { ...input, kmValue: 10000 });
assert.equal(readings.length, 1);
assert.equal(updates, 0);
await recordVehicleKm(context, 'audit-company', { ...input, kmValue: 10001 });
assert.equal(vehicle.currentKm, 10001);
assert.equal(updates, 1);
await assert.rejects(() => recordVehicleKm(context, 'audit-company', { ...input, kmValue: 20000, readingType: 'TELEMETRY' as any }), /inválida/);
assert.equal(vehicle.currentKm, 10001);
console.log('PASS KM: lower rejected, equal confirms without update, higher updates, telemetry rejected');
