import { randomUUID } from 'node:crypto';
import type { ITransactionContext } from '../domain/finance/ITransactionContext';
import type { KmRecord } from '../types/entities';
import { VehicleStatus } from '../types/enums';

export class VehicleKmError extends Error {
  constructor(public readonly kind: 'INVALID' | 'REGRESSIVE' | 'NOT_FOUND' | 'TERMINAL', message: string) {
    super(message);
  }
}

type KmInput = Pick<KmRecord, 'vehicleId' | 'kmValue' | 'recordDate' | 'readingType' | 'notes'> &
  Partial<Pick<KmRecord, 'driverId' | 'contractId'>>;

/** Call only inside the caller's UnitOfWork: the lock, reading and vehicle update commit together. */
export async function recordVehicleKm(tx: ITransactionContext, companyId: string, input: KmInput) {
  // Telematics remain advisory; they are not an official KM reading source.
  if (!companyId || !Number.isInteger(input.kmValue) || input.kmValue < 0 ||
      !['CHECK_IN', 'CHECK_OUT', 'PERIODIC', 'MAINTENANCE'].includes(input.readingType)) {
    throw new VehicleKmError('INVALID', 'Leitura de KM inválida');
  }
  const repo = tx.getVehicleRepo();
  const before = await repo.findByIdForCompanyWithLock(companyId, input.vehicleId);
  if (!before || before.companyId !== companyId) throw new VehicleKmError('NOT_FOUND', 'Veículo não encontrado');
  if (before.isArchived || [VehicleStatus.SOLD, VehicleStatus.ARCHIVED].includes(before.status)) {
    throw new VehicleKmError('TERMINAL', 'Veículo terminal não permite leitura de KM');
  }
  if (input.kmValue < before.currentKm) {
    throw new VehicleKmError('REGRESSIVE', `KM não pode ser menor que ${before.currentKm} km.`);
  }
  const now = new Date().toISOString();
  const record = await tx.getKmRecordRepo().create({
    ...input, id: randomUUID(), companyId, vehicleId: before.id,
    driverId: input.driverId ?? before.currentDriverId,
    contractId: input.contractId ?? before.currentContractId, createdAt: now,
  });
  // Equal readings are distinct confirmations, with no write to vehicles.currentKm.
  const vehicle = input.kmValue === before.currentKm ? before :
    await repo.updateForCompany(companyId, before.id, { currentKm: input.kmValue, updatedAt: now });
  if (!vehicle) throw new VehicleKmError('NOT_FOUND', 'Veículo não encontrado');
  return { record, vehicle, previousKm: before.currentKm };
}
