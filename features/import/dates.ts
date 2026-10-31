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
  const [, month, day, year] = match.map(Number);
  return toIsoDate(year, month, day);
}

/** Reads DD.MM.YYYY, or returns null if it isn't a real date. */
export function parseGermanDate(text: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  return toIsoDate(year, month, day);
}

/**
 * Finds the year of an MM/DD date printed on a posted row. A month more than
 * half a year after the posting month belongs to the previous year, which
 * covers December purchases posted in January without moving a purchase that
 * is dated a day after it posted.
 */
export function inferPurchaseDate(
  monthDay: string,
  postedOn: string,
): string | undefined {
  const [month, day] = monthDay.split("/").map(Number);
  const [postedYear, postedMonth] = postedOn.split("-").map(Number);
  const year = month > postedMonth + 6 ? postedYear - 1 : postedYear;
  return toIsoDate(year, month, day) ?? undefined;
}
