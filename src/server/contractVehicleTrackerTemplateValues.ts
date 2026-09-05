import type { ContractVehicleTrackerSnapshot } from './contractVehicleTrackerSnapshot';

export function contractVehicleTrackerTemplateValues(
  tracker: ContractVehicleTrackerSnapshot | null,
): Record<string, string> {
  return {
    'vehicle.tracker.id': tracker?.id || '',
    'vehicle.tracker.equipmentModel': tracker?.equipmentModel || '',
    'vehicle.tracker.imei': tracker?.imei || '',
    'vehicle.tracker.serialNumber': tracker?.serialNumber || '',
    'vehicle.tracker.chipCarrier': tracker?.chipCarrier || '',
    'vehicle.tracker.chipNumber': tracker?.chipNumber || '',
    'vehicle.tracker.installationDate': tracker?.installationDate || '',
  };
}
