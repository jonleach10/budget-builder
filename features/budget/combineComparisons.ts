import { sumMinor, type Money } from "@/lib/money";
import { currencyFor } from "./budget";
import type { BudgetComparison } from "./compareBudget";
import { BudgetError } from "./errors";

/** Passed in, so this has no dependency on exchange rates. */
export type ConvertToUsd = (amount: Money) => Money;

/**
 * Gives one USD result per category. Only Germany's budgeted amounts are
 * converted here. Germany's spent is passed in per category, already in USD,
 * because each row keeps the amount its own rate gave it at import. Remaining
 * comes from the USD budgeted and spent, never from converting remaining, so
 * rounding can't break remaining = budgeted - spent.
 */
export function combineComparisons(
  us: BudgetComparison,
  germany: BudgetComparison,
  convert: ConvertToUsd,
  germanySpentUsd: ReadonlyMap<string, number>,
): BudgetComparison {
  const usd = currencyFor("US");
  if (
    us.currency !== usd ||
    germany.currency !== currencyFor("DE") ||
    us.month !== germany.month
  ) {
    throw new BudgetError("comparison-mismatch");
  }

  const toUsd = (minor: number): number => {
    const converted = convert({ minor, currency: germany.currency });
    if (converted.currency !== usd) {
      throw new BudgetError("conversion-currency-mismatch");
    }
    return converted.minor;
  };

  const totals = new Map<string, { budgeted: number[]; spent: number[] }>();
  const add = (category: string, budgeted: number, spent: number): void => {
    const total = totals.get(category) ?? { budgeted: [], spent: [] };
    total.budgeted.push(budgeted);
    total.spent.push(spent);
    totals.set(category, total);
  };

  for (const row of us.categories) {
    add(row.category, row.budgeted, row.spent);
  }
  for (const row of germany.categories) {
    add(row.category, toUsd(row.budgeted), germanySpentUsd.get(row.category) ?? 0);
  }
  const germanyRows = new Set(germany.categories.map((row) => row.category));
  for (const [category, spent] of germanySpentUsd) {
    if (!germanyRows.has(category)) add(category, 0, spent);
  }

  const categories = [...totals].map(([category, total]) => {
    const budgeted = sumMinor(total.budgeted);
    const spent = sumMinor(total.spent);
    return {
      category,
      budgeted,
      spent,
      remaining: sumMinor([budgeted, -spent]),
    };
  });

  return {
    month: us.month,
    currency: usd,
    categories,
    needsReview: us.needsReview + germany.needsReview,
  };
}
