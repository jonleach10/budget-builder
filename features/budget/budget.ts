import { BudgetError } from "./errors";

/** Categories are shared between countries. Amounts are set per country. */
export const DEFAULT_CATEGORIES = [
  "Housing",
  "Utilities & phone",
  "Groceries",
  "Dining",
  "Transport",
  "Travel",
  "Health",
  "Insurance",
  "Shopping",
  "Leisure & fitness",
  "Education",
  "Loans",
  "Taxes",
  "Fees",
  "Cash",
  "Personal allowance",
] as const;

const MONTH_SHAPE = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export type Country = "US" | "DE";

const CURRENCIES: Record<Country, string> = { US: "USD", DE: "EUR" };

export function currencyFor(country: Country): string {
  return CURRENCIES[country];
}

export type Budget = {
  /** A calendar month, as YYYY-MM. */
  month: string;
  country: Country;
  /** Whole minor units per category, in the country's currency. */
  amounts: Readonly<Record<string, number>>;
};

export function createBudget(
  month: string,
  country: Country,
  amounts: Readonly<Record<string, number>>,
): Budget {
  if (!MONTH_SHAPE.test(month)) throw new BudgetError("invalid-month");
  if (!Object.values(amounts).every(Number.isSafeInteger)) {
    throw new BudgetError("invalid-amount");
  }
  return { month, country, amounts: { ...amounts } };
}

/** Copies amounts only, so unspent money never rolls over. */
export function copyBudget(budget: Budget, month: string): Budget {
  return createBudget(month, budget.country, budget.amounts);
}
