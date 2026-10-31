// Works in UTC so a clock change can't skip or repeat a day.
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** True for a real date in YYYY-MM-DD form. Date.UTC rolls 02-30 into March. */
export function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && addDays(text, 0) === text;
}
