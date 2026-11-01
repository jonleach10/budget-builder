import { describe, expect, it } from "vitest";
import { BudgetError } from "./errors";
import type {
  BudgetAmountRow,
  CategoryRow,
  LedgerRow,
} from "./rows";
import {
  compareView,
  monthFlows,
  trendPoints,
  usedPercent,
  type ViewData,
} from "./viewFigures";

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-fees", name: "Fees", position: 1 },
];

function usRow(extra: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "us1",
    postedOn: "2026-03-04",
    country: "US",
    account: "Joint Checking",
    description: "SAMPLE GROCER",
    amount: { minor: -4000, currency: "USD" },
    base: { minor: -4000, currency: "USD" },
    type: "spending",
    category: "Groceries",
    ...extra,
  };
}

function germanRow(extra: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "de1",
    postedOn: "2026-03-12",
    country: "DE",
    account: "Joint Checking DE",
    description: "SAMPLE MARKT",
    amount: { minor: -4500, currency: "EUR" },
    base: { minor: -5000, currency: "USD" },
    type: "spending",
    category: "Groceries",
    ...extra,
  };
}

const AMOUNTS: BudgetAmountRow[] = [
  {
    month: "2026-03",
    country: "US",
    category_id: "cat-groceries",
    amount_minor: 45000,
  },
  {
    month: "2026-03",
    country: "DE",
    category_id: "cat-groceries",
    amount_minor: 30000,
  },
];

function viewData(extra: Partial<ViewData> = {}): ViewData {
  return {
    categories: CATEGORIES,
    amounts: AMOUNTS,
    ledger: [usRow(), germanRow()],
    rates: { "2026-03-01": "1.08" },
    ...extra,
  };
}

describe("compareView", () => {
  it("compares the US view in USD, with the row's own amounts", () => {
    expect(compareView("us", "2026-03", viewData())).toEqual({
      status: "ready",
      rate: null,
      comparison: {
        month: "2026-03",
        currency: "USD",
        categories: [
          {
            category: "Groceries",
            budgeted: 45000,
            spent: 4000,
            remaining: 41000,
          },
        ],
        needsReview: 0,
      },
    });
  });

  it("compares the Germany view in EUR, with the row's own amounts", () => {
    expect(compareView("germany", "2026-03", viewData())).toEqual({
      status: "ready",
      rate: null,
      comparison: {
        month: "2026-03",
        currency: "EUR",
        categories: [
          {
            category: "Groceries",
            budgeted: 30000,
            spent: 4500,
            remaining: 25500,
          },
        ],
        needsReview: 0,
      },
    });
  });

  it("works in the US and Germany views with no saved rate", () => {
    const data = viewData({ rates: {} });

    expect(compareView("us", "2026-03", data).status).toBe("ready");
    expect(compareView("germany", "2026-03", data).status).toBe("ready");
  });

  it("converts Germany's budget at the first-of-month rate and takes its spent from the base amount", () => {
    // 30000 EUR minor at 1.08 is 32400 USD minor. The rate for spent is the
    // row's own: 4500 EUR minor at 1.08 would be 4860, but the row stored 5000.
    expect(compareView("combined", "2026-03", viewData())).toEqual({
      status: "ready",
      rate: "1.08",
      comparison: {
        month: "2026-03",
        currency: "USD",
        categories: [
          {
            category: "Groceries",
            budgeted: 77400,
            spent: 9000,
            remaining: 68400,
          },
        ],
        needsReview: 0,
      },
    });
  });

  it("shows a Germany category with spending and no Germany budget in Combined", () => {
    const data = viewData({
      ledger: [germanRow({ category: "Fees" })],
      amounts: AMOUNTS.filter(({ country }) => country === "US"),
    });

    const view = compareView("combined", "2026-03", data);

    expect(view.status === "ready" && view.comparison.categories).toEqual([
      { category: "Groceries", budgeted: 45000, spent: 0, remaining: 45000 },
      { category: "Fees", budgeted: 0, spent: 5000, remaining: -5000 },
    ]);
  });

  it("adds both countries' rows needing review in Combined", () => {
    const data = viewData({
      ledger: [
        usRow({ type: null, category: null }),
        germanRow({ type: "spending", category: null }),
      ],
    });

    const view = compareView("combined", "2026-03", data);

    expect(view.status === "ready" && view.comparison.needsReview).toBe(2);
  });

  it("uses the latest earlier rate within a week of the first", () => {
    const data = viewData({ rates: { "2026-02-27": "1.25" } });

    const view = compareView("combined", "2026-03", data);

    expect(view.status === "ready" && view.rate).toBe("1.25");
  });

  it("says there's no rate, rather than guessing, when none is saved", () => {
    expect(compareView("combined", "2026-03", viewData({ rates: {} }))).toEqual(
      { status: "no-rate" },
    );
  });

  it("doesn't use a rate from later in the month", () => {
    const data = viewData({ rates: { "2026-03-02": "1.08" } });

    expect(compareView("combined", "2026-03", data)).toEqual({
      status: "no-rate",
    });
  });

  it("refuses a Germany row whose base amount isn't in USD", () => {
    const data = viewData({
      ledger: [germanRow({ base: { minor: -4500, currency: "EUR" } })],
    });

    expect(() => compareView("combined", "2026-03", data)).toThrow(BudgetError);
  });
});

