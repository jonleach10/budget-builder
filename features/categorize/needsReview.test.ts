import { describe, expect, it } from "vitest";
import { hasNoCategory, needsReview } from "./needsReview";
import type { TransactionType } from "./transactionType";

function facts(
  type: TransactionType | null,
  category: string | null,
  hidden = false,
) {
  return { type, category, hidden };
}

describe("needsReview", () => {
  it("is true for a row with no type", () => {
    expect(needsReview(facts(null, null))).toBe(true);
  });

  it("is true for spending with no category", () => {
    expect(needsReview(facts("spending", null))).toBe(true);
  });

  it("is true for spending with a blank category", () => {
    expect(needsReview(facts("spending", "   "))).toBe(true);
  });

  it("is false for spending with a category", () => {
    expect(needsReview(facts("spending", "Groceries"))).toBe(false);
  });

  it.each(["income", "transfer", "saved", "personal"] as const)(
    "is false for %s with no category",
    (type) => {
      expect(needsReview(facts(type, null))).toBe(false);
    },
  );

  it("is false for a hidden row, whatever it's missing", () => {
    expect(needsReview(facts(null, null, true))).toBe(false);
    expect(needsReview(facts("spending", null, true))).toBe(false);
  });
});

describe("hasNoCategory", () => {
  it.each([null, undefined, "", " ", "\t"])("is true for %j", (category) => {
    expect(hasNoCategory(category)).toBe(true);
  });

  it("is false for a named category", () => {
    expect(hasNoCategory("Groceries")).toBe(false);
  });
});
