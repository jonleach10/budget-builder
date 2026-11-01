import { describe, expect, it } from "vitest";
import { ratesByDate } from "./loadScreens";

describe("ratesByDate", () => {
  it("keys the stored rates by date, keeping each rate as text", () => {
    expect(
      ratesByDate([
        { rate_date: "2026-09-30", rate: "1.0837" },
        { rate_date: "2026-10-01", rate: "1.08" },
      ]),
    ).toEqual({ "2026-09-30": "1.0837", "2026-10-01": "1.08" });
  });
});
