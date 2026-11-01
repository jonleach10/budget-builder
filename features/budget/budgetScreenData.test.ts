import { describe, expect, it } from "vitest";
import { buildBudgetScreen, type ReadyBudgetScreen } from "./budgetScreenData";
import type { BudgetAmountRow, CategoryRow, LedgerRow } from "./rows";
import type { BudgetView, ScreenParams } from "./screenParams";
import type { ViewData } from "./viewFigures";

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

function amount(
  month: string,
  country: "US" | "DE",
  amount_minor: number,
  category_id = "cat-groceries",
): BudgetAmountRow {
  return { month, country, category_id, amount_minor };
}

function ledgerRow(extra: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "t1",
    postedOn: "2026-10-03",
    country: "US",
    account: "Card A",
    description: "SAMPLE GROCER",
    amount: { minor: -4000, currency: "USD" },
    base: { minor: -4000, currency: "USD" },
    type: "spending",
    category: "Groceries",
    ...extra,
  };
}

function germanRow(extra: Partial<LedgerRow> = {}): LedgerRow {
  return ledgerRow({
    id: "de1",
    postedOn: "2026-10-05",
    country: "DE",
    account: "Joint Checking DE",
    description: "SAMPLE MARKT",
    amount: { minor: -4500, currency: "EUR" },
    base: { minor: -5000, currency: "USD" },
    ...extra,
  });
}

function data(extra: Partial<ViewData> = {}): ViewData {
  return {
    categories: CATEGORIES,
    amounts: [amount("2026-10", "US", 45000), amount("2026-10", "DE", 30000)],
    ledger: [ledgerRow(), germanRow()],
    rates: { "2026-10-01": "1.08" },
    ...extra,
  };
}

function params(view: BudgetView, month = "2026-10"): ScreenParams {
  return { month, view };
}

function ready(view: BudgetView, input = data()): ReadyBudgetScreen {
  const screen = buildBudgetScreen(params(view), input);
  if (screen.status !== "ready") throw new Error("Expected a ready screen.");
  return screen;
}

describe("buildBudgetScreen", () => {
  it("shows every category in stored order, even with no amount", () => {
    expect(ready("us").lines.map(({ name }) => name)).toEqual([
      "Groceries",
      "Dining",
    ]);
  });

  it("formats a line for the view's currency", () => {
    expect(ready("germany").lines[0]).toMatchObject({
      categoryId: "cat-groceries",
      amountInput: "300.00",
      budgeted: "€300.00",
      spent: "€45.00",
      remaining: "€255.00",
      over: false,
      used: { percent: 15, label: "15% used" },
    });
  });

  it("leaves the amount blank for a category with no saved amount", () => {
    expect(ready("us").lines[1]).toMatchObject({
      amountInput: "",
      budgeted: "$0.00",
      spent: "$0.00",
    });
  });

  it("marks a negative remaining, keeping the sign", () => {
    const screen = ready(
      "us",
      data({ amounts: [amount("2026-10", "US", 1000)] }),
    );

    expect(screen.lines[0]).toMatchObject({
      remaining: "-$30.00",
      over: true,
      used: { percent: 100, label: "400% used" },
    });
  });

  it("adds up the totals", () => {
    expect(ready("us").totals).toEqual({
      budgeted: "$450.00",
      spent: "$40.00",
      remaining: "$410.00",
      over: false,
    });
  });

  it("shows the needs-review count", () => {
    const screen = ready(
      "us",
      data({
        ledger: [
          ledgerRow({ id: "a", type: null, category: null }),
          ledgerRow({ id: "b", category: null }),
        ],
      }),
    );

    expect(screen.review).toBe(
      "2 rows need review and aren't in these totals.",
    );
  });

  it("makes Combined read-only and notes the rate", () => {
    const screen = ready("combined");

    expect(screen.country).toBeNull();
    expect(screen.subtitle).toBe(
      "Amounts are in USD. Edit amounts in the US and Germany views. Budgets use the Oct 1 rate of 1.08, and spending uses each row's saved rate.",
    );
  });

  it("gives the US and Germany views a country to edit", () => {
    expect(ready("us").country).toBe("US");
    expect(ready("germany").country).toBe("DE");
    expect(ready("germany").subtitle).toBe(
      "Amounts are in EUR. Changes apply to October 2026 only.",
    );
  });

  it("says so in Combined with no saved rate, and shows no figures", () => {
    const screen = buildBudgetScreen(params("combined"), data({ rates: {} }));

    expect(screen).toEqual({
      status: "no-rate",
      subtitle: "Amounts are in USD.",
      message:
        "Combined figures need a saved EUR rate for October 2026. Rates are saved during import, so import a statement, then try again.",
    });
  });
});

