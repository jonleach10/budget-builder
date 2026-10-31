import { describe, expect, it } from "vitest";
import { copyBudget, createBudget, DEFAULT_CATEGORIES } from "./budget";
import { BudgetError } from "./errors";

describe("DEFAULT_CATEGORIES", () => {
  it("lists the sixteen categories both countries share", () => {
    expect(DEFAULT_CATEGORIES).toEqual([
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
    ]);
  });
});

describe("createBudget", () => {
  it("holds a month, a country and whole minor units per category", () => {
    const budget = createBudget("2026-03", "US", { Groceries: 45000 });

    expect(budget).toEqual({
      month: "2026-03",
      country: "US",
      amounts: { Groceries: 45000 },
    });
  });

  it.each(["2026", "2026-3", "2026-00", "2026-13", "2026-03-01", "03-2026", ""])(
    "refuses the month %j",
    (month) => {
      expect(() => createBudget(month, "US", {})).toThrow(BudgetError);
    },
  );

  it.each([12.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses the amount %s, which isn't whole minor units held exactly",
    (amount) => {
      expect(() =>
        createBudget("2026-03", "DE", { Groceries: amount }),
      ).toThrow(BudgetError);
    },
  );
});

describe("copyBudget", () => {
  it("gives a new month with the same country and amounts", () => {
    const march = createBudget("2026-03", "DE", {
      Groceries: 30000,
      Transport: 8000,
    });

    expect(copyBudget(march, "2026-04")).toEqual({
      month: "2026-04",
      country: "DE",
      amounts: { Groceries: 30000, Transport: 8000 },
    });
  });

  it("leaves the original budget unchanged", () => {
    const march = createBudget("2026-03", "US", { Dining: 12000 });

    copyBudget(march, "2026-04");

    expect(march).toEqual({
      month: "2026-03",
      country: "US",
      amounts: { Dining: 12000 },
    });
  });

  it("gives a copy whose amounts can change without touching the original", () => {
    const march = createBudget("2026-03", "US", { Dining: 12000 });

    const april = copyBudget(march, "2026-04");
    (april.amounts as Record<string, number>).Dining = 5000;

    expect(march.amounts.Dining).toBe(12000);
  });

  it("refuses a target month that isn't YYYY-MM", () => {
    const march = createBudget("2026-03", "US", { Dining: 12000 });

    expect(() => copyBudget(march, "April")).toThrow(BudgetError);
  });
});
