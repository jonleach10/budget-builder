import { describe, expect, it } from "vitest";
import { countsAgainstBudget } from "./transactionType";

describe("countsAgainstBudget", () => {
  it("counts spending against the budget", () => {
    expect(countsAgainstBudget("spending")).toBe(true);
  });

  it.each(["income", "transfer", "saved", "personal"] as const)(
    "leaves %s out of the budget",
    (type) => {
      expect(countsAgainstBudget(type)).toBe(false);
    },
  );
});