describe("a category's transactions", () => {
  it("lists the view's rows for the category, newest first", () => {
    const screen = ready(
      "us",
      data({
        ledger: [
          ledgerRow({ id: "old", postedOn: "2026-10-03" }),
          ledgerRow({ id: "new", postedOn: "2026-10-24" }),
          ledgerRow({ id: "other", category: "Dining" }),
          germanRow(),
        ],
      }),
    );

    expect(screen.lines[0].transactions).toEqual([
      {
        id: "new",
        date: "Oct 24",
        description: "SAMPLE GROCER",
        account: "Card A",
        amount: "-$40.00",
        original: null,
      },
      {
        id: "old",
        date: "Oct 3",
        description: "SAMPLE GROCER",
        account: "Card A",
        amount: "-$40.00",
        original: null,
      },
    ]);
  });

  it("shows a refund as money in", () => {
    const screen = ready(
      "us",
      data({
        ledger: [
          ledgerRow({
            amount: { minor: 1500, currency: "USD" },
            base: { minor: 1500, currency: "USD" },
          }),
        ],
      }),
    );

    expect(screen.lines[0].transactions[0].amount).toBe("$15.00");
  });

  it("shows a Germany row in EUR in the Germany view", () => {
    expect(ready("germany").lines[0].transactions).toEqual([
      expect.objectContaining({ amount: "-€45.00", original: null }),
    ]);
  });

  it("shows a Germany row's USD base with its EUR amount under it in Combined", () => {
    expect(ready("combined").lines[0].transactions).toEqual([
      expect.objectContaining({
        id: "de1",
        amount: "-$50.00",
        original: "-€45.00",
      }),
      expect.objectContaining({ id: "t1", amount: "-$40.00", original: null }),
    ]);
  });

  it("gives an empty category no rows and the month for its message", () => {
    const screen = ready("us");

    expect(screen.lines[1].transactions).toEqual([]);
    expect(screen.noTransactions).toBe(
      "No transactions in this category for October 2026.",
    );
  });

  it("leaves rows with no type out of the category", () => {
    const screen = ready(
      "us",
      data({ ledger: [ledgerRow({ type: null, category: "Groceries" })] }),
    );

    expect(screen.lines[0].transactions).toEqual([]);
  });
});

describe("a month with no amounts", () => {
  it("does nothing special when the month has amounts", () => {
    expect(ready("us").setup).toEqual({ kind: "has-amounts" });
  });

  it("offers the nearest earlier month for that country", () => {
    const amounts = [
      amount("2026-02", "US", 1000),
      amount("2026-09", "US", 2000),
      amount("2026-10", "DE", 3000),
    ];

    expect(ready("us", data({ amounts })).setup).toEqual({
      kind: "copy",
      from: "2026-09",
      fromLabel: "September 2026",
      title: "No Budget for October 2026",
      text: "Copy the amounts from September 2026, then edit any that change.",
    });
  });

  it("offers a later month, so a past month can be backfilled", () => {
    const amounts = [amount("2026-12", "US", 1000)];

    const setup = ready("us", data({ amounts })).setup;

    expect(setup).toMatchObject({ kind: "copy", from: "2026-12" });
  });

  it("gives a tie to the earlier month", () => {
    const amounts = [
      amount("2026-08", "US", 1000),
      amount("2026-12", "US", 1000),
    ];

    const setup = ready("us", data({ amounts })).setup;

    expect(setup).toMatchObject({ kind: "copy", from: "2026-08" });
  });

  it("starts blank only when the country has no amounts in any month", () => {
    const amounts = [amount("2026-05", "DE", 3000)];

    expect(ready("us", data({ amounts })).setup).toEqual({
      kind: "first",
      title: "Set the October 2026 Budget",
      text: "Amounts are in USD. Leave a category blank to budget nothing for it.",
    });
  });

  it("never offers a copy in Combined", () => {
    const screen = ready("combined", data({ amounts: [] }));

    expect(screen.setup).toEqual({ kind: "has-amounts" });
  });
});
