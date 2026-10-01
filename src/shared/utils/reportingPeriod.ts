export function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function currentReportingMonthRange(now = new Date()): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

export function lastReportingDaysRange(days: number, now = new Date()): { start: string; end: string } {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

export function currentReportingYearRange(now = new Date()): { start: string; end: string } {
  const year = now.getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
