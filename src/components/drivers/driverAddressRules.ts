export type DriverResidenceType = 'HOUSE' | 'APARTMENT' | 'OTHER';

export interface DriverAddressDraft {
  residenceType: DriverResidenceType | '';
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  condominiumName: string;
  building: string;
  unit: string;
  floor: string;
  reference: string;
  otherResidenceType: string;
}

export type DriverAddressField = keyof DriverAddressDraft;
export type DriverAddressErrors = Partial<Record<DriverAddressField, string>>;

export function hasAddressData(address: DriverAddressDraft): boolean {
  return Object.entries(address).some(([key, value]) => key !== 'residenceType' && String(value || '').trim().length > 0)
    || !!address.residenceType;
}

export function validateDriverAddress(address: DriverAddressDraft): DriverAddressErrors {
  const errors: DriverAddressErrors = {};
  if (!hasAddressData(address)) return errors;

  if (!address.residenceType) errors.residenceType = 'Selecione o tipo de residência.';
  if (!address.number.trim()) errors.number = 'Informe o número do endereço.';

  if (address.residenceType === 'APARTMENT') {
    if (!address.condominiumName.trim()) errors.condominiumName = 'Informe o nome do condomínio.';
    if (!address.unit.trim()) errors.unit = 'Informe o apartamento/unidade.';
  }

  if (address.residenceType === 'OTHER' && !address.otherResidenceType.trim()) {
    errors.otherResidenceType = 'Descreva o tipo de residência.';
  }

  return errors;
}

export function residenceTypeLabel(value: DriverResidenceType | ''): string {
  if (value === 'HOUSE') return 'Casa';
  if (value === 'APARTMENT') return 'Apartamento';
  if (value === 'OTHER') return 'Outro';
  return 'Não informado';
}
