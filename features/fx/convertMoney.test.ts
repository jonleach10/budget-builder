import { describe, expect, it } from "vitest";
import { MoneyError } from "@/lib/money";
import { convertMoney } from "./convertMoney";
import { FxError } from "./errors";

describe("convertMoney", () => {
  it("converts from a currency with no decimals", () => {
    expect(
      convertMoney({ minor: 10000, currency: "JPY" }, "0.0067", "USD"),
    ).toEqual({ minor: 6700, currency: "USD" });
  });

  it("converts from a currency with three decimals", () => {
    expect(
      convertMoney({ minor: 1000, currency: "KWD" }, "3.25", "USD"),
    ).toEqual({ minor: 325, currency: "USD" });
  });

  it("rounds half a minor unit up", () => {
    // 1 cent at 0.5 is 0.005 USD.
    expect(convertMoney({ minor: 1, currency: "EUR" }, "0.5", "USD").minor).toBe(
      1,
    );
  });

  it("rounds a negative half away from zero", () => {
    // -1 cent at 0.5 is -0.005 USD.
    expect(
      convertMoney({ minor: -1, currency: "EUR" }, "0.5", "USD").minor,
    ).toBe(-1);
  });

  it("rounds just under half towards zero", () => {
    expect(
      convertMoney({ minor: 1, currency: "EUR" }, "0.4999", "USD").minor,
    ).toBe(0);
    expect(
      convertMoney({ minor: -1, currency: "EUR" }, "0.4999", "USD").minor,
    ).toBe(0);
  });

  it("keeps a half that a float would lose", () => {
    // $1.00 at 1.005 is exactly $1.005, which a float reads as 1.00499...
    expect(convertMoney({ minor: 100, currency: "USD" }, "1.005", "EUR")).toEqual(
      { minor: 101, currency: "EUR" },
    );
  });

  it("keeps a rate digit that a float would drop", () => {
    // 5e15 * 1e-16 adds exactly 0.5. As a float this rate is exactly 1.
    expect(
      convertMoney(
        { minor: 5_000_000_000_000_000, currency: "USD" },
        "1.0000000000000001",
        "EUR",
      ).minor,
    ).toBe(5_000_000_000_000_001);
  });

  it("converts the largest value that a number holds exactly", () => {
    expect(
      convertMoney(
        { minor: Number.MAX_SAFE_INTEGER, currency: "EUR" },
        "1",
        "USD",
      ).minor,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("gives zero for a zero amount", () => {
    expect(convertMoney({ minor: 0, currency: "EUR" }, "1.1", "USD").minor).toBe(
      0,
    );
    expect(convertMoney({ minor: -0, currency: "EUR" }, "1.1", "USD").minor).toBe(
      0,
    );
  });

  it.each([
    [""],
    ["0"],
    ["0.00"],
    ["-1.1"],
    ["+1.1"],
    [".5"],
    ["5."],
    ["1e3"],
    ["1,1"],
    ["1.1.1"],
    [" 1.1"],
    ["1.1\n"],
    ["abc"],
    ["Infinity"],
    ["NaN"],
  ])("rejects the rate %j", (rate) => {
    expect(() =>
      convertMoney({ minor: 100, currency: "EUR" }, rate, "USD"),
    ).toThrow(FxError);
  });

  it("rejects a rate that arrives as a number", () => {
    const rate = 1.1 as unknown as string;
    expect(() =>
      convertMoney({ minor: 100, currency: "EUR" }, rate, "USD"),
    ).toThrow(FxError);
  });

  it("keeps a bad rate out of the error message", () => {
    expect.assertions(1);
    try {
      convertMoney({ minor: 4242, currency: "EUR" }, "SECRET-7373", "USD");
    } catch (error) {
      expect(String(error)).not.toMatch(/SECRET|7373|4242/);
    }
  });

  it("rejects a result too large to hold exactly", () => {
    expect(() =>
      convertMoney(
        { minor: Number.MAX_SAFE_INTEGER, currency: "EUR" },
        "2",
        "USD",
      ),
    ).toThrow(MoneyError);
    expect(() =>
      convertMoney(
        { minor: -Number.MAX_SAFE_INTEGER, currency: "EUR" },
        "2",
        "USD",
      ),
    ).toThrow(MoneyError);
  });

  it("keeps the input out of the too-large error message", () => {
    expect.assertions(2);
    try {
      convertMoney({ minor: 9000000000000000, currency: "EUR" }, "7373", "USD");
    } catch (error) {
      expect(error).toHaveProperty("reason", "out-of-range");
      expect(String(error)).not.toMatch(/9000000000000000|7373/);
    }
  });

  it.each([
    [1.5],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [Number.MAX_SAFE_INTEGER + 1],
  ])("rejects an amount of %d minor units", (minor) => {
    expect(() => convertMoney({ minor, currency: "EUR" }, "1.1", "USD")).toThrow(
      MoneyError,
    );
  });

  it("keeps a bad amount out of the error message", () => {
    expect.assertions(1);
    try {
      convertMoney({ minor: 4242.5, currency: "EUR" }, "1.1", "USD");
    } catch (error) {
      expect(String(error)).not.toMatch(/4242/);
    }
  });

  it.each([
    ["usd", "EUR"],
    ["USDX", "EUR"],
    ["", "EUR"],
    ["USD", "eur"],
    ["USD", "constructor"],
  ])("rejects the currencies %j to %j", (currency, target) => {
    expect.assertions(1);
    try {
      convertMoney({ minor: 100, currency }, "1.1", target);
    } catch (error) {
      expect(error).toHaveProperty("reason", "bad-currency");
    }
  });

  it("converts within one currency", () => {
    expect(convertMoney({ minor: 1234, currency: "EUR" }, "1", "EUR")).toEqual({
      minor: 1234,
      currency: "EUR",
    });
  });
});
