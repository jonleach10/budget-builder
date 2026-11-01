import { describe, expect, it } from "vitest";
import {
  buildOverviewScreen,
  type OverviewData,
  type ReadyOverview,
} from "./overviewScreen";
import type { LedgerRow } from "./rows";
import type { BudgetView } from "./screenParams";

function usRow(extra: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "t1",
    postedOn: "2026-10-03",
    country: "US",
    account: "Card A",
    description: "SAMPLE GROCER",
    amount: { minor: -40000, currency: "USD" },
    base: { minor: -40000, currency: "USD" },
    type: "spending",
    category: "Groceries",
    ...extra,
  };
}

function money(minor: number, currency = "USD") {
  return { minor, currency };
}

const LEDGER: LedgerRow[] = [
  usRow(),
  usRow({ id: "uncategorized", category: null, amount: money(-5000) }),
  usRow({ id: "no-type", type: null, category: null, amount: money(-9900) }),
  usRow({
    id: "pay",
    type: "income",
    category: null,
    amount: money(500000),
    base: money(500000),
  }),
  usRow({
    id: "brokerage",
    type: "saved",
    category: null,
    amount: money(-100000),
    base: money(-100000),
  }),
];

function data(extra: Partial<OverviewData> = {}): OverviewData {
  return {
    categories: [{ id: "cat-groceries", name: "Groceries", position: 0 }],
    amounts: [
      {
        month: "2026-10",
        country: "US",
        category_id: "cat-groceries",
        amount_minor: 45000,
      },
    ],
    ledger: LEDGER,
    trendLedger: LEDGER,
    rates: { "2026-10-01": "1.08" },
    hasTransactions: true,
    ...extra,
  };
}

function build(view: BudgetView, input = data(), month = "2026-10") {
  return buildOverviewScreen({ month, view }, "2026-10", input);
}

function ready(view: BudgetView, input = data()): ReadyOverview {
  const screen = build(view, input);
  if (screen.status !== "ready") throw new Error("Expected a ready screen.");
  return screen;
}

describe("buildOverviewScreen", () => {
  it("shows the month's budget totals", () => {
    expect(ready("us")).toMatchObject({
      budgeted: "$450.00",
      spent: "$400.00",
      remaining: "$50.00",
      over: false,
      budgetStatus: "Under budget",
      used: { percent: 89, label: "89% of the budget used" },
    });
  });

  it("marks an overspent budget", () => {
    const screen = ready(
      "us",
      data({
        amounts: [
          {
            month: "2026-10",
            country: "US",
            category_id: "cat-groceries",
            amount_minor: 30000,
          },
        ],
      }),
    );

    expect(screen).toMatchObject({
      remaining: "-$100.00",
      over: true,
      budgetStatus: "Over budget",
      used: { percent: 100, label: "133% of the budget used" },
    });
  });

  it("gives no status when exactly the budget is spent", () => {
    const screen = ready(
      "us",
      data({
        amounts: [
          {
            month: "2026-10",
            country: "US",
            category_id: "cat-groceries",
            amount_minor: 40000,
          },
        ],
      }),
    );

    expect(screen.budgetStatus).toBeNull();
  });

  it("shows income, net saved and money saved", () => {
    // Net saved is 5,000.00 less spending of 450.00. That spending includes the
    // uncategorized spending row, and leaves out the row with no type.
    expect(ready("us")).toMatchObject({
      income: "$5,000.00",
      netSaved: "$4,550.00",
      moneySaved: "$1,000.00",
    });
  });

  it("can show a negative net saved", () => {
    const screen = ready(
      "us",
      data({ ledger: [usRow()], trendLedger: [] }),
    );

    expect(screen.netSaved).toBe("-$400.00");
  });

  it("shows the needs-review count", () => {
    expect(ready("us").review).toBe(
      "2 rows need review and aren't in these totals.",
    );
  });

  it("says when no rows need review", () => {
    const screen = ready("us", data({ ledger: [usRow()] }));

    expect(screen.review).toBe("No rows need review.");
  });

  it("says a single row needs review", () => {
    const screen = ready(
      "us",
      data({ ledger: [usRow({ type: null, category: null })] }),
    );

    expect(screen.review).toBe("1 row needs review and isn't in these totals.");
  });

  it("uses base amounts in Combined and own amounts in Germany", () => {
    const german = usRow({
      id: "de",
      country: "DE",
      type: "income",
      category: null,
      amount: money(100000, "EUR"),
      base: money(108000),
    });
    const input = data({ ledger: [german], trendLedger: [german] });

    expect(ready("germany", input).income).toBe("€1,000.00");
    expect(ready("combined", input).income).toBe("$1,080.00");
  });

  it("gives the scope of each view", () => {
    expect(ready("us").subtitle).toBe("Amounts are in USD.");
    expect(ready("germany", data({ ledger: [], trendLedger: [] })).subtitle).toBe(
      "Amounts are in EUR.",
    );
    expect(ready("combined").subtitle).toBe(
      "Amounts are in USD. Budgets use the Oct 1 rate, and spending uses each row's saved rate.",
    );
  });

  it("charts 12 months of income and spending, ending at the current month", () => {
    const { trend } = ready("us");

    expect(trend.columns).toHaveLength(12);
    expect(trend.columns[0].name).toBe("November 2025");
    expect(trend.columns[11].name).toBe("October 2026");
    expect(trend.columns[11].readouts).toEqual([
      expect.objectContaining({ label: "Income", value: "$5,000.00" }),
      expect.objectContaining({ label: "Spending", value: "$450.00" }),
    ]);
  });

  it("ends the trend at the current month even for a past selected month", () => {
    const screen = build("us", data(), "2026-03");

    expect(
      screen.status === "ready" && screen.trend.columns[11].name,
    ).toBe("October 2026");
  });

  it("explains itself when nothing is imported yet", () => {
    expect(
      build("us", data({ hasTransactions: false, ledger: [], trendLedger: [] })),
    ).toEqual({
      status: "empty",
      subtitle: "Amounts are in USD.",
      title: "No Statements Imported Yet",
      text: "Spending, income and the 12-month trend appear after the first import.",
    });
  });

  it("says Combined has no rate, showing no converted figures", () => {
    expect(build("combined", data({ rates: {} }))).toEqual({
      status: "no-rate",
      subtitle: "Amounts are in USD.",
      message:
        "Combined figures need a saved EUR rate for October 2026. Rates are saved during import, so import a statement, then try again.",
    });
  });

  it("puts the no-rate message ahead of the empty state in Combined", () => {
    const screen = build(
      "combined",
      data({ rates: {}, hasTransactions: false, ledger: [], trendLedger: [] }),
    );

    expect(screen.status).toBe("no-rate");
  });
});
