import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { layoutLineChart } from "./lineChartLayout";
import { OverviewScreen } from "./OverviewScreen";
import type {
  OverviewScreenData,
  ReadyOverview,
} from "./overviewScreenData";
import { TrendCard, TrendTable } from "./TrendCard";

vi.mock("@/features/auth/requireSession", () => ({
  requireSession: vi.fn(),
  serverClient: vi.fn(),
}));

const TREND = layoutLineChart({
  columns: [
    { name: "September 2026", short: "Sep" },
    { name: "October 2026", short: "Oct" },
  ],
  series: [
    { key: "income", label: "Income", color: "chart-1", values: [900000, 985000] },
    {
      key: "spending",
      label: "Spending",
      color: "chart-2",
      values: [720000, 300000],
    },
  ],
  currency: "USD",
});

function ready(extra: Partial<ReadyOverview> = {}): ReadyOverview {
  return {
    status: "ready",
    subtitle: "Amounts are in USD.",
    review: "2 rows need review and aren't in these totals.",
    budgeted: "$7,700.00",
    spent: "$7,434.61",
    remaining: "$265.39",
    over: false,
    budgetStatus: "Under budget",
    used: { percent: 97, label: "97% of the budget used" },
    income: "$9,850.00",
    netSaved: "$2,415.39",
    moneySaved: "$1,000.00",
    trend: TREND,
    ...extra,
  };
}

function render(screen: OverviewScreenData | null) {
  return renderToStaticMarkup(
    createElement(OverviewScreen, {
      params: { month: "2026-10", view: "us" },
      screen,
    }),
  );
}

describe("OverviewScreen", () => {
  it("shows the month's figures", () => {
    const html = render(ready());

    for (const text of [
      "Budgeted",
      "$7,700.00",
      "Spent",
      "$7,434.61",
      "Remaining",
      "$265.39",
      "Income",
      "$9,850.00",
      "Net Saved",
      "$2,415.39",
      "Money Saved",
      "$1,000.00",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("names the meter for screen readers", () => {
    expect(render(ready())).toContain(
      'role="img" aria-label="97% of the budget used"',
    );
  });

  it("marks an overspent budget with an icon and the sign", () => {
    const html = render(
      ready({
        remaining: "-$100.00",
        over: true,
        budgetStatus: "Over budget",
      }),
    );

    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("-$100.00");
    expect(html).toContain("Over budget");
  });

  it("shows the trend", () => {
    const html = render(ready());

    expect(html).toContain("12-Month Trend");
    expect(html).toContain("Income and Spending");
    expect(html).toContain("Show Table");
    expect(html).toContain("<polyline");
  });

  it("explains itself before the first import, with no figures", () => {
    const html = render({
      status: "empty",
      subtitle: "Amounts are in USD.",
      title: "No Statements Imported Yet",
      text: "Spending, income and the 12-month trend appear after the first import.",
    });

    expect(html).toContain("No Statements Imported Yet");
    expect(html).not.toContain("Net Saved");
  });

  it("says Combined has no rate, with no figures", () => {
    const html = render({
      status: "no-rate",
      subtitle: "Amounts are in USD.",
      message: "Combined figures need a saved EUR rate for October 2026.",
    });

    expect(html).toContain("Combined figures need a saved EUR rate");
    expect(html).not.toContain("Net Saved");
    expect(html).not.toContain("<polyline");
  });

  it("says so when the month can't be loaded", () => {
    expect(render(null)).toContain("This month can&#x27;t be loaded.");
  });

  it("links to itself, keeping the month and view", () => {
    expect(render(ready())).toContain('href="/?month=2026-09&amp;view=us"');
  });
});

describe("TrendCard", () => {
  const html = renderToStaticMarkup(createElement(TrendCard, { layout: TREND }));

  it("draws the lines with the chart tokens", () => {
    expect(html).toContain("stroke-chart-1");
    expect(html).toContain("stroke-chart-2");
  });

  it("has a legend and end labels", () => {
    expect(html.match(/Income/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Spending/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("makes every month a button that names its figures", () => {
    expect(html).toContain(
      'aria-label="October 2026: income $9,850.00, spending $3,000.00"',
    );
  });
});

describe("TrendTable", () => {
  const html = renderToStaticMarkup(
    createElement(TrendTable, { layout: TREND }),
  );

  it("holds the same figures as the chart", () => {
    for (const text of [
      "September 2026",
      "$9,000.00",
      "$7,200.00",
      "October 2026",
      "$9,850.00",
      "$3,000.00",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("uses a real table with column and row headers", () => {
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('<th scope="row"');
  });
});
