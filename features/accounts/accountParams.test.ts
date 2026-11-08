import { describe, expect, it } from "vitest";
import { accountHref, readAccountParam } from "./accountParams";

describe("readAccountParam", () => {
  it("reads the account from the address", () => {
    expect(readAccountParam({ account: "acc-card" })).toBe("acc-card");
  });

  it.each([
    ["missing", {}],
    ["empty", { account: "" }],
    ["given twice", { account: ["acc-card", "acc-giro"] }],
  ])("gives no account when it's %s", (_, params) => {
    expect(readAccountParam(params)).toBeNull();
  });
});

describe("accountHref", () => {
  it("links to the Account page for one account", () => {
    expect(accountHref("acc-card")).toBe("/accounts?account=acc-card");
  });
});
