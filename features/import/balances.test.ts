import { describe, expect, it } from "vitest";
import { checkBalances } from "./balances";
import { StatementError } from "./errors";

function row(line: number, minor: number, balance?: number) {
  return {
    line,
    amount: { minor, currency: "USD" },
    balance:
      balance === undefined ? undefined : { minor: balance, currency: "USD" },
  };
}

function errorFrom(rows: ReturnType<typeof row>[]): StatementError {
  try {
    checkBalances(rows);
  } catch (error) {
    return error as StatementError;
  }
  throw new Error("Expected checkBalances to throw.");
}

describe("checkBalances", () => {
  it("accepts a chain that reconciles, newest first", () => {
    expect(() =>
      checkBalances([row(2, -100, 900), row(3, 500, 1000), row(4, 0, 500)]),
    ).not.toThrow();
  });

  it("accepts no rows and one row", () => {
    expect(() => checkBalances([])).not.toThrow();
    expect(() => checkBalances([row(2, -100, 900)])).not.toThrow();
  });

  it("names the line of a row that doesn't follow the row above it", () => {
    const error = errorFrom([
      row(2, -100, 900),
      row(3, 500, 999),
      row(4, 0, 500),
    ]);

    expect(error).toBeInstanceOf(StatementError);
    expect(error.code).toBe("balance-mismatch");
    expect(error.line).toBe(3);
    expect(error.message).toContain("Line 3");
  });

  it("refuses a chain that runs oldest first", () => {
    const error = errorFrom([row(2, 0, 500), row(3, 500, 1000), row(4, -100, 900)]);

    expect(error.code).toBe("balance-mismatch");
  });

  it.each([
    ["the upper row", [row(2, -100), row(3, 500, 1000)]],
    ["the lower row", [row(2, -100, 900), row(3, 500)]],
    ["both rows", [row(2, -100), row(3, 500)]],
  ])("skips a pair when %s has no balance", (_label, rows) => {
    expect(() => checkBalances(rows)).not.toThrow();
  });

  it("still checks the rows after a blank balance", () => {
    const error = errorFrom([
      row(2, -100, 900),
      row(3, 500),
      row(4, 0, 500),
      row(5, 0, 499),
    ]);

    expect(error.line).toBe(5);
  });

  it("puts no amounts in the error", () => {
    const { message } = errorFrom([row(2, -123456, 987654), row(3, 0, 111111)]);

    expect(message).not.toMatch(/123456|987654|111111/);
  });
});
