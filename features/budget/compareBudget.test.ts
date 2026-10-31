import { describe, expect, it } from "vitest";
import { MoneyError } from "@/lib/money";
import { copyBudget, createBudget } from "./budget";
import { compareBudget, type BudgetEntry } from "./compareBudget";
import { BudgetError } from "./errors";

function usd(minor: number): BudgetEntry["amount"] {
  return { minor, currency: "USD" };
}

function catchBudgetError(run: () => unknown): BudgetError {
  try {
    run();
  } catch (error) {
    if (error instanceof BudgetError) return error;
    throw error;
  }
  throw new Error("Expected a BudgetError, but nothing was thrown.");
}

describe("compareBudget", () => {
  it("shows budgeted, spent and remaining for a category", () => {
    const budget = createBudget("2026-03", "US", { Groceries: 45000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-04", category: "Groceries", amount: usd(-1250) },
      { postedOn: "2026-03-18", category: "Groceries", amount: usd(-2750) },
    ];

    expect(compareBudget(budget, entries)).toEqual({
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
    });
  });

  it("counts entries by the calendar month of postedOn and ignores others", () => {
    const budget = createBudget("2026-03", "US", { Dining: 20000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-02-28", category: "Dining", amount: usd(-100) },
      { postedOn: "2026-03-01", category: "Dining", amount: usd(-2000) },
      { postedOn: "2026-03-31", category: "Dining", amount: usd(-3000) },
      { postedOn: "2026-04-01", category: "Dining", amount: usd(-400) },
      { postedOn: "2025-03-15", category: "Dining", amount: usd(-500) },
    ];

    expect(compareBudget(budget, entries).categories).toEqual([
      { category: "Dining", budgeted: 20000, spent: 5000, remaining: 15000 },
    ]);
  });

  it("lowers spent for a refund, so spent can go negative", () => {
    const budget = createBudget("2026-03", "US", { Travel: 10000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-09", category: "Travel", amount: usd(-1000) },
      { postedOn: "2026-03-20", category: "Travel", amount: usd(3500) },
    ];

    expect(compareBudget(budget, entries).categories).toEqual([
      { category: "Travel", budgeted: 10000, spent: -2500, remaining: 12500 },
    ]);
  });

  it("counts a refund in the month it posts, not the month of the purchase", () => {
    const budget = createBudget("2026-04", "US", { Shopping: 9000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-30", category: "Shopping", amount: usd(-6000) },
      { postedOn: "2026-04-02", category: "Shopping", amount: usd(6000) },
    ];

    expect(compareBudget(budget, entries).categories).toEqual([
      { category: "Shopping", budgeted: 9000, spent: -6000, remaining: 15000 },
    ]);
  });

  it("shows spent as plain zero when a purchase and a refund cancel out", () => {
    const budget = createBudget("2026-03", "US", { Shopping: 0 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-02", category: "Shopping", amount: usd(-700) },
      { postedOn: "2026-03-03", category: "Shopping", amount: usd(700) },
    ];

    expect(compareBudget(budget, entries).categories).toEqual([
      { category: "Shopping", budgeted: 0, spent: 0, remaining: 0 },
    ]);
  });

  it("keeps entries with no category out of the totals and counts them for review", () => {
    const budget = createBudget("2026-03", "US", { Groceries: 45000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-04", category: "Groceries", amount: usd(-1000) },
      { postedOn: "2026-03-05", category: null, amount: usd(-2000) },
      { postedOn: "2026-03-06", amount: usd(-3000) },
      { postedOn: "2026-03-07", category: "", amount: usd(400) },
      { postedOn: "2026-02-20", category: null, amount: usd(-5000) },
    ];

    expect(compareBudget(budget, entries)).toEqual({
      month: "2026-03",
      currency: "USD",
      categories: [
        {
          category: "Groceries",
          budgeted: 45000,
          spent: 1000,
          remaining: 44000,
        },
      ],
      needsReview: 3,
    });
  });

  it("shows a category with entries but no budget amount, with budgeted 0", () => {
    const budget = createBudget("2026-03", "US", { Groceries: 45000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-11", category: "Health", amount: usd(-6500) },
    ];

    expect(compareBudget(budget, entries).categories).toEqual([
      { category: "Groceries", budgeted: 45000, spent: 0, remaining: 45000 },
      { category: "Health", budgeted: 0, spent: 6500, remaining: -6500 },
    ]);
  });

  it("treats a category named like an Object property as a plain category", () => {
    const budget = createBudget("2026-03", "US", {});
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-11", category: "constructor", amount: usd(-100) },
    ];

    expect(compareBudget(budget, entries).categories).toEqual([
      { category: "constructor", budgeted: 0, spent: 100, remaining: -100 },
    ]);
  });

  it("compares a Germany budget in EUR", () => {
    const budget = createBudget("2026-03", "DE", { Groceries: 30000 });
    const entries: BudgetEntry[] = [
      {
        postedOn: "2026-03-12",
        category: "Groceries",
        amount: { minor: -4500, currency: "EUR" },
      },
    ];

    expect(compareBudget(budget, entries)).toEqual({
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
    });
  });

  it("throws on an entry in the wrong currency, with no entry data in the message", () => {
    const budget = createBudget("2026-03", "US", { Dining: 20000 });
    const entries: BudgetEntry[] = [
      {
        postedOn: "2026-03-14",
        category: "Dining",
        amount: { minor: -4321, currency: "EUR" },
      },
    ];

    const failure = catchBudgetError(() => compareBudget(budget, entries));

    expect(failure.code).toBe("entry-currency-mismatch");
    expect(failure.message).not.toMatch(/4321|43\.21|2026-03-14|Dining|EUR/);
  });

  it("throws on a wrong-currency entry with no category", () => {
    const budget = createBudget("2026-03", "DE", { Dining: 20000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-14", category: null, amount: usd(-100) },
    ];

    expect(() => compareBudget(budget, entries)).toThrow(BudgetError);
  });

  it("throws on a wrong-currency entry from another month", () => {
    const budget = createBudget("2026-03", "DE", { Dining: 20000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-02-14", category: "Dining", amount: usd(-100) },
    ];

    expect(() => compareBudget(budget, entries)).toThrow(BudgetError);
  });

  it.each(["03/15/2026", "15.03.2026", "2026-13-01", "2026-03-32", "2026-03", ""])(
    "throws on the postedOn %j rather than dropping the entry as another month",
    (postedOn) => {
      const budget = createBudget("2026-03", "US", { Dining: 20000 });
      const entries: BudgetEntry[] = [
        { postedOn, category: "Dining", amount: usd(-100) },
      ];

      const failure = catchBudgetError(() => compareBudget(budget, entries));

      expect(failure.code).toBe("invalid-date");
      if (postedOn) expect(failure.message).not.toContain(postedOn);
    },
  );

  it("doesn't roll unspent money into a copied month", () => {
    const march = createBudget("2026-03", "US", { Leisure: 10000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-14", category: "Leisure", amount: usd(-2500) },
    ];

    const april = copyBudget(march, "2026-04");

    expect(compareBudget(april, entries).categories).toEqual([
      { category: "Leisure", budgeted: 10000, spent: 0, remaining: 10000 },
    ]);
  });

  it("refuses an entry amount that isn't whole minor units", () => {
    const budget = createBudget("2026-03", "US", { Dining: 20000 });
    const entries: BudgetEntry[] = [
      { postedOn: "2026-03-14", category: "Dining", amount: usd(-10.5) },
    ];

    expect(() => compareBudget(budget, entries)).toThrow(MoneyError);
  });

  it("refuses a total too large to hold exactly", () => {
    const budget = createBudget("2026-03", "US", { Dining: 20000 });
    const entries: BudgetEntry[] = [
      {
        postedOn: "2026-03-14",
        category: "Dining",
        amount: usd(-Number.MAX_SAFE_INTEGER),
      },
      { postedOn: "2026-03-15", category: "Dining", amount: usd(-1) },
    ];

    expect(() => compareBudget(budget, entries)).toThrow(MoneyError);
  });
});
