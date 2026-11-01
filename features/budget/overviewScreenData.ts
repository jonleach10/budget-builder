import { formatMoney, sumMinor } from "@/lib/money";
import type { CategoryComparison } from "./compareBudget";
import { layoutLineChart, type ChartLayout } from "./lineChartLayout";
import { monthName, shortMonthName } from "./months";
import type { LedgerRow } from "./rows";
import type { ScreenParams } from "./screenParams";
import {
  currencyNote,
  firstOfMonth,
  noRateMessage,
  reviewText,
} from "./screenText";
import {
  compareView,
  monthFlows,
  trendPoints,
  usedPercent,
  viewCurrency,
  type ViewData,
} from "./viewFigures";

export type OverviewData = ViewData & {
  /** The rows of the 12 months the trend covers, whichever month is selected. */
  trendLedger: readonly LedgerRow[];
  hasTransactions: boolean;
};

export type ReadyOverview = {
  status: "ready";
  subtitle: string;
  review: string;
  budgeted: string;
  spent: string;
  remaining: string;
  over: boolean;
  /** Under or over budget. Null when exactly the budget is spent. */
  budgetStatus: string | null;
  used: { percent: number; label: string };
  income: string;
  netSaved: string;
  moneySaved: string;
  trend: ChartLayout;
};

export type OverviewScreenData =
  | ReadyOverview
  | { status: "no-rate"; subtitle: string; message: string }
  | { status: "empty"; subtitle: string; title: string; text: string };

function budgetStatus(remaining: number): string | null {
  if (remaining === 0) return null;
  return remaining < 0 ? "Over budget" : "Under budget";
}

/**
 * Combined's no-rate message comes first, because Combined can't have a rate
 * until the first import. The trend always ends at the current month, wherever
 * the month picker is.
 */
export function buildOverviewScreen(
  { month, view }: ScreenParams,
  current: string,
  data: OverviewData,
): OverviewScreenData {
  const currency = viewCurrency(view);
  const scope = currencyNote(currency);

  const compared = compareView(view, month, data);
  if (compared.status === "no-rate") {
    return {
      status: "no-rate",
      subtitle: scope,
      message: noRateMessage(month),
    };
  }
  if (!data.hasTransactions) {
    return {
      status: "empty",
      subtitle: scope,
      title: "No Statements Imported Yet",
      text: "Spending, income and the 12-month trend appear after the first import.",
    };
  }

  const { categories, needsReview } = compared.comparison;
  const total = (pick: (row: CategoryComparison) => number) =>
    sumMinor(categories.map(pick));
  const budgeted = total((row) => row.budgeted);
  const spent = total((row) => row.spent);
  const remaining = total((row) => row.remaining);

  const flows = monthFlows(data.ledger, view, month);
  const percent = usedPercent(spent, budgeted);
  const money = (minor: number) => formatMoney({ minor, currency });

  const points = trendPoints(data.trendLedger, view, current);

  return {
    status: "ready",
    subtitle:
      view === "combined"
        ? `${scope} Budgets use the ${firstOfMonth(month)} rate, and spending uses each row's saved rate.`
        : scope,
    review: reviewText(needsReview),
    budgeted: money(budgeted),
    spent: money(spent),
    remaining: money(remaining),
    over: remaining < 0,
    budgetStatus: budgetStatus(remaining),
    used: {
      percent: Math.min(percent, 100),
      label: `${percent}% of the budget used`,
    },
    income: money(flows.income),
    netSaved: money(sumMinor([flows.income, -flows.spending])),
    moneySaved: money(flows.saved),
    trend: layoutLineChart({
      columns: points.map((point) => ({
        name: monthName(point.month),
        short: shortMonthName(point.month),
      })),
      series: [
        {
          key: "income",
          label: "Income",
          color: "chart-1",
          values: points.map((point) => point.income),
        },
        {
          key: "spending",
          label: "Spending",
          color: "chart-2",
          values: points.map((point) => point.spending),
        },
      ],
      currency,
    }),
  };
}
