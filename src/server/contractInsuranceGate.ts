import type { Insurance } from '../types/entities';

export function hasEligibleVehicleInsurance(
  insurances: Insurance[],
  contractStartDate: string
): boolean {
  return insurances.some((insurance) =>
    insurance.status === 'ACTIVE' &&
    insurance.startDate <= contractStartDate &&
    insurance.endDate >= contractStartDate
  );
}

export async function ensureVehicleInsuranceEligible(
  companyId: string,
  vehicleId: string,
  contractStartDate: string,
  tx: any
): Promise<boolean> {
  const insurances = await tx.getInsuranceRepo().findAllByCompany(companyId, { vehicleId });
  return hasEligibleVehicleInsurance(insurances, contractStartDate);
}
