import type { Vehicle } from '../types/entities';

export type VehicleCrlvField =
  | 'plate'
  | 'renavam'
  | 'chassis'
  | 'brand'
  | 'model'
  | 'manufactureYear'
  | 'modelYear'
  | 'fuel';

export const VEHICLE_CRLV_FIELDS: readonly VehicleCrlvField[] = [
  'plate',
  'renavam',
  'chassis',
  'brand',
  'model',
  'manufactureYear',
  'modelYear',
  'fuel',
] as const;

const FIELD_SET = new Set<string>(VEHICLE_CRLV_FIELDS);

export class VehicleCrlvApplyValidationError extends Error {}

export function parseVehicleCrlvSelectedFields(value: unknown): VehicleCrlvField[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > VEHICLE_CRLV_FIELDS.length) {
    throw new VehicleCrlvApplyValidationError('Invalid selected CRLV fields');
  }
  const selected: VehicleCrlvField[] = [];
  const seen = new Set<string>();
  for (const field of value) {
    if (typeof field !== 'string' || !FIELD_SET.has(field) || seen.has(field)) {
      throw new VehicleCrlvApplyValidationError('Invalid selected CRLV fields');
    }
    seen.add(field);
    selected.push(field as VehicleCrlvField);
  }
  return selected;
}

function requiredScalar(source: Record<string, unknown>, field: string): string | number {
  const value = source[field];
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new VehicleCrlvApplyValidationError(`Missing reviewed CRLV field: ${field}`);
  }
  if (typeof value === 'string' && !value.trim()) {
    throw new VehicleCrlvApplyValidationError(`Missing reviewed CRLV field: ${field}`);
  }
  return value;
}

function normalizedPlate(value: string | number): string {
  const plate = String(value).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) {
    throw new VehicleCrlvApplyValidationError('Invalid reviewed CRLV plate');
  }
  return plate;
}

function normalizedRenavam(value: string | number): string {
  const renavam = String(value).replace(/\D/g, '');
  if (!/^\d{11}$/.test(renavam)) {
    throw new VehicleCrlvApplyValidationError('Invalid reviewed CRLV RENAVAM');
  }
  return renavam;
}

function normalizedChassis(value: string | number): string {
  const chassis = String(value).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(chassis)) {
    throw new VehicleCrlvApplyValidationError('Invalid reviewed CRLV chassis');
  }
  return chassis;
}

function normalizedText(value: string | number, field: string): string {
  const clean = String(value).trim();
  if (!clean || clean.length > 160) {
    throw new VehicleCrlvApplyValidationError(`Invalid reviewed CRLV ${field}`);
  }
  return clean;
}

function normalizedYear(value: string | number, field: string): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new VehicleCrlvApplyValidationError(`Invalid reviewed CRLV ${field}`);
  }
  return year;
}

function reviewedSource(proposedFields: unknown, corrections: unknown): Record<string, unknown> {
  const proposed = proposedFields && typeof proposedFields === 'object' && !Array.isArray(proposedFields)
    ? proposedFields as Record<string, unknown>
    : {};
  const reviewedCorrections = corrections && typeof corrections === 'object' && !Array.isArray(corrections)
    ? corrections as Record<string, unknown>
    : {};
  return { ...proposed, ...reviewedCorrections };
}

export function assertReviewedCrlvMatchesVehicle(
  vehicle: Pick<Vehicle, 'plate' | 'renavam' | 'chassis'>,
  proposedFields: unknown,
  corrections: unknown,
): void {
  const source = reviewedSource(proposedFields, corrections);
  const checks: Array<[string, string, string]> = [];

  if (source.plate !== undefined && source.plate !== null && String(source.plate).trim()) {
    checks.push(['placa', normalizedPlate(source.plate as string | number), normalizedPlate(vehicle.plate)]);
  }
  if (source.renavam !== undefined && source.renavam !== null && String(source.renavam).trim() && vehicle.renavam) {
    checks.push(['RENAVAM', normalizedRenavam(source.renavam as string | number), normalizedRenavam(vehicle.renavam)]);
  }
  if (source.chassis !== undefined && source.chassis !== null && String(source.chassis).trim() && vehicle.chassis) {
    checks.push(['chassi', normalizedChassis(source.chassis as string | number), normalizedChassis(vehicle.chassis)]);
  }

  if (checks.length === 0) {
    throw new VehicleCrlvApplyValidationError('CRLV aprovado sem identificador compatível com o veículo aberto');
  }
  const mismatch = checks.find(([, reviewed, current]) => reviewed !== current);
  if (mismatch) {
    throw new VehicleCrlvApplyValidationError(`CRLV incompatível com o veículo aberto: ${mismatch[0]} divergente`);
  }
}

export function buildVehicleChangesFromReviewedCrlv(
  proposedFields: unknown,
  corrections: unknown,
  selectedFields: readonly VehicleCrlvField[],
): Partial<Vehicle> {
  const source = reviewedSource(proposedFields, corrections);
  const changes: Partial<Vehicle> = {};

  for (const field of selectedFields) {
    const value = requiredScalar(source, field);
    if (field === 'plate') changes.plate = normalizedPlate(value);
    else if (field === 'renavam') changes.renavam = normalizedRenavam(value);
    else if (field === 'chassis') changes.chassis = normalizedChassis(value);
    else if (field === 'brand') changes.brand = normalizedText(value, 'brand');
    else if (field === 'model') changes.model = normalizedText(value, 'model');
    else if (field === 'manufactureYear') changes.yearFabrication = normalizedYear(value, 'manufactureYear');
    else if (field === 'modelYear') changes.yearModel = normalizedYear(value, 'modelYear');
    else if (field === 'fuel') changes.fuelType = normalizedText(value, 'fuel');
  }

  return changes;
}
