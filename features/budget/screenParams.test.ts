import { describe, expect, it } from "vitest";
import { readScreenParams, screenHref } from "./screenParams";

const CURRENT = "2026-11";

describe("readScreenParams", () => {
  it("reads the month and view from the URL", () => {
    expect(
      readScreenParams({ month: "2026-03", view: "germany" }, CURRENT),
    ).toEqual({ month: "2026-03", view: "germany" });
  });

  it("starts at the current month and US", () => {
    expect(readScreenParams({}, CURRENT)).toEqual({
      month: CURRENT,
      view: "us",
    });
  });

  it.each(["2026-13", "2026-3", "2026-03-01", "soon", ""])(
    "falls back to the current month for the month %j",
    (month) => {
      expect(readScreenParams({ month }, CURRENT).month).toBe(CURRENT);
    },
  );

  it.each(["US", "france", ""])("falls back to US for the view %j", (view) => {
    expect(readScreenParams({ view }, CURRENT).view).toBe("us");
  });

  it("falls back when a value is repeated in the URL", () => {
    expect(
      readScreenParams(
        { month: ["2026-01", "2026-02"], view: ["germany", "combined"] },
        CURRENT,
      ),
    ).toEqual({ month: CURRENT, view: "us" });
  });

  it("keeps a good value when the other one is bad", () => {
    expect(
      readScreenParams({ month: "bad", view: "combined" }, CURRENT),
    ).toEqual({ month: CURRENT, view: "combined" });
  });
});

describe("screenHref", () => {
  it("puts the month and view in the URL", () => {
    expect(screenHref("/budget", { month: "2026-03", view: "germany" })).toBe(
      "/budget?month=2026-03&view=germany",
    );
  });

  it("gives URLs that readScreenParams reads back", () => {
    const params = { month: "2026-03", view: "combined" } as const;
    const query = new URL(screenHref("/", params), "https://example.test")
      .searchParams;

    expect(
      readScreenParams(Object.fromEntries(query.entries()), CURRENT),
    ).toEqual(params);
  });
});