describe("monthFlows", () => {
  const LEDGER: LedgerRow[] = [
    usRow({
      id: "pay",
      type: "income",
      category: null,
      amount: { minor: 500000, currency: "USD" },
      base: { minor: 500000, currency: "USD" },
    }),
    usRow({ id: "shop" }),
    usRow({
      id: "refund",
      amount: { minor: 1000, currency: "USD" },
      base: { minor: 1000, currency: "USD" },
    }),
    usRow({ id: "uncategorized", category: null }),
    usRow({
      id: "brokerage",
      type: "saved",
      category: null,
      amount: { minor: -100000, currency: "USD" },
      base: { minor: -100000, currency: "USD" },
    }),
    usRow({ id: "no-type", type: null, category: null }),
    usRow({ id: "transfer", type: "transfer", category: null }),
    usRow({ id: "personal", type: "personal", category: null }),
    germanRow({
      id: "gehalt",
      type: "income",
      category: null,
      amount: { minor: 200000, currency: "EUR" },
      base: { minor: 216000, currency: "USD" },
    }),
    germanRow({ id: "markt" }),
  ];

  it("adds up income, spending and saved for the US view", () => {
    // Spending is 4000 + 4000 uncategorized, less the 1000 refund.
    expect(monthFlows(LEDGER, "us", "2026-03")).toEqual({
      income: 500000,
      spending: 7000,
      saved: 100000,
    });
  });

  it("uses the row's own amounts for Germany", () => {
    expect(monthFlows(LEDGER, "germany", "2026-03")).toEqual({
      income: 200000,
      spending: 4500,
      saved: 0,
    });
  });

  it("uses base amounts for Combined", () => {
    expect(monthFlows(LEDGER, "combined", "2026-03")).toEqual({
      income: 716000,
      spending: 12000,
      saved: 100000,
    });
  });

  it("ignores other months", () => {
    const ledger = [usRow({ postedOn: "2026-04-01" })];

    expect(monthFlows(ledger, "us", "2026-03")).toEqual({
      income: 0,
      spending: 0,
      saved: 0,
    });
  });

  it("refuses a row in the wrong currency for the view", () => {
    const ledger = [
      usRow({ amount: { minor: -100, currency: "EUR" } }),
    ];

    expect(() => monthFlows(ledger, "us", "2026-03")).toThrow(BudgetError);
  });
});

describe("trendPoints", () => {
  it("gives 12 calendar months ending at the current month", () => {
    const points = trendPoints([], "us", "2026-10");

    expect(points).toHaveLength(12);
    expect(points[0].month).toBe("2025-11");
    expect(points[11].month).toBe("2026-10");
  });

  it("adds up spending and income per month", () => {
    const ledger = [
      usRow({ postedOn: "2026-10-02" }),
      usRow({ postedOn: "2026-10-20", category: null }),
      usRow({
        id: "pay",
        postedOn: "2026-09-30",
        type: "income",
        category: null,
        amount: { minor: 900000, currency: "USD" },
      }),
      usRow({ postedOn: "2026-09-02", type: null, category: null }),
    ];

    const points = trendPoints(ledger, "us", "2026-10");

    expect(points.slice(-2)).toEqual([
      { month: "2026-09", income: 900000, spending: 0 },
      { month: "2026-10", income: 0, spending: 8000 },
    ]);
  });

  it("uses base amounts for Combined and own amounts for Germany", () => {
    const ledger = [germanRow({ postedOn: "2026-10-02" })];

    expect(trendPoints(ledger, "combined", "2026-10")[11].spending).toBe(5000);
    expect(trendPoints(ledger, "germany", "2026-10")[11].spending).toBe(4500);
  });

  it("ignores rows outside the 12 months", () => {
    const ledger = [
      usRow({ postedOn: "2025-10-31" }),
      usRow({ postedOn: "2026-11-01" }),
    ];

    expect(
      trendPoints(ledger, "us", "2026-10").every(
        ({ spending }) => spending === 0,
      ),
    ).toBe(true);
  });
});

describe("usedPercent", () => {
  it.each([
    [7434, 7700, 97],
    [0, 7700, 0],
    [11200, 10000, 112],
    [-500, 10000, 0],
    [500, 0, 100],
    [0, 0, 0],
    [-500, 0, 0],
  ])("gives %i of %i as %i%%", (spent, budgeted, percent) => {
    expect(usedPercent(spent, budgeted)).toBe(percent);
  });
});
