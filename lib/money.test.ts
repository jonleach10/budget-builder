import { describe, expect, it } from "vitest";
import {
  currencyExponent,
  isDecimalShaped,
  MoneyError,
  parseMoney,
  sumMinor,
} from "./money";

describe("currencyExponent", () => {
  it.each([
    ["JPY", 0],
    ["USD", 2],
    ["EUR", 2],
    ["KWD", 3],
    ["CLF", 4],
  ])("gives %s an exponent of %i", (currency, exponent) => {
    expect(currencyExponent(currency)).toBe(exponent);
  });

  it("defaults a currency that isn't in the table to 2", () => {
    expect(currencyExponent("ZZZ")).toBe(2);
  });
});

describe("parseMoney", () => {
  it.each([
    ["1234.56", 123456],
    ["-3.5", -350],
    ["1,234.56", 123456],
    ["1,234,567.89", 123456789],
    ["-9", -900],
    ["0.07", 7],
    ["1,234", 123400],
  ])("reads the US style %s", (text, minor) => {
    expect(parseMoney(text, "USD", "us")).toEqual({ minor, currency: "USD" });
  });

  it.each([
    ["-3,5", -350],
    ["1.234,56", 123456],
    ["-3", -300],
    ["1234,56", 123456],
    ["1.234", 123400],
    ["0,07", 7],
  ])("reads the German style %s", (text, minor) => {
    expect(parseMoney(text, "EUR", "german")).toEqual({
      minor,
      currency: "EUR",
    });
  });

  it("avoids the float rounding that 1.15 hits", () => {
    expect(parseMoney("1.15", "USD", "us").minor).toBe(115);
    expect(parseMoney("8.95", "USD", "us").minor).toBe(895);
  });

  it("never produces negative zero", () => {
    expect(parseMoney("-0.00", "USD", "us").minor).toBe(0);
  });

  it("ignores spaces around the number", () => {
    expect(parseMoney(" 12.50 ", "USD", "us").minor).toBe(1250);
  });

  it("treats JPY and KRW as having no decimals", () => {
    expect(parseMoney("1,234", "JPY", "us").minor).toBe(1234);
    expect(parseMoney("1.234", "KRW", "german").minor).toBe(1234);
  });

  it.each(
    "BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF"
      .split(" "),
  )("reads %s with no decimals", (currency) => {
    expect(parseMoney("7", currency, "us").minor).toBe(7);
  });

  it.each("BHD IQD JOD KWD LYD OMR TND".split(" "))(
    "reads %s with three decimals",
    (currency) => {
      expect(parseMoney("7", currency, "us").minor).toBe(7000);
    },
  );

  it.each("CLF UYW".split(" "))("reads %s with four decimals", (currency) => {
    expect(parseMoney("7", currency, "us").minor).toBe(70000);
  });

  it("defaults a currency that isn't in the table to two decimals", () => {
    expect(parseMoney("7", "ZZZ", "us").minor).toBe(700);
  });

  it("accepts zero decimals on a currency with no minor unit", () => {
    expect(parseMoney("5.000,00", "JPY", "german")).toEqual({
      minor: 5000,
      currency: "JPY",
    });
  });

  it.each([
    [""],
    ["abc"],
    ["12.34.56"],
    ["1,23.00"],
    ["1234,56"],
    ["3.50-"],
    ["+3.50"],
    [".50"],
    ["--3"],
    ["1 234.56"],
  ])("rejects the malformed US amount %j", (text) => {
    expect(() => parseMoney(text, "USD", "us")).toThrow(MoneyError);
  });

  it.each([["1,234.56"], ["1.23"], ["1.2.3"], ["3,50-"], [",5"]])(
    "rejects the malformed German amount %j",
    (text) => {
      expect(() => parseMoney(text, "EUR", "german")).toThrow(MoneyError);
    },
  );

  it("rejects too many decimals for the currency", () => {
    expect(() => parseMoney("1.234", "USD", "us")).toThrow(MoneyError);
    expect(() => parseMoney("1.5", "JPY", "us")).toThrow(MoneyError);
    expect(() => parseMoney("1,005", "EUR", "german")).toThrow(MoneyError);
  });

  it.each([
    ["1.5", "JPY", "us"],
    ["1.234", "USD", "us"],
    ["1.230", "USD", "us"],
    ["1,005", "EUR", "german"],
  ] as const)(
    "gives too-many-decimals as the reason for %s %s",
    (text, currency, style) => {
      expect.assertions(1);
      try {
        parseMoney(text, currency, style);
      } catch (error) {
        expect(error).toHaveProperty("reason", "too-many-decimals");
      }
    },
  );

  it("rejects amounts too large to hold exactly", () => {
    expect(() => parseMoney("90071992547409.93", "USD", "us")).toThrow(
      MoneyError,
    );
  });

  it("rejects a currency that isn't a three-letter code", () => {
    expect(() => parseMoney("1.00", "usd", "us")).toThrow(MoneyError);
    expect(() => parseMoney("1.00", "EURO", "us")).toThrow(MoneyError);
  });

  it("keeps the input out of the error message", () => {
    expect.assertions(1);
    try {
      parseMoney("SECRET-4242.42", "USD", "us");
    } catch (error) {
      expect(String(error)).not.toMatch(/SECRET|4242/);
    }
  });
});

describe("isDecimalShaped", () => {
  it("accepts amounts in the given style", () => {
    expect(isDecimalShaped("-3,5", "german")).toBe(true);
    expect(isDecimalShaped("1.234,56", "german")).toBe(true);
    expect(isDecimalShaped("1,234.56", "us")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDecimalShaped("", "german")).toBe(false);
    expect(isDecimalShaped("Text", "german")).toBe(false);
    expect(isDecimalShaped("1,234.56", "german")).toBe(false);
  });
});

describe("sumMinor", () => {
  it("adds minor units", () => {
    expect(sumMinor([123456, -350, 7])).toBe(123113);
  });

  it("returns 0 for an empty list", () => {
    expect(sumMinor([])).toBe(0);
  });

  it("rejects a total too large to hold exactly", () => {
    expect(() =>
      sumMinor([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]),
    ).toThrow(MoneyError);
  });

  it("rejects a value that isn't a whole number of minor units", () => {
    expect(() => sumMinor([1.5])).toThrow(MoneyError);
  });
});
