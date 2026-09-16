// AutoERP Financial & Business Validations

export function isValidCPF(cpf: string): boolean {
  if (!cpf) return false;
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) return false;

  let sum = 0;
  let rev: number;

  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;

  return true;
}

export function isValidCNPJ(cnpj: string): boolean {
  if (!cnpj) return false;
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14 || /^(\d)\1+$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
}

export function validatePlateFormat(plate: string): boolean {
  if (!plate) return false;
  const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Mercosul (ABC1D23) or Traditional (ABC1234)
  const mercosulRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
  const traditionalRegex = /^[A-Z]{3}[0-9]{4}$/;
  return mercosulRegex.test(clean) || traditionalRegex.test(clean);
}
