// AutoERP Date & Recurrence Utilities

import { RecurringFrequency } from '../../types/enums';

export function formatDateBR(dateString?: string): string {
  if (!dateString) return '-';
  const [year, month, day] = dateString.split('T')[0].split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

export function getCurrentISODate(): string {
  return new Date().toISOString().split('T')[0];
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export function calculateNextRecurringDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const d = new Date(currentDateStr);
  switch (frequency) {
    case RecurringFrequency.WEEKLY:
      d.setDate(d.getDate() + 7);
      break;
    case RecurringFrequency.MONTHLY:
      d.setMonth(d.getMonth() + 1);
      break;
    case RecurringFrequency.QUARTERLY:
      d.setMonth(d.getMonth() + 3);
      break;
    case RecurringFrequency.SEMI_ANNUAL:
      d.setMonth(d.getMonth() + 6);
      break;
    case RecurringFrequency.ANNUAL:
      d.setFullYear(d.getFullYear() + 1);
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
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
