import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertReviewedCrlvMatchesVehicle } from '../../../server/vehicleCrlvApplyAuthority';

const bridgeSource = readFileSync(new URL('../../../domain/services/VehicleLegacyDetailsBridge.ts', import.meta.url), 'utf8');
const modalSource = readFileSync(new URL('../../ui/ModalContainer.tsx', import.meta.url), 'utf8');
const recordKmSource = readFileSync(new URL('../RecordKmModal.tsx', import.meta.url), 'utf8');
const batchKmSource = readFileSync(new URL('../VehicleKmBatchModal.tsx', import.meta.url), 'utf8');
const intakeModalSource = readFileSync(new URL('../VehicleDocumentIntakeModal.tsx', import.meta.url), 'utf8');
const intakeClientSource = readFileSync(new URL('../../../api/vehicleDocumentIntakeClient.ts', import.meta.url), 'utf8');
const crlvRouteSource = readFileSync(new URL('../../../server/vehicleCrlvApplyRoutes.ts', import.meta.url), 'utf8');

assert.ok(recordKmSource.includes('kmValue <= vehicle.currentKm'), 'single KM update must reject equal or lower odometer values');
assert.ok(recordKmSource.includes('min={vehicle.currentKm + 1}'), 'single KM input must start above current odometer');
assert.ok(batchKmSource.includes('kmValue <= vehicle.currentKm'), 'batch KM update must reject equal or lower odometer values');
assert.ok(batchKmSource.includes('min={vehicle.currentKm + 1}'), 'batch KM input must start above current odometer');
assert.ok(bridgeSource.includes('record.kmValue!==records[index-1].kmValue'), 'visible KM history must suppress consecutive duplicate values');

assert.ok(modalSource.includes("document.body.style.overflow = 'hidden'"), 'modal must lock body scroll');
assert.ok(modalSource.includes("document.documentElement.style.overflow = 'hidden'"), 'modal must lock html scroll');
assert.ok(modalSource.includes("if (appMain) appMain.style.overflow = 'hidden'"), 'modal must lock app main scroll');

assert.ok(!intakeModalSource.includes("{value:'ATPV_E',label:'ATPV-e'}"), 'ATPV-e must not appear in vehicle creation document selector');
assert.ok(intakeClientSource.includes("VehicleIntakeDocumentType = 'CRLV' | 'CRV'"), 'creation intake client must exclude ATPV-e');
assert.ok(crlvRouteSource.includes('assertReviewedCrlvMatchesVehicle(existing, extraction.proposedFields, extraction.corrections)'), 'server must compare approved CRLV identity with the opened vehicle before applying fields');

const vehicle = {
  plate: 'ABC1D23',
  renavam: '12345678901',
  chassis: '9BWZZZ377VT004251',
};
assert.doesNotThrow(() => assertReviewedCrlvMatchesVehicle(vehicle, {
  plate: 'ABC-1D23', renavam: '12345678901', chassis: '9BWZZZ377VT004251',
}, {}));
assert.throws(
  () => assertReviewedCrlvMatchesVehicle(vehicle, { plate: 'DEF4G56' }, {}),
  /CRLV incompatível com o veículo aberto: placa divergente/,
  'mismatched CRLV plate must fail closed',
);
assert.throws(
  () => assertReviewedCrlvMatchesVehicle(vehicle, { plate: 'ABC1D23', renavam: '99999999999' }, {}),
  /CRLV incompatível com o veículo aberto: RENAVAM divergente/,
  'any reviewed identity mismatch must block apply even if another identifier matches',
);
assert.throws(
  () => assertReviewedCrlvMatchesVehicle(vehicle, { brand: 'VW' }, {}),
  /CRLV aprovado sem identificador compatível/,
  'CRLV without a reviewed vehicle identifier must not be applied',
);

console.log('vehicleKmDocCompatibilityRegression: ok');
