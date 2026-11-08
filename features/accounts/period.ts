import { addMonths, monthName } from "@/features/budget/months";

/** Only Last 3 Months for now. The period control adds the others. */
export type AccountPeriod = "last-3-months";

/** First and last months, as YYYY-MM, both included. */
export type MonthRange = { from: string; to: string };

/** Last 3 Months ends at the last full month, so the month in progress stays out. */
export function periodRange(_period: AccountPeriod, today: string): MonthRange {
  const to = addMonths(today.slice(0, 7), -1);
  return { from: addMonths(to, -2), to };
}

export function inRange(postedOn: string, { from, to }: MonthRange): boolean {
  const month = postedOn.slice(0, 7);
  return month >= from && month <= to;
}

function lastDay(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

/** Such as "from August 1 to October 31, 2026", with both years when they differ. */
export function rangeText({ from, to }: MonthRange): string {
  const [fromName, fromYear] = monthName(from).split(" ");
  const [toName, toYear] = monthName(to).split(" ");
  const end = `${toName} ${lastDay(to)}, ${toYear}`;

  return fromYear === toYear
    ? `from ${fromName} 1 to ${end}`
    : `from ${fromName} 1, ${fromYear}, to ${end}`;
}
