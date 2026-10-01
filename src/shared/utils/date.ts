// AutoERP Date & Recurrence Utilities

import { RecurringFrequency } from '../../types/enums';

export function formatDateBR(dateString?: string): string {
  if (!dateString) return '-';
  const [year, month, day] = dateString.split('T')[0].split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

export function getCurrentISODate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split('T')[0];
}

export function calculateNextRecurringDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const d = new Date(currentDateStr);
  switch (frequency) {
    case RecurringFrequency.WEEKLY:
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case RecurringFrequency.MONTHLY:
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case RecurringFrequency.QUARTERLY:
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case RecurringFrequency.SEMI_ANNUAL:
      d.setUTCMonth(d.getUTCMonth() + 6);
      break;
    case RecurringFrequency.ANNUAL:
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().split('T')[0];
}

export function isDateOverdue(dueDateStr: string): boolean {
  if (!dueDateStr) return false;
  const today = getCurrentISODate();
  return dueDateStr < today;
}

export function getDaysDiff(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
