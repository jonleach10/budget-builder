import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonth,
  lastMonths,
  monthName,
  nearestMonth,
  shortDate,
  shortMonthName,
} from "./months";

describe("currentMonth", () => {
  it("reads the month of a moment in UTC", () => {
    expect(currentMonth(new Date("2026-11-01T00:30:00Z"))).toBe("2026-11");
    expect(currentMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10");
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-10", 1, "2026-11"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-11", -11, "2025-12"],
    ["2026-03", 0, "2026-03"],
    ["2026-03", 24, "2028-03"],
  ])("takes %s and %i to %s", (month, count, result) => {
    expect(addMonths(month, count)).toBe(result);
  });
});

describe("lastMonths", () => {
  it("lists months in order, ending at the given month", () => {
    expect(lastMonths("2026-02", 4)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("month names", () => {
  it("gives the full and short names", () => {
    expect(monthName("2026-10")).toBe("October 2026");
    expect(shortMonthName("2026-01")).toBe("Jan");
  });
});

describe("shortDate", () => {
  it("reads the date as text, so a time zone can't change the day", () => {
    expect(shortDate("2026-10-03")).toBe("Oct 3");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
  });
});

describe("nearestMonth", () => {
  it("finds the nearest earlier month", () => {
    expect(nearestMonth("2026-11", ["2026-02", "2026-09"])).toBe("2026-09");
  });

  it("finds a later month, so a past month can be backfilled", () => {
    expect(nearestMonth("2026-01", ["2026-04", "2026-09"])).toBe("2026-04");
  });

  it("gives a tie to the earlier month", () => {
    expect(nearestMonth("2026-06", ["2026-08", "2026-04"])).toBe("2026-04");
  });

  it("counts distance across a year end", () => {
    expect(nearestMonth("2026-12", ["2026-09", "2027-02"])).toBe("2027-02");
  });

  it("gives undefined when there are no months", () => {
    expect(nearestMonth("2026-06", [])).toBeUndefined();
  });
});
