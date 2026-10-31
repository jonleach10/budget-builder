import { addDays, isIsoDate } from "./dates";

export type RatesByDate = Readonly<Record<string, string>>;

// Long enough to cover a weekend joined to bank holidays.
const LOOKBACK_DAYS = 7;

/** Returns the rate for a date, or the latest earlier rate within 7 days. */
export function findRate(rates: RatesByDate, date: string): string | undefined {
  if (!isIsoDate(date)) return undefined;

  for (let daysBack = 0; daysBack <= LOOKBACK_DAYS; daysBack += 1) {
    const rate = rates[addDays(date, -daysBack)];
    if (rate !== undefined) return rate;
  }
  return undefined;
}
