import { formatDateBR } from '../../shared/utils/date';

export function vehicleContractStartDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatDateBR(value)
    : new Date(value).toLocaleDateString('pt-BR');
}

export function vehicleContractStatus(status: string): string {
  return status === 'ACTIVE' ? 'Ativo' : status;
}

export function vehicleDisplayName(brand: string, model: string, version?: string): string {
  const parts = [brand.trim(), model.trim()];
  const variant = version?.trim() || '';
  const tokens = (value: string): string[] => value.toLocaleUpperCase('pt-BR').match(/[\p{L}\p{N}]+/gu) || [];
  const modelTokens = tokens(model);
  const versionTokens = tokens(variant);
  const contained = versionTokens.length > 0 && versionTokens.every((token) => modelTokens.includes(token));
  if (variant && !contained) parts.push(variant);
  return parts.filter(Boolean).join(' ');
}
