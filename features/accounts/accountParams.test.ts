import { describe, expect, it } from "vitest";
import {
  accountHref,
  LAST_ACCOUNT_COOKIE,
  lastAccountCookie,
  readAccountParams,
} from "./accountParams";
import { shortcutPeriod } from "./period";

const TODAY = "2026-11-08";
const LAST_3_MONTHS = { kind: "range", from: "2026-08", to: "2026-10" };

describe("readAccountParams: the period", () => {
  it("opens on Last 3 Months, ending at the last full month, with no period", () => {
    expect(readAccountParams({ account: "acc-card" }, null, TODAY).period).toEqual(
      LAST_3_MONTHS,
    );
  });

  it("reads a From and To range", () => {
    expect(
      readAccountParams({ from: "2025-12", to: "2026-02" }, null, TODAY).period,
    ).toEqual({ kind: "range", from: "2025-12", to: "2026-02" });
  });

  it("reads a range of one month", () => {
    expect(
      readAccountParams({ from: "2026-10", to: "2026-10" }, null, TODAY).period,
    ).toEqual({ kind: "range", from: "2026-10", to: "2026-10" });
  });

  it("reads All Months", () => {
    expect(readAccountParams({ period: "all" }, null, TODAY).period).toEqual({
      kind: "all",
    });
  });

  it.each([
    ["From with no To", { from: "2026-01" }],
    ["To with no From", { to: "2026-01" }],
    ["a month that isn't one", { from: "2026-13", to: "2026-14" }],
    ["a date, not a month", { from: "2026-01-01", to: "2026-02-01" }],
    ["empty months", { from: "", to: "" }],
    ["a month given twice", { from: ["2026-01", "2026-02"], to: "2026-03" }],
    ["From after To", { from: "2026-05", to: "2026-02" }],
    ["an unknown period", { period: "forever" }],
    ["All Months given twice", { period: ["all", "all"] }],
    ["an unknown period with a good range", {
      period: "forever",
      from: "2026-01",
      to: "2026-02",
    }],
  ])("falls back to Last 3 Months for %s", (_, params) => {
    expect(readAccountParams(params, null, TODAY).period).toEqual(LAST_3_MONTHS);
  });

  it("takes All Months over a range given with it", () => {
    expect(
      readAccountParams(
        { period: "all", from: "2026-01", to: "2026-02" },
        null,
        TODAY,
      ).period,
    ).toEqual({ kind: "all" });
  });

  it("crosses a new year for Last 3 Months in February", () => {
    expect(readAccountParams({}, null, "2026-02-14").period).toEqual({
      kind: "range",
      from: "2025-11",
      to: "2026-01",
    });
  });
});

describe("readAccountParams: the account", () => {
  it("reads the account from the address", () => {
    expect(readAccountParams({ account: "acc-card" }, null, TODAY).accountId).toBe(
      "acc-card",
    );
  });

  it("takes the address over the last account viewed", () => {
    expect(
      readAccountParams({ account: "acc-card" }, "acc-giro", TODAY).accountId,
    ).toBe("acc-card");
  });

  it("opens the last account viewed when the address has none", () => {
    expect(readAccountParams({}, "acc-giro", TODAY).accountId).toBe("acc-giro");
  });

  it.each([
    ["no account and no cookie", {}, null],
    ["an empty account and an empty cookie", { account: "" }, ""],
    ["an account given twice", { account: ["acc-card", "acc-giro"] }, null],
    ["a cookie that isn't an ID", {}, "acc giro; path=/"],
  ])("gives no account for %s", (_, params, cookie) => {
    expect(readAccountParams(params, cookie, TODAY).accountId).toBeNull();
  });
});

describe("accountHref", () => {
  it("links to the Account page for one account", () => {
    expect(accountHref("acc-card")).toBe("/accounts?account=acc-card");
  });

  it("links to a range by its From and To months", () => {
    expect(
      accountHref("acc-card", { kind: "range", from: "2026-08", to: "2026-10" }),
    ).toBe("/accounts?account=acc-card&from=2026-08&to=2026-10");
  });

  it("links to All Months by name, since its months depend on the rows", () => {
    expect(accountHref("acc-card", { kind: "all" })).toBe(
      "/accounts?account=acc-card&period=all",
    );
  });

  it.each([
    ["This Month", "this-month", { from: "2026-11", to: "2026-11" }],
    ["Last 3 Months", "last-3-months", { from: "2026-08", to: "2026-10" }],
    ["Last 12 Months", "last-12-months", { from: "2025-11", to: "2026-10" }],
  ] as const)("gives %s a link that reads back as its months", (_, shortcut, months) => {
    const period = shortcutPeriod(shortcut, TODAY);
    const href = accountHref("acc-card", period);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);

    expect(period).toEqual({ kind: "range", ...months });
    expect(readAccountParams(params, null, TODAY)).toEqual({
      accountId: "acc-card",
      period: { kind: "range", ...months },
    });
  });

  it("gives All Months a link that reads back as All Months", () => {
    const href = accountHref("acc-card", shortcutPeriod("all-months", TODAY));
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);

    expect(readAccountParams(params, null, TODAY).period).toEqual({ kind: "all" });
  });
});

describe("lastAccountCookie", () => {
  it("holds only the account's ID, for the Account page, for a year", () => {
    expect(LAST_ACCOUNT_COOKIE).toBe("last-account");
    expect(lastAccountCookie("1f0c2a9e-5b7d-4c3e-9a1b-2d3e4f5a6b7c")).toBe(
      "last-account=1f0c2a9e-5b7d-4c3e-9a1b-2d3e4f5a6b7c; path=/accounts; max-age=31536000; samesite=lax",
    );
  });

  it("reads back the ID it wrote", () => {
    const id = "1f0c2a9e-5b7d-4c3e-9a1b-2d3e4f5a6b7c";
    const value = lastAccountCookie(id).split(";")[0].split("=")[1];

    expect(readAccountParams({}, value, TODAY).accountId).toBe(id);
  });
});
