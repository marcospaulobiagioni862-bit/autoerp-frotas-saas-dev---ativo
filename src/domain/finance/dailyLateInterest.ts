import { roundCurrency } from '../../shared/utils/currency';

/** Gregorian civil-day ordinal: no clock, timezone or elapsed-hour arithmetic. */
function civilDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data civil inválida');
  let [year, month, day] = date.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) throw new Error('Data civil inválida');
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400), y = year - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return era * 146097 + y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + dayOfYear;
}

export function fixedDailyInterest(dueDate: string, effectiveDate: string, dailyInterestAmount: number) {
  if (!Number.isFinite(dailyInterestAmount) || dailyInterestAmount < 0 || dailyInterestAmount > 9999999999.99) throw new Error('Juros/dia inválido');
  const daysOverdue = Math.max(0, civilDay(effectiveDate) - civilDay(dueDate));
  const interestAmount = roundCurrency(daysOverdue * roundCurrency(dailyInterestAmount));
  if (interestAmount > 9999999999.99) throw new Error('Juros calculado excede limite financeiro');
  return { daysOverdue, dailyInterestAmount: roundCurrency(dailyInterestAmount), interestAmount };
}

/** Only interest previously applied by the daily-interest rule offsets a later quote.
 * Manual/historical interest on the title is already inside balanceAmount and must not
 * suppress a new daily-interest charge.
 */
export function fixedSettlementQuote(
  obligation: {dueDate: string; balanceAmount: number},
  effectiveDate: string,
  daily: number,
  previouslyAppliedDailyInterest = 0
) {
  const calculated = fixedDailyInterest(obligation.dueDate.slice(0, 10), effectiveDate, daily);
  const appliedDaily = roundCurrency(Math.max(0, Number(previouslyAppliedDailyInterest) || 0));
  const additionalInterest = roundCurrency(Math.max(0, calculated.interestAmount - appliedDaily));
  return { ...calculated, previouslyAppliedDailyInterest: appliedDaily, additionalInterest, totalAmount: roundCurrency(Number(obligation.balanceAmount) + additionalInterest) };
}
