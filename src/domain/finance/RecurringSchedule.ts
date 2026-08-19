import { RecurringFrequency } from '../../types/enums';

function assertDate(dateStr: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Invalid recurring schedule date');
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== dateStr) throw new Error('Invalid recurring schedule date');
  return [year, month, day];
}

export function getIsoWeek(dateStr: string): string {
  const [year, month, day] = assertDate(dateStr);
  const target = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;
}

export function calculatePeriodRef(frequency: RecurringFrequency, dateStr: string): string {
  const [year, month] = assertDate(dateStr);
  switch (frequency) {
    case RecurringFrequency.WEEKLY:
      return getIsoWeek(dateStr);
    case RecurringFrequency.MONTHLY:
      return `${year}-${String(month).padStart(2, '0')}`;
    case RecurringFrequency.QUARTERLY:
      return `${year}-Q${Math.ceil(month / 3)}`;
    case RecurringFrequency.SEMI_ANNUAL:
      return `${year}-S${month <= 6 ? 1 : 2}`;
    case RecurringFrequency.ANNUAL:
      return String(year);
    default:
      throw new Error('Unsupported recurring frequency');
  }
}

function addMonths(year: number, month: number, day: number, months: number): string {
  const zeroBased = (month - 1) + months;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  const maxDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
}

export function advanceNextGenerationDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const [year, month, day] = assertDate(currentDateStr);
  switch (frequency) {
    case RecurringFrequency.WEEKLY: {
      const date = new Date(Date.UTC(year, month - 1, day));
      date.setUTCDate(date.getUTCDate() + 7);
      return date.toISOString().slice(0, 10);
    }
    case RecurringFrequency.MONTHLY:
      return addMonths(year, month, day, 1);
    case RecurringFrequency.QUARTERLY:
      return addMonths(year, month, day, 3);
    case RecurringFrequency.SEMI_ANNUAL:
      return addMonths(year, month, day, 6);
    case RecurringFrequency.ANNUAL:
      return addMonths(year, month, day, 12);
    default:
      throw new Error('Unsupported recurring frequency');
  }
}
