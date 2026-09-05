import type { Tracker } from '../types/entities';

export interface ContractVehicleTrackerSnapshot {
  id: string;
  equipmentModel: string;
  imei: string;
  serialNumber: string;
  chipCarrier: string;
  chipNumber: string;
  installationDate: string;
}

export function selectContractVehicleTrackerSnapshot(
  trackers: Tracker[],
): ContractVehicleTrackerSnapshot | null {
  const selected = trackers
    .filter((tracker) => tracker.status === 'ACTIVE')
    .sort((left, right) => {
      const byInstallation = String(right.installationDate || '').localeCompare(String(left.installationDate || ''));
      if (byInstallation !== 0) return byInstallation;
      const byUpdatedAt = String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
      if (byUpdatedAt !== 0) return byUpdatedAt;
      return left.id.localeCompare(right.id);
    })[0];

  if (!selected) return null;
  return {
    id: selected.id,
    equipmentModel: selected.equipmentModel,
    imei: selected.imei,
    serialNumber: selected.serialNumber || '',
    chipCarrier: selected.chipCarrier || '',
    chipNumber: selected.chipNumber || '',
    installationDate: selected.installationDate,
  };
}

export async function loadContractVehicleTrackerSnapshot(
  tx: any,
  companyId: string,
  vehicleId: string,
): Promise<ContractVehicleTrackerSnapshot | null> {
  const trackers = await tx.getTrackerRepo().findAllByCompany(companyId, vehicleId);
  return selectContractVehicleTrackerSnapshot(trackers);
}

export function sameContractVehicleTrackerSnapshot(
  expected: ContractVehicleTrackerSnapshot | null,
  current: ContractVehicleTrackerSnapshot | null,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(current);
}
