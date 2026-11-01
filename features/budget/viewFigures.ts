import { convertMoney } from "@/features/fx/convertMoney";
import { findRate, type RatesByDate } from "@/features/fx/findRate";
import { sumMinor, type Money } from "@/lib/money";
import { currencyFor, type Country } from "./budget";
import { combineComparisons } from "./combineComparisons";
import { compareBudget, type BudgetComparison } from "./compareBudget";
import { BudgetError } from "./errors";
import { lastMonths } from "./months";
import {
  toBudget,
  toBudgetEntries,
  type BudgetAmountRow,
  type CategoryRow,
  type LedgerRow,
} from "./rows";
import { countryOf, type BudgetView } from "./screenParams";

const USD = currencyFor("US");

export type ViewData = {
  categories: readonly CategoryRow[];
  amounts: readonly BudgetAmountRow[];
  /** The month's rows. Hidden rows have already been left out. */
  ledger: readonly LedgerRow[];
  rates: RatesByDate;
};

export type ViewComparison =
  | { status: "ready"; comparison: BudgetComparison; rate: string | null }
  | { status: "no-rate" };

export function monthOf(row: LedgerRow): string {
  return row.postedOn.slice(0, 7);
}

export function inView(row: LedgerRow, view: BudgetView): boolean {
  return view === "combined" || row.country === countryOf(view);
}

export function viewCurrency(view: BudgetView): string {
  return currencyFor(countryOf(view) ?? "US");
}

/** The row's own amount, or the amount locked at import for Combined. */
export function amountInView(row: LedgerRow, view: BudgetView): Money {
  const amount = view === "combined" ? row.base : row.amount;
  if (amount.currency !== viewCurrency(view)) {
    throw new BudgetError("entry-currency-mismatch");
  }
  return amount;
}

function compareCountry(
  country: Country,
  month: string,
  { amounts, categories, ledger }: ViewData,
): BudgetComparison {
  return compareBudget(
    toBudget(amounts, month, country, categories),
    toBudgetEntries(ledger, country),
  );
}

/** Each row keeps the USD amount its own rate gave it at import. */
function germanySpentUsd(
  ledger: readonly LedgerRow[],
  month: string,
): Map<string, number> {
  const outflows = new Map<string, number[]>();
  for (const row of ledger) {
    const { category, country, type } = row;
    if (country !== "DE" || type !== "spending" || category === null) continue;
    if (monthOf(row) !== month) continue;

    const values = outflows.get(category) ?? [];
    values.push(-amountInView(row, "combined").minor);
    outflows.set(category, values);
  }
  return new Map(
    [...outflows].map(([category, values]) => [category, sumMinor(values)]),
  );
}

/** Reads rates already loaded. Nothing here fetches one. */
export function compareView(
  view: BudgetView,
  month: string,
  data: ViewData,
): ViewComparison {
  const country = countryOf(view);
  if (country !== null) {
    return {
      status: "ready",
      rate: null,
      comparison: compareCountry(country, month, data),
    };
  }

  const rate = findRate(data.rates, `${month}-01`);
  if (rate === undefined) return { status: "no-rate" };

  return {
    status: "ready",
    rate,
    comparison: combineComparisons(
      compareCountry("US", month, data),
      compareCountry("DE", month, data),
      (amount) => convertMoney(amount, rate, USD),
      germanySpentUsd(data.ledger, month),
    ),
  };
}

export type MonthFlows = { income: number; spending: number; saved: number };

/**
 * Rows with no type stay out. Spending and saved count money out as positive,
 * so a refund lowers spending and money taken back out of savings lowers saved.
 */
export function monthFlows(
  ledger: readonly LedgerRow[],
  view: BudgetView,
  month: string,
): MonthFlows {
  const income: number[] = [];
  const spending: number[] = [];
  const saved: number[] = [];

  for (const row of ledger) {
    if (!inView(row, view) || monthOf(row) !== month) continue;

    if (row.type === "income") income.push(amountInView(row, view).minor);
    if (row.type === "spending") spending.push(-amountInView(row, view).minor);
    if (row.type === "saved") saved.push(-amountInView(row, view).minor);
  }

  return {
    income: sumMinor(income),
    spending: sumMinor(spending),
    saved: sumMinor(saved),
  };
}

export const TREND_MONTHS = 12;

export type TrendPoint = { month: string; income: number; spending: number };

export function trendPoints(
  ledger: readonly LedgerRow[],
  view: BudgetView,
  current: string,
): TrendPoint[] {
  return lastMonths(current, TREND_MONTHS).map((month) => {
    const { income, spending } = monthFlows(ledger, view, month);
    return { month, income, spending };
  });
}

/** A share for display only, so it never feeds back into a money value. */
export function usedPercent(spent: number, budgeted: number): number {
  if (spent <= 0) return 0;
  return budgeted > 0 ? Math.round((spent / budgeted) * 100) : 100;
}
