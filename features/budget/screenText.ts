import { monthName, shortDate } from "./months";

export type BudgetAction = "save" | "copy";

export function reviewText(count: number): string {
  if (count === 0) return "No rows need review.";
  if (count === 1) return "1 row needs review and isn't in the budget totals.";
  return `${count.toLocaleString("en-US")} rows need review and aren't in the budget totals.`;
}

export function saveButtonText(running: BudgetAction | null): string {
  return running === "save" ? "Saving..." : "Save Budget";
}

export function copyButtonText(
  running: BudgetAction | null,
  monthLabel: string,
): string {
  return running === "copy" ? "Copying..." : `Copy ${monthLabel}`;
}

export function noRateMessage(month: string): string {
  return `Combined figures need a saved EUR rate for ${monthName(month)}. Rates are saved during import, so import a statement, then try again.`;
}

export function currencyNote(currency: string): string {
  return `Amounts are in ${currency}.`;
}

export function firstOfMonth(month: string): string {
  return shortDate(`${month}-01`);
}
