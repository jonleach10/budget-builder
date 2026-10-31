import { sumMinor, type Money } from "@/lib/money";
import { currencyFor, type Budget } from "./budget";
import { BudgetError } from "./errors";

/** An entry that already passed the type check. Negative means money out. */
export type BudgetEntry = {
  postedOn: string;
  category?: string | null;
  amount: Money;
};

/** Budgeted, spent and remaining are minor units of the result's currency. */
export type CategoryComparison = {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
};

export type BudgetComparison = {
  month: string;
  currency: string;
  categories: CategoryComparison[];
  /** Entries left out of the category totals because they have no category. */
  needsReview: number;
};

const DATE_SHAPE = /^(\d{4}-(?:0[1-9]|1[0-2]))-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Reads the month as text, so a time zone can't move an entry into another one.
 * A date it can't read throws, so spending never drops out as another month.
 */
function monthOf(postedOn: string): string {
  const match = DATE_SHAPE.exec(postedOn);
  if (!match) throw new BudgetError("invalid-date");
  return match[1];
}

export function compareBudget(
  budget: Budget,
  entries: readonly BudgetEntry[],
): BudgetComparison {
  // Maps, so a category named like an Object property stays a plain category.
  const budgeted = new Map(Object.entries(budget.amounts));
  const outflows = new Map<string, number[]>();
  for (const category of budgeted.keys()) {
    outflows.set(category, []);
  }
  const currency = currencyFor(budget.country);
  let needsReview = 0;
  for (const entry of entries) {
    if (entry.amount.currency !== currency) {
      throw new BudgetError("entry-currency-mismatch");
    }
    if (monthOf(entry.postedOn) !== budget.month) continue;
    if (!entry.category) {
      needsReview += 1;
      continue;
    }
    const values = outflows.get(entry.category) ?? [];
    values.push(-entry.amount.minor);
    outflows.set(entry.category, values);
  }

  const categories = [...outflows].map(([category, values]) => {
    const amount = budgeted.get(category) ?? 0;
    const spent = sumMinor(values);
    return {
      category,
      budgeted: amount,
      spent,
      remaining: sumMinor([amount, -spent]),
    };
  });

  return {
    month: budget.month,
    currency,
    categories,
    needsReview,
  };
}
