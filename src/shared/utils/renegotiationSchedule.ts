export const RENEGOTIATION_INSTALLMENT_FREQUENCIES = [
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
] as const;

export type RenegotiationInstallmentFrequency =
  (typeof RENEGOTIATION_INSTALLMENT_FREQUENCIES)[number];

export function isRenegotiationInstallmentFrequency(
  value: unknown
): value is RenegotiationInstallmentFrequency {
  return (
    typeof value === 'string' &&
    (RENEGOTIATION_INSTALLMENT_FREQUENCIES as readonly string[]).includes(value)
  );
}

export function resolveRenegotiationInstallmentFrequency(
  value: unknown
): RenegotiationInstallmentFrequency {
  if (value === undefined || value === null || value === '') return 'MONTHLY';
  if (!isRenegotiationInstallmentFrequency(value)) {
    throw new Error('Frequência de renegociação inválida.');
  }
  return value;
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Data da primeira parcela inválida.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Data da primeira parcela inválida.');
  }

  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function calculateRenegotiationDueDate(
  firstDueDate: string,
  installmentNumber: number,
  frequency: RenegotiationInstallmentFrequency
): string {
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1) {
    throw new Error('Número da parcela inválido.');
  }

  const { year, month, day } = parseIsoDate(firstDueDate);
  const offset = installmentNumber - 1;

  if (frequency === 'WEEKLY' || frequency === 'BIWEEKLY') {
    const intervalDays = frequency === 'WEEKLY' ? 7 : 14;
    const date = new Date(Date.UTC(year, month - 1, day + offset * intervalDays));
    return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const targetMonth = new Date(Date.UTC(year, month - 1 + offset, 1));
  const targetYear = targetMonth.getUTCFullYear();
  const targetMonthIndex = targetMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();

  return formatDate(targetYear, targetMonthIndex + 1, Math.min(day, lastDay));
}
