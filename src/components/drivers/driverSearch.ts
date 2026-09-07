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

function dateVariants(value: string | undefined): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const variants = [raw];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    const [, year, month, day] = match;
    variants.push(`${day}/${month}/${year}`, `${day}${month}${year}`, `${year}${month}${day}`);
  }
  return variants;
}

export function matchesDriverSearch(driver: Driver, searchTerm: string): boolean {
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return true;

  const address = driver.address;
  const textualValues = [
    driver.fullName,
    driver.rg,
    address?.street,
    address?.number,
    address?.neighborhood,
    address?.city,
    address?.state,
    address?.zipCode,
    ...dateVariants(driver.birthDate),
    ...dateVariants(driver.cnhExpiration),
  ].map(normalizeText);

  if (textualValues.some((value) => value.includes(normalizedSearch))) return true;

  const searchDigits = digitsOnly(searchTerm);
  if (!searchDigits) return false;

  const numericValues = [
    driver.cpf,
    driver.cnhNumber,
    driver.phone,
    driver.rg,
    address?.zipCode,
    driver.birthDate,
    driver.cnhExpiration,
    ...dateVariants(driver.birthDate),
    ...dateVariants(driver.cnhExpiration),
  ].map(digitsOnly);

  return numericValues.some((value) => value.includes(searchDigits));
}
