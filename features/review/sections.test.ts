import { describe, expect, it } from "vitest";
import { readReviewSection, sectionHref } from "./sections";

describe("readReviewSection", () => {
  it("reads No Merchant from the address", () => {
    expect(readReviewSection({ section: "no-merchant" })).toBe("no-merchant");
  });

  it.each<[string, Record<string, string | string[] | undefined>]>([
    ["nothing", {}],
    ["an unknown section", { section: "duplicates" }],
    ["a repeated section", { section: ["no-merchant", "merchants"] }],
  ])("falls back to Merchants for %s", (_name, params) => {
    expect(readReviewSection(params)).toBe("merchants");
  });
});

describe("sectionHref", () => {
  it("keeps Merchants at the inbox's own address", () => {
    expect(sectionHref("merchants")).toBe("/review");
    expect(sectionHref("no-merchant")).toBe("/review?section=no-merchant");
  });
});
