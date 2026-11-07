import { describe, expect, it } from "vitest";
import { readReviewSection, SECTIONS, sectionHref } from "./sections";

describe("SECTIONS", () => {
  it("lists the four places in tab order, with the phone's shorter labels", () => {
    expect(SECTIONS).toEqual([
      { value: "merchants", label: "Merchants", phoneLabel: "Merchants" },
      { value: "no-merchant", label: "No Merchant", phoneLabel: "No Merchant" },
      { value: "transfers", label: "Possible Transfers", phoneLabel: "Transfers" },
      { value: "duplicates", label: "Possible Duplicates", phoneLabel: "Duplicates" },
    ]);
  });
});

describe("readReviewSection", () => {
  it.each(["no-merchant", "transfers", "duplicates"] as const)(
    "reads %s from the address",
    (section) => {
      expect(readReviewSection({ section })).toBe(section);
    },
  );

  it.each<[string, Record<string, string | string[] | undefined>]>([
    ["nothing", {}],
    ["an unknown section", { section: "refunds" }],
    ["a repeated section", { section: ["no-merchant", "merchants"] }],
  ])("falls back to Merchants for %s", (_name, params) => {
    expect(readReviewSection(params)).toBe("merchants");
  });
});

describe("sectionHref", () => {
  it("keeps Merchants at the inbox's own address", () => {
    expect(sectionHref("merchants")).toBe("/review");
    expect(sectionHref("no-merchant")).toBe("/review?section=no-merchant");
    expect(sectionHref("transfers")).toBe("/review?section=transfers");
    expect(sectionHref("duplicates")).toBe("/review?section=duplicates");
  });
});
