const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Passed in by the route, so nothing here depends on the clock. */
export function currentMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function monthCount(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

export function addMonths(month: string, count: number): string {
  const total = monthCount(month) + count;
  const year = String(Math.floor(total / 12)).padStart(4, "0");
  const monthNumber = String((total % 12) + 1).padStart(2, "0");
  return `${year}-${monthNumber}`;
}

/** Lists count months in order, ending at the given month. */
export function lastMonths(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    addMonths(end, index - count + 1),
  );
}

function nameOf(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1];
}

export function monthName(month: string): string {
  return `${nameOf(month)} ${month.slice(0, 4)}`;
}

export function shortMonthName(month: string): string {
  return nameOf(month).slice(0, 3);
}

/** Reads the date as text, so a time zone can't move it to another day. */
export function shortDate(isoDate: string): string {
  return `${shortMonthName(isoDate.slice(0, 7))} ${Number(isoDate.slice(8))}`;
}

/** Finds the closest month, earlier or later. A tie goes to the earlier one. */
export function nearestMonth(
  target: string,
  months: readonly string[],
): string | undefined {
  const distance = (month: string) =>
    Math.abs(monthCount(month) - monthCount(target));

  return [...months]
    .sort()
    .reduce<string | undefined>(
      (best, month) =>
        best === undefined || distance(month) < distance(best) ? month : best,
      undefined,
    );
}
