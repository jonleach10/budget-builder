import { addMonths, monthName } from "@/features/budget/months";

/** First and last months, as YYYY-MM, both included. */
export type MonthRange = { from: string; to: string };

/**
 * The period the address asks for: a From and To range, or All Months, whose
 * months come from the account's rows, so the address names it rather than dates.
 */
export type PeriodChoice = { kind: "all" } | ({ kind: "range" } & MonthRange);

export const SHORTCUTS = [
  "this-month",
  "last-3-months",
  "last-12-months",
  "all-months",
] as const;

export type Shortcut = (typeof SHORTCUTS)[number];

export const SHORTCUT_LABELS: Record<Shortcut, string> = {
  "this-month": "This Month",
  "last-3-months": "Last 3 Months",
  "last-12-months": "Last 12 Months",
  "all-months": "All Months",
};

/** The months that end at the last full month, so the month in progress stays out. */
function lastFullMonths(today: string, count: number): PeriodChoice {
  const to = addMonths(today.slice(0, 7), -1);
  return { kind: "range", from: addMonths(to, 1 - count), to };
}

/** This Month is the month in progress. Last 3 and Last 12 Months end before it. */
export function shortcutPeriod(shortcut: Shortcut, today: string): PeriodChoice {
  switch (shortcut) {
    case "this-month": {
      const month = today.slice(0, 7);
      return { kind: "range", from: month, to: month };
    }
    case "last-3-months":
      return lastFullMonths(today, 3);
    case "last-12-months":
      return lastFullMonths(today, 12);
    case "all-months":
      return { kind: "all" };
  }
}

export function inRange(postedOn: string, { from, to }: MonthRange): boolean {
  const month = postedOn.slice(0, 7);
  return month >= from && month <= to;
}

/** How many months the range covers, both ends included. */
export function monthCount({ from, to }: MonthRange): number {
  const index = (month: string) =>
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  return index(to) - index(from) + 1;
}

/** The same number of months, ending the month before the range starts. */
export function comparisonRange(range: MonthRange): MonthRange {
  const count = monthCount(range);
  return {
    from: addMonths(range.from, -count),
    to: addMonths(range.from, -1),
  };
}

/** Every month from the first to the last, in order. */
export function monthsBetween({ from, to }: MonthRange): string[] {
  return Array.from({ length: Math.max(monthCount({ from, to }), 0) }, (_, index) =>
    addMonths(from, index),
  );
}

function lastDay(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

/**
 * The period in words for the subtitle. A range that reaches the month in progress
 * ends today, so a partial month shows as one: "from November 1 to November 8, 2026".
 * One full month is "for October 2026".
 */
export function periodText({ from, to }: MonthRange, today: string): string {
  const inProgress = to === today.slice(0, 7);
  if (from === to && !inProgress) return `for ${monthName(to)}`;

  const [fromName, fromYear] = monthName(from).split(" ");
  const [toName, toYear] = monthName(to).split(" ");
  const day = inProgress ? Number(today.slice(8, 10)) : lastDay(to);
  const end = `${toName} ${day}, ${toYear}`;

  return fromYear === toYear
    ? `from ${fromName} 1 to ${end}`
    : `from ${fromName} 1, ${fromYear}, to ${end}`;
}

/** Such as "May to July 2026", "November 2024 to October 2025" or "September 2026". */
function monthsText({ from, to }: MonthRange): string {
  if (from === to) return monthName(from);
  const [fromName, fromYear] = monthName(from).split(" ");
  return fromYear === to.slice(0, 4)
    ? `${fromName} to ${monthName(to)}`
    : `${monthName(from)} to ${monthName(to)}`;
}

/** The card's hint, naming the period Change is against. */
export function comparisonText(range: MonthRange): string {
  const count = monthCount(range);
  const before = count === 1 ? "the month before" : `the ${count} months before`;
  return `Change is against ${monthsText(comparisonRange(range))}, ${before}.`;
}
