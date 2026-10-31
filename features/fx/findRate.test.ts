import { describe, expect, it } from "vitest";
import { findRate } from "./findRate";

describe("findRate", () => {
  it("returns the rate for that date", () => {
    const rates = { "2026-03-05": "1.08", "2026-03-06": "1.09" };
    expect(findRate(rates, "2026-03-06")).toBe("1.09");
  });

  it("falls back from a weekend to the Friday before", () => {
    // 2026-03-06 is a Friday.
    const rates = { "2026-03-05": "1.08", "2026-03-06": "1.09" };
    expect(findRate(rates, "2026-03-07")).toBe("1.09");
    expect(findRate(rates, "2026-03-08")).toBe("1.09");
  });

  it("returns the latest earlier rate, whatever the key order", () => {
    const rates = { "2026-03-06": "1.09", "2026-03-02": "1.05" };
    expect(findRate(rates, "2026-03-07")).toBe("1.09");
  });

  it("finds a rate exactly 7 days earlier", () => {
    expect(findRate({ "2026-03-01": "1.08" }, "2026-03-08")).toBe("1.08");
  });

  it("returns undefined for a rate 8 days earlier", () => {
    expect(findRate({ "2026-03-01": "1.08" }, "2026-03-09")).toBeUndefined();
  });

  it("ignores a rate from a later date", () => {
    expect(findRate({ "2026-03-09": "1.08" }, "2026-03-08")).toBeUndefined();
  });

  it("returns undefined with no rates", () => {
    expect(findRate({}, "2026-03-08")).toBeUndefined();
  });

  it("falls back across the end of a month and a year", () => {
    expect(findRate({ "2026-02-27": "1.08" }, "2026-03-01")).toBe("1.08");
    expect(findRate({ "2025-12-31": "1.08" }, "2026-01-01")).toBe("1.08");
  });

  it("falls back across a leap day", () => {
    expect(findRate({ "2024-02-29": "1.08" }, "2024-03-01")).toBe("1.08");
  });

  it("falls back across a clock change", () => {
    // Clocks change on 2026-03-08 in the US and 2026-03-29 in Germany.
    expect(findRate({ "2026-03-07": "1.08" }, "2026-03-09")).toBe("1.08");
    expect(findRate({ "2026-03-28": "1.08" }, "2026-03-30")).toBe("1.08");
  });

  it.each([
    ["2026-02-30"],
    ["2026-13-01"],
    ["2026-3-1"],
    ["03/01/2026"],
    ["constructor"],
    [""],
  ])("returns undefined for the date %j", (date) => {
    expect(findRate({ "2026-02-27": "1.08" }, date)).toBeUndefined();
  });
});
