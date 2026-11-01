import { describe, expect, it } from "vitest";
import { checkAmount } from "./amountInput";

describe("checkAmount", () => {
  it.each([
    ["450.00", 45000],
    ["450", 45000],
    ["1,234.56", 123456],
    [" 12.50 ", 1250],
    ["0", 0],
    ["0.07", 7],
  ])("reads %j as whole minor units", (text, minor) => {
    expect(checkAmount(text, "USD")).toEqual({ ok: true, minor });
  });

  it("reads EUR amounts the way they're shown, as in 1,234.00", () => {
    expect(checkAmount("1,234.00", "EUR")).toEqual({ ok: true, minor: 123400 });
  });

  it("avoids the float rounding that 1.15 hits", () => {
    expect(checkAmount("1.15", "USD")).toEqual({ ok: true, minor: 115 });
  });

  it.each(["", "   "])("reads the blank amount %j as no amount", (text) => {
    expect(checkAmount(text, "USD")).toEqual({ ok: true, minor: null });
  });

  it.each(["-1", "-450.00", "-0.00"])("refuses the negative amount %j", (text) => {
    expect(checkAmount(text, "USD")).toEqual({
      ok: false,
      message: "Enter an amount of 0.00 or more.",
    });
  });

  it.each(["abc", "12.345", "12,50", "1.234,56", "$450", "90071992547409.93"])(
    "refuses the amount %j",
    (text) => {
      expect(checkAmount(text, "USD")).toEqual({
        ok: false,
        message: "Enter an amount such as 450.00.",
      });
    },
  );

  it("keeps the typed text out of the message", () => {
    const result = checkAmount("SECRET", "USD");

    expect(result.ok === false && result.message).not.toContain("SECRET");
  });
});
