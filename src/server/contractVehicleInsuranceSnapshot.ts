import type { Insurance } from '../types/entities';

export interface ContractVehicleInsuranceSnapshot {
  id: string;
  insuranceCompany: string;
  policyNumber: string;
  coverageDetails: string;
  deductibleAmount: number;
  startDate: string;
  endDate: string;
}

function isEligible(insurance: Insurance, contractStartDate: string): boolean {
  return insurance.status === 'ACTIVE' &&
    insurance.startDate <= contractStartDate &&
    insurance.endDate >= contractStartDate;
}

export function selectContractVehicleInsuranceSnapshot(
  insurances: Insurance[],
  contractStartDate: string,
): ContractVehicleInsuranceSnapshot | null {
  const eligible = insurances
    .filter((insurance) => isEligible(insurance, contractStartDate))
    .sort((left, right) => {
      const byStartDate = right.startDate.localeCompare(left.startDate);
      if (byStartDate !== 0) return byStartDate;
      const byEndDate = right.endDate.localeCompare(left.endDate);
      if (byEndDate !== 0) return byEndDate;
      return left.id.localeCompare(right.id);
    });

  const selected = eligible[0];
  if (!selected) return null;

  return {
    id: selected.id,
    insuranceCompany: selected.insuranceCompany,
    policyNumber: selected.policyNumber,
    coverageDetails: selected.coverageDetails,
    deductibleAmount: selected.deductibleAmount,
    startDate: selected.startDate,
    endDate: selected.endDate,
  };
}

export async function loadContractVehicleInsuranceSnapshot(
  tx: any,
  companyId: string,
  vehicleId: string,
  contractStartDate: string,
): Promise<ContractVehicleInsuranceSnapshot | null> {
  const insurances = await tx.getInsuranceRepo().findAllByCompany(companyId, { vehicleId });
  return selectContractVehicleInsuranceSnapshot(insurances, contractStartDate);
}

export function sameContractVehicleInsuranceSnapshot(
  expected: ContractVehicleInsuranceSnapshot | null,
  current: ContractVehicleInsuranceSnapshot | null,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(current);
}
