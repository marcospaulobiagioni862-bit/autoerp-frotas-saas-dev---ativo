// AutoERP Currency & Financial Math Helper

/**
 * Rounds monetary amounts safely to 2 decimal places to avoid floating point anomalies.
 */
export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a number to Brazilian Real (BRL) currency string.
 */
export function formatCurrencyBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Parses a numeric BRL input string back to standard number.
 */
export function parseCurrencyInput(value: string): number {
  const raw = String(value || '').trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!raw) return 0;

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;

  const cleaned = normalized.replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? roundCurrency(num) : 0;
}

/**
 * Formats a number or canonical numeric string for BRL input controls,
 * using dot as the thousands separator and comma as the decimal separator.
 */
export function formatCurrencyInputBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'number' ? value : parseCurrencyInput(String(value));
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calculates late payment interest and fines based on explicit rates.
 * @param originalAmount Original obligation value
 * @param dueDate Due date YYYY-MM-DD
 * @param paymentDate Calculation/payment date YYYY-MM-DD
 * @param finePercent Percent fine for late payment (e.g., 2%)
 * @param dailyInterestPercent Daily interest percent (e.g., 0.033% = ~1%/month)
 */
export function calculateLateFees(
  originalAmount: number,
  dueDate: string,
  paymentDate: string,
  finePercent: number = 2.0,
  dailyInterestPercent: number = 0.033
): { fineAmount: number; interestAmount: number; daysOverdue: number } {
  const due = new Date(dueDate);
  const pay = new Date(paymentDate);

  // Set hours to 0 to compare purely by date
  due.setHours(0, 0, 0, 0);
  pay.setHours(0, 0, 0, 0);

  const diffMs = pay.getTime() - due.getTime();
  const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (daysOverdue <= 0) {
    return { fineAmount: 0, interestAmount: 0, daysOverdue: 0 };
  }

  const fineAmount = roundCurrency(originalAmount * (finePercent / 100));
  const interestAmount = roundCurrency(originalAmount * (dailyInterestPercent / 100) * daysOverdue);

  return { fineAmount, interestAmount, daysOverdue };
}
