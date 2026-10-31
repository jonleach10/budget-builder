const MAX_DAYS_AFTER_POSTING = 31;

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Reads MM/DD/YYYY, or returns null if it isn't a real date. */
export function parseUsDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [month, day, year] = match.slice(1).map(Number);
  return toIsoDate(year, month, day);
}

/** Reads DD.MM.YYYY, or returns null if it isn't a real date. */
export function parseGermanDate(text: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = match.slice(1).map(Number);
  return toIsoDate(year, month, day);
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Finds the year of an MM/DD date printed on a posted row: the latest date with
 * that month and day that falls no more than 31 days after posting. Only the
 * years around posting are tried, so a leap day with no leap year among them
 * stays unread.
 */
export function inferPurchaseDate(
  monthDay: string,
  postedOn: string,
): string | undefined {
  const [month, day] = monthDay.split("/").map(Number);
  const [postedYear] = postedOn.split("-").map(Number);
  const latest = addDays(postedOn, MAX_DAYS_AFTER_POSTING);

  for (const year of [postedYear + 1, postedYear, postedYear - 1]) {
    const date = toIsoDate(year, month, day);
    if (date !== null && date <= latest) return date;
  }
  return undefined;
}
