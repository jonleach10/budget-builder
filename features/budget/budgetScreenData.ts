import { formatMoney, formatPlainAmount, sumMinor } from "@/lib/money";
import type { Country } from "./budget";
import type { CategoryComparison } from "./compareBudget";
import { monthName, nearestMonth, shortDate } from "./months";
import type { BudgetAmountRow, LedgerRow } from "./rows";
import { countryOf, type BudgetView, type ScreenParams } from "./screenParams";
import {
  currencyNote,
  firstOfMonth,
  noRateMessage,
  reviewText,
} from "./screenText";
import {
  amountInView,
  compareView,
  inView,
  monthOf,
  usedPercent,
  viewCurrency,
  type ViewData,
} from "./viewFigures";

export type TransactionLine = {
  id: string;
  date: string;
  description: string;
  account: string;
  amount: string;
  /** The EUR amount under a USD base amount, in Combined. */
  original: string | null;
};

export type BudgetLine = {
  categoryId: string;
  name: string;
  /** What the amount field starts with, blank when nothing is saved. */
  amountInput: string;
  budgeted: string;
  spent: string;
  remaining: string;
  over: boolean;
  used: { percent: number; label: string };
  transactions: TransactionLine[];
};

export type MonthSetup =
  | { kind: "has-amounts" }
  | { kind: "first"; title: string; text: string }
  | {
      kind: "copy";
      from: string;
      fromLabel: string;
      title: string;
      text: string;
    };

export type ReadyBudgetScreen = {
  status: "ready";
  subtitle: string;
  review: string;
  /** The country this view edits, or null for Combined, which is read-only. */
  country: Country | null;
  currency: string;
  setup: MonthSetup;
  lines: BudgetLine[];
  totals: {
    budgeted: string;
    spent: string;
    remaining: string;
    over: boolean;
  };
  noTransactions: string;
};

export type BudgetScreenData =
  | ReadyBudgetScreen
  | { status: "no-rate"; subtitle: string; message: string };

function subtitleFor(view: BudgetView, month: string, rate: string | null) {
  if (view === "combined") {
    return `Amounts are in USD. Edit amounts in the US and Germany views. Budgets use the ${firstOfMonth(month)} rate of ${rate}, and spending uses each row's saved rate.`;
  }
  return `${currencyNote(viewCurrency(view))} Changes apply to ${monthName(month)} only.`;
}

function monthSetup(
  view: BudgetView,
  month: string,
  amounts: readonly BudgetAmountRow[],
): MonthSetup {
  const country = countryOf(view);
  if (country === null) return { kind: "has-amounts" };

  const months = amounts
    .filter((row) => row.country === country)
    .map((row) => row.month);
  if (months.includes(month)) return { kind: "has-amounts" };

  const name = monthName(month);
  const from = nearestMonth(month, months);
  if (from === undefined) {
    return {
      kind: "first",
      title: `Set the ${name} Budget`,
      text: `${currencyNote(viewCurrency(view))} Leave a category blank to budget nothing for it.`,
    };
  }

  const fromLabel = monthName(from);
  return {
    kind: "copy",
    from,
    fromLabel,
    title: `No Budget for ${name}`,
    text: `Copy the amounts from ${fromLabel}, then edit any that change.`,
  };
}

function transactionLines(
  category: string,
  ledger: readonly LedgerRow[],
  view: BudgetView,
  month: string,
): TransactionLine[] {
  return ledger
    .filter(
      (row) =>
        row.type === "spending" &&
        row.category === category &&
        inView(row, view) &&
        monthOf(row) === month,
    )
    .sort(
      (a, b) =>
        b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id),
    )
    .map((row) => ({
      id: row.id,
      date: shortDate(row.postedOn),
      description: row.description,
      account: row.account,
      amount: formatMoney(amountInView(row, view)),
      original:
        view === "combined" && row.country === "DE"
          ? formatMoney(row.amount)
          : null,
    }));
}

const NOTHING: Omit<CategoryComparison, "category"> = {
  budgeted: 0,
  spent: 0,
  remaining: 0,
};

/** Every category gets a line, so an amount can be entered for any of them. */
export function buildBudgetScreen(
  { month, view }: ScreenParams,
  data: ViewData,
): BudgetScreenData {
  const compared = compareView(view, month, data);
  if (compared.status === "no-rate") {
    return {
      status: "no-rate",
      subtitle: currencyNote(viewCurrency(view)),
      message: noRateMessage(month),
    };
  }

  const { comparison, rate } = compared;
  const { currency } = comparison;
  const money = (minor: number) => formatMoney({ minor, currency });
  const country = countryOf(view);
  const byName = new Map(
    comparison.categories.map((row) => [row.category, row]),
  );
  const savedAmounts = new Map(
    data.amounts.flatMap((row) =>
      row.month === month && row.country === country
        ? [[row.category_id, row.amount_minor] as const]
        : [],
    ),
  );

  const lines = data.categories.map(({ id, name }): BudgetLine => {
    const { budgeted, spent, remaining } = byName.get(name) ?? NOTHING;
    const percent = usedPercent(spent, budgeted);
    const saved = savedAmounts.get(id);
    return {
      categoryId: id,
      name,
      amountInput:
        saved === undefined
          ? ""
          : formatPlainAmount({ minor: saved, currency }),
      budgeted: money(budgeted),
      spent: money(spent),
      remaining: money(remaining),
      over: remaining < 0,
      used: { percent: Math.min(percent, 100), label: `${percent}% used` },
      transactions: transactionLines(name, data.ledger, view, month),
    };
  });

  const total = (pick: (row: CategoryComparison) => number) =>
    sumMinor(comparison.categories.map(pick));
  const remaining = total((row) => row.remaining);

  return {
    status: "ready",
    subtitle: subtitleFor(view, month, rate),
    review: reviewText(comparison.needsReview),
    country,
    currency,
    setup: monthSetup(view, month, data.amounts),
    lines,
    totals: {
      budgeted: money(total((row) => row.budgeted)),
      spent: money(total((row) => row.spent)),
      remaining: money(remaining),
      over: remaining < 0,
    },
    noTransactions: `No transactions in this category for ${monthName(month)}.`,
  };
}
