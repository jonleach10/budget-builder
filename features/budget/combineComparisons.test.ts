import { describe, expect, it } from "vitest";
import { MoneyError, type Money } from "@/lib/money";
import {
  combineComparisons,
  type ConvertToUsd,
} from "./combineComparisons";
import type { BudgetComparison, CategoryComparison } from "./compareBudget";
import { BudgetError } from "./errors";

const NO_SPENT = new Map<string, number>();

function catchBudgetError(run: () => unknown): BudgetError {
  try {
    run();
  } catch (error) {
    if (error instanceof BudgetError) return error;
    throw error;
  }
  throw new Error("Expected a BudgetError, but nothing was thrown.");
}

function comparison(
  currency: string,
  categories: CategoryComparison[],
  needsReview = 0,
): BudgetComparison {
  return { month: "2026-03", currency, categories, needsReview };
}

/** Looks up worked results, so no test repeats the rounding it relies on. */
function convertWith(usdByEuroMinor: Record<number, number>): ConvertToUsd {
  return (amount: Money) => {
    const minor = usdByEuroMinor[amount.minor];
    if (amount.currency !== "EUR" || minor === undefined) {
      throw new Error(`Unexpected conversion of ${amount.minor} ${amount.currency}`);
    }
    return { minor, currency: "USD" };
  };
}

describe("combineComparisons", () => {
  it("adds both countries into one USD result per category", () => {
    const us = comparison("USD", [
      { category: "Groceries", budgeted: 45000, spent: 4000, remaining: 41000 },
    ]);
    const germany = comparison("EUR", [
      { category: "Groceries", budgeted: 30000, spent: 4500, remaining: 25500 },
    ]);
    const convert = convertWith({ 30000: 32500 });
    const spentUsd = new Map([["Groceries", 4875]]);

    expect(combineComparisons(us, germany, convert, spentUsd)).toEqual({
      month: "2026-03",
      currency: "USD",
      categories: [
        {
          category: "Groceries",
          budgeted: 77500,
          spent: 8875,
          remaining: 68625,
        },
      ],
      needsReview: 0,
    });
  });

  it("never converts Germany's spent, which is already in USD", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", [
      { category: "Dining", budgeted: 1000, spent: 400, remaining: 600 },
    ]);
    const onlyConvertsTheBudget = convertWith({ 1000: 1080 });
    const spentUsd = new Map([["Dining", 437]]);

    expect(
      combineComparisons(us, germany, onlyConvertsTheBudget, spentUsd)
        .categories,
    ).toEqual([
      { category: "Dining", budgeted: 1080, spent: 437, remaining: 643 },
    ]);
  });

  it("keeps remaining equal to budgeted less spent when rounding would break it", () => {
    // At 1.0837 USD per EUR: 100 becomes 108 and 67 becomes 73.
    // Converting remaining would give 73, but 108 less 36 is 72.
    const us = comparison("USD", []);
    const germany = comparison("EUR", [
      { category: "Dining", budgeted: 100, spent: 33, remaining: 67 },
    ]);
    const convert = convertWith({ 100: 108, 67: 73 });
    const spentUsd = new Map([["Dining", 36]]);

    expect(combineComparisons(us, germany, convert, spentUsd).categories).toEqual(
      [{ category: "Dining", budgeted: 108, spent: 36, remaining: 72 }],
    );
  });

  it("keeps a negative spent from a Germany refund", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", [
      { category: "Travel", budgeted: 10000, spent: -2000, remaining: 12000 },
    ]);
    const convert = convertWith({ 10000: 10800 });
    const spentUsd = new Map([["Travel", -2160]]);

    expect(combineComparisons(us, germany, convert, spentUsd).categories).toEqual(
      [{ category: "Travel", budgeted: 10800, spent: -2160, remaining: 12960 }],
    );
  });

  it("shows a category in the spent values with no Germany row", () => {
    const us = comparison("USD", [
      { category: "Housing", budgeted: 5000, spent: 1000, remaining: 4000 },
    ]);
    const germany = comparison("EUR", []);
    const spentUsd = new Map([
      ["Housing", 200],
      ["Fees", 750],
    ]);

    expect(
      combineComparisons(us, germany, convertWith({}), spentUsd).categories,
    ).toEqual([
      { category: "Housing", budgeted: 5000, spent: 1200, remaining: 3800 },
      { category: "Fees", budgeted: 0, spent: 750, remaining: -750 },
    ]);
  });

  it("counts nothing spent for a Germany row with no spent value", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", [
      { category: "Fees", budgeted: 1000, spent: 0, remaining: 1000 },
    ]);
    const convert = convertWith({ 1000: 1080 });

    expect(combineComparisons(us, germany, convert, NO_SPENT).categories).toEqual(
      [{ category: "Fees", budgeted: 1080, spent: 0, remaining: 1080 }],
    );
  });

  it("refuses a spent value that isn't whole minor units", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", []);
    const spentUsd = new Map([["Fees", 10.5]]);

    expect(() =>
      combineComparisons(us, germany, convertWith({}), spentUsd),
    ).toThrow(MoneyError);
  });

  it("keeps categories found in only one country and never converts USD", () => {
    const us = comparison("USD", [
      { category: "Housing", budgeted: 200000, spent: 150000, remaining: 50000 },
    ]);
    const germany = comparison("EUR", [
      { category: "Transport", budgeted: 8000, spent: 2000, remaining: 6000 },
    ]);
    const convert = convertWith({ 8000: 8640 });
    const spentUsd = new Map([["Transport", 2160]]);

    expect(combineComparisons(us, germany, convert, spentUsd).categories).toEqual(
      [
        {
          category: "Housing",
          budgeted: 200000,
          spent: 150000,
          remaining: 50000,
        },
        { category: "Transport", budgeted: 8640, spent: 2160, remaining: 6480 },
      ],
    );
  });

  it("adds up the entries needing review in both countries", () => {
    const us = comparison("USD", [], 2);
    const germany = comparison("EUR", [], 3);

    expect(combineComparisons(us, germany, convertWith({}), NO_SPENT).needsReview).toBe(5);
  });

  it("refuses comparisons passed the wrong way round", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", []);

    const failure = catchBudgetError(() =>
      combineComparisons(germany, us, convertWith({}), NO_SPENT),
    );

    expect(failure.code).toBe("comparison-mismatch");
  });

  it("refuses comparisons from different months", () => {
    const us = comparison("USD", []);
    const germany = { ...comparison("EUR", []), month: "2026-04" };

    const failure = catchBudgetError(() =>
      combineComparisons(us, germany, convertWith({}), NO_SPENT),
    );

    expect(failure.code).toBe("comparison-mismatch");
  });

  it("refuses a conversion that doesn't return USD", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", [
      { category: "Fees", budgeted: 1000, spent: 0, remaining: 1000 },
    ]);
    const stayInEuro: ConvertToUsd = (amount) => amount;

    const failure = catchBudgetError(() =>
      combineComparisons(us, germany, stayInEuro, NO_SPENT),
    );

    expect(failure.code).toBe("conversion-currency-mismatch");
    expect(failure.message).not.toMatch(/1000|Fees|EUR/);
  });

  it("refuses a conversion that returns part of a minor unit", () => {
    const us = comparison("USD", []);
    const germany = comparison("EUR", [
      { category: "Fees", budgeted: 1000, spent: 0, remaining: 1000 },
    ]);
    const unrounded: ConvertToUsd = (amount) => ({
      minor: amount.minor * 1.0837,
      currency: "USD",
    });

    expect(() => combineComparisons(us, germany, unrounded, NO_SPENT)).toThrow(MoneyError);
  });
});
