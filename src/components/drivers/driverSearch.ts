import type { Driver } from '../../types/entities';

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function matchesDriverSearch(driver: Driver, searchTerm: string): boolean {
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return true;

  if (normalizeText(driver.fullName).includes(normalizedSearch)) return true;

  const searchDigits = digitsOnly(searchTerm);
  if (!searchDigits) return false;

  return [driver.cpf, driver.cnhNumber, driver.phone]
    .map(digitsOnly)
    .some((value) => value.includes(searchDigits));
}
