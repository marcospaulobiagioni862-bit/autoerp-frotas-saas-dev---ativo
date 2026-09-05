import type { ContractVehicleInsuranceSnapshot } from './contractVehicleInsuranceSnapshot';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function contractVehicleInsuranceTemplateValues(
  insurance: ContractVehicleInsuranceSnapshot | null,
): Record<string, string> {
  return {
    'vehicle.insurance.company': insurance?.insuranceCompany || '',
    'vehicle.insurance.policyNumber': insurance?.policyNumber || '',
    'vehicle.insurance.coverageDetails': insurance?.coverageDetails || '',
    'vehicle.insurance.deductibleAmount': insurance ? formatMoney(insurance.deductibleAmount) : '',
    'vehicle.insurance.startDate': insurance?.startDate || '',
    'vehicle.insurance.endDate': insurance?.endDate || '',
  };
}
