import { describe, expect, it } from "vitest";
import {
  deleteRefusal,
  validateCategoryName,
  type CategoryRow,
} from "./categories";

const CATEGORIES: CategoryRow[] = [
  { id: "cat-groceries", name: "Groceries", position: 0 },
  { id: "cat-dining", name: "Dining", position: 1 },
];

describe("validateCategoryName", () => {
  it("accepts a new name, without the space around it", () => {
    expect(validateCategoryName("  Pets ", CATEGORIES)).toEqual({
      ok: true,
      name: "Pets",
    });
  });

  // The schema's filled_text check treats these as blank. They're code points
  // because they would be invisible as characters in this file.
  const WIDE_BLANKS = [0x00a0, 0x2003, 0x3000, 0xfeff].map((code) =>
    String.fromCharCode(code),
  );

  it.each(["", "   ", "\t\n", ...WIDE_BLANKS])(
    "refuses a blank name: %j",
    (name) => {
      expect(validateCategoryName(name, CATEGORIES)).toEqual({
        ok: false,
        message: "Enter a category name.",
      });
    },
  );

  it.each(["Groceries", "groceries", " GROCERIES "])(
    "refuses a duplicate name: %j",
    (name) => {
      expect(validateCategoryName(name, CATEGORIES)).toEqual({
        ok: false,
        message: "A category with this name already exists. Enter a different name.",
      });
    },
  );

  it("compares names the way bank text is compared, so ß matches SS", () => {
    const stored = [{ id: "cat-road", name: "Straße", position: 0 }];

    expect(validateCategoryName("STRASSE", stored)).toMatchObject({ ok: false });
  });

  it("lets a category keep its own name", () => {
    expect(
      validateCategoryName("Groceries", CATEGORIES, "cat-groceries"),
    ).toEqual({ ok: true, name: "Groceries" });
  });

  it("lets a rename change only the case", () => {
    expect(
      validateCategoryName("GROCERIES", CATEGORIES, "cat-groceries"),
    ).toEqual({ ok: true, name: "GROCERIES" });
  });

  it("refuses a rename to another category's name", () => {
    expect(
      validateCategoryName("Dining", CATEGORIES, "cat-groceries"),
    ).toMatchObject({ ok: false });
  });
});

describe("deleteRefusal", () => {
  const UNUSED = { transactions: 0, rules: 0, budgetAmounts: 0 };

  it("allows a category nothing uses", () => {
    expect(deleteRefusal("Pets", UNUSED)).toBeNull();
  });

  it("names every count when a category is in use", () => {
    expect(
      deleteRefusal("Groceries", {
        transactions: 214,
        rules: 2,
        budgetAmounts: 8,
      }),
    ).toBe(
      "Groceries can't be deleted because it has 214 transactions, 2 rules and 8 budget amounts. Change those first, then try again.",
    );
  });

  it.each([
    ["a transaction", { ...UNUSED, transactions: 1 }, "1 transaction, 0 rules and 0 budget amounts"],
    ["a rule", { ...UNUSED, rules: 1 }, "0 transactions, 1 rule and 0 budget amounts"],
    ["a budget amount", { ...UNUSED, budgetAmounts: 1 }, "0 transactions, 0 rules and 1 budget amount"],
  ])("refuses when the only use is %s", (_use, usage, counts) => {
    expect(deleteRefusal("Dining", usage)).toContain(counts);
  });

  it("puts commas in large counts", () => {
    expect(
      deleteRefusal("Dining", { ...UNUSED, transactions: 1200 }),
    ).toContain("1,200 transactions");
  });
});
