import {
  layoutLineChart,
  type ChartColumn,
  type ChartLayout,
} from "@/features/budget/lineChartLayout";
import { lastMonths, monthName, shortMonthName } from "@/features/budget/months";
import type { LedgerRow } from "@/features/budget/rows";
import { needsReview } from "@/features/categorize/needsReview";
import { monthCount, monthsBetween, type MonthRange } from "./period";

/** The Monthly Spending card: the chart and, for one month, why it shows 12. */
export type SpendingTrend = { layout: ChartLayout; hint: string | null };

/** One month alone isn't a trend, so it shows with the months before it. */
const ONE_MONTH_CONTEXT = 12;
/** Past this many months, only every third month is labelled. */
const LABEL_EVERY_MONTH_UP_TO = 30;
const LABEL_EVERY = 3;

/** Shown in place of a figure, as the Transactions badge says it. */
const NEEDS_REVIEW = "Needs Review";

/**
 * Months with rows, every one of which needs review. Such a month has no figure
 * yet: plotting it as $0 would look like spending stopped. The ledger has no
 * hidden rows, because toLedger left them out.
 */
function monthsAllInReview(ledger: readonly LedgerRow[]): Set<string> {
  const decided = new Set<string>();
  const seen = new Set<string>();
  for (const row of ledger) {
    const month = row.postedOn.slice(0, 7);
    seen.add(month);
    if (!needsReview({ ...row, hidden: false })) decided.add(month);
  }
  return new Set([...seen].filter((month) => !decided.has(month)));
}

/**
 * Labelled in calendar quarters past 30 months, so every January is one. The
 * year goes under the first labelled month and under each January.
 */
function axisColumns(months: readonly string[]): ChartColumn[] {
  const sparse = months.length > LABEL_EVERY_MONTH_UP_TO;
  const labelled = (month: string) =>
    !sparse || (Number(month.slice(5, 7)) - 1) % LABEL_EVERY === 0;
  const first = months.find(labelled);

  return months.map((month) => {
    const shown = labelled(month);
    const yearShown = shown && (month === first || month.endsWith("-01"));
    return {
      name: monthName(month),
      short: shortMonthName(month),
      labelled: shown,
      ...(yearShown ? { year: month.slice(0, 4) } : {}),
    };
  });
}

/**
 * One point for each month of the period. A one-month period shows the 12 months
 * up to it, with it highlighted. Null when every month is $0, because the
 * no-Spending line says so already. A month whose rows all need review isn't $0,
 * so it keeps the trend.
 */
export function buildSpendingTrend({
  ledger,
  spentByMonth,
  range,
  currency,
}: {
  ledger: readonly LedgerRow[];
  /** Each month's Spending in minor units, by the categories' rule. */
  spentByMonth: ReadonlyMap<string, number>;
  range: MonthRange;
  currency: string;
}): SpendingTrend | null {
  const oneMonth = monthCount(range) === 1;
  const months = oneMonth
    ? lastMonths(range.to, ONE_MONTH_CONTEXT)
    : monthsBetween(range);
  const review = monthsAllInReview(ledger);
  const values = months.map((month) =>
    review.has(month) ? { missing: NEEDS_REVIEW } : (spentByMonth.get(month) ?? 0),
  );
  if (values.every((value) => value === 0)) return null;

  return {
    layout: layoutLineChart({
      columns: axisColumns(months),
      series: [{ key: "spending", label: "Spending", color: "chart-2", values }],
      currency,
      ...(oneMonth ? { highlight: months.length - 1 } : {}),
    }),
    hint: oneMonth
      ? `One month has one point, so the chart shows the 12 months up to ${monthName(range.to)}.`
      : null,
  };
}
