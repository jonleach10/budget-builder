import { describe, expect, it } from "vitest";
import { redactText } from "@/features/import/redact";
import type { Transaction } from "@/features/import/types";
import { bankCategoryMap, bankTypeMap } from "./bankMaps";
import { categorize, type CategoryContext } from "./categorize";
import type { CategoryRule } from "./findCategory";
import { merchantKey, mixedMerchants, pastCategories } from "./pastCategories";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    accountId: "acct-1",
    fingerprint: "fingerprint-1",
    postedOn: "2026-10-05",
    amount: { minor: -1199, currency: "USD" },
    description: "EXAMPLE MARKET 42",
    bankType: "CARD",
    bankCategory: "Shopping",
    ...overrides,
  };
}

function context(overrides: Partial<CategoryContext> = {}): CategoryContext {
  return {
    categoryRules: [],
    pastCategories: {},
    mixedMerchants: [],
    bankTypeMap: {},
    bankCategoryMap: {},
    ...overrides,
  };
}

const rule: CategoryRule = {
  matchOn: "descriptionContains",
  value: "MARKET",
  category: "From rule",
};
const past = pastCategories([
  {
    transaction: transaction(),
    category: "From history",
    source: "manual",
  },
]);
const everyStep = context({
  manualCategory: "From manual",
  categoryRules: [rule],
  pastCategories: past,
  bankTypeMap: { CARD: "From bank type" },
  bankCategoryMap: { Shopping: "From bank category" },
});

describe("categorize", () => {
  describe("a type that doesn't take a category", () => {
    it.each(["income", "transfer", "saved", "personal"] as const)(
      "gives no-category for %s, whatever else matches",
      (type) => {
        expect(categorize(transaction(), type, everyStep)).toStrictEqual({
          status: "no-category",
        });
      },
    );
  });

  describe("an undefined type", () => {
    it("needs review, even if a category would match", () => {
      expect(categorize(transaction(), undefined, everyStep)).toStrictEqual({
        status: "needs-review",
      });
    });
  });

  describe("spending, first match wins", () => {
    it("takes the manual category first", () => {
      expect(categorize(transaction(), "spending", everyStep)).toStrictEqual({
        status: "categorized",
        category: "From manual",
        source: "manual",
      });
    });

    it("takes a category rule next", () => {
      const rest = { ...everyStep, manualCategory: undefined };

      expect(categorize(transaction(), "spending", rest)).toStrictEqual({
        status: "categorized",
        category: "From rule",
        source: "rule",
      });
    });

    it("takes the past category next", () => {
      const rest = { ...everyStep, manualCategory: null, categoryRules: [] };

      expect(categorize(transaction(), "spending", rest)).toStrictEqual({
        status: "categorized",
        category: "From history",
        source: "history",
      });
    });

    it("takes the bank type map last", () => {
      const rest = {
        ...everyStep,
        manualCategory: undefined,
        categoryRules: [],
        pastCategories: {},
      };

      expect(categorize(transaction(), "spending", rest)).toStrictEqual({
        status: "categorized",
        category: "From bank type",
        source: "bank-type",
      });
    });

    it("finds a past category for a later row from the same merchant", () => {
      const key = merchantKey(transaction({ ppdId: "PPD0001" }));
      const ctx = context({ pastCategories: { [String(key)]: "Groceries" } });
      const later = transaction({
        ppdId: "PPD0001",
        description: "EXAMPLE CAFE",
      });

      expect(categorize(later, "spending", ctx)).toStrictEqual({
        status: "categorized",
        category: "Groceries",
        source: "history",
      });
    });

    it("gives a transfer to a personal account its category by rule", () => {
      const row = transaction({ description: "TRANSFER TO PERSONAL ACCOUNT" });
      const ctx = context({
        categoryRules: [
          {
            matchOn: "descriptionContains",
            value: "PERSONAL ACCOUNT",
            category: "Personal allowance",
          },
        ],
      });

      expect(categorize(row, "spending", ctx)).toStrictEqual({
        status: "categorized",
        category: "Personal allowance",
        source: "rule",
      });
    });
  });

  describe("spending with no match", () => {
    it("needs review with no suggestion", () => {
      expect(categorize(transaction(), "spending", context())).toStrictEqual({
        status: "needs-review",
      });
    });

    it("suggests the bank category map's value", () => {
      const ctx = context({ bankCategoryMap: { Shopping: "Household" } });

      expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
        status: "needs-review",
        suggestedCategory: "Household",
      });
    });

    it("gives no suggestion when the map doesn't have the bank category", () => {
      const ctx = context({ bankCategoryMap: { Travel: "Holidays" } });

      expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });

    it("gives no suggestion to a row with no bank category", () => {
      const row = transaction({ bankCategory: undefined });
      const ctx = context({ bankCategoryMap: { "": "Household" } });

      expect(categorize(row, "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });

    it("never categorizes from the bank category alone", () => {
      const ctx = context({ bankCategoryMap: { Shopping: "Household" } });

      expect(categorize(transaction(), "spending", ctx).status).toBe(
        "needs-review",
      );
    });

  });

  describe("a blank category counts as no match", () => {
    const blanks = ["", "   ", "\t\n"];

    it.each(blanks)("moves on from a manual category of %j", (manualCategory) => {
      const ctx = { ...everyStep, manualCategory };

      expect(categorize(transaction(), "spending", ctx)).toMatchObject({
        status: "categorized",
        source: "rule",
      });
    });

    it.each(blanks)("moves on from a rule giving %j", (category) => {
      const ctx = {
        ...everyStep,
        manualCategory: undefined,
        categoryRules: [{ ...rule, category }],
      };

      expect(categorize(transaction(), "spending", ctx)).toMatchObject({
        status: "categorized",
        source: "history",
      });
    });

    it.each(blanks)("moves on from a past category of %j", (category) => {
      const key = String(merchantKey(transaction()));
      const ctx = {
        ...everyStep,
        manualCategory: undefined,
        categoryRules: [],
        pastCategories: { [key]: category },
      };

      expect(categorize(transaction(), "spending", ctx)).toMatchObject({
        status: "categorized",
        source: "bank-type",
      });
    });

    it.each(blanks)("moves on from a bank type mapped to %j", (category) => {
      const ctx = context({
        bankTypeMap: { CARD: category },
        bankCategoryMap: { Shopping: "Household" },
      });

      expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
        status: "needs-review",
        suggestedCategory: "Household",
      });
    });

    it.each(blanks)("never suggests a bank category mapped to %j", (category) => {
      const ctx = context({ bankCategoryMap: { Shopping: category } });

      expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });

    it("needs review when every step is blank", () => {
      const key = String(merchantKey(transaction()));
      const ctx = context({
        manualCategory: " ",
        categoryRules: [{ ...rule, category: " " }],
        pastCategories: { [key]: " " },
        bankTypeMap: { CARD: " " },
        bankCategoryMap: { Shopping: " " },
      });

      expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });
  });

  describe("bank text that names an Object property", () => {
    it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
      "treats %s as an unknown bank value",
      (text) => {
        const row = transaction({ bankType: text, bankCategory: text });

        expect(categorize(row, "spending", context())).toStrictEqual({
          status: "needs-review",
        });
      },
    );

  });

  describe("past categories", () => {
    it("sends a row with no merchant key to review", () => {
      const row = transaction({ description: "  " });

      expect(categorize(row, "spending", context())).toStrictEqual({
        status: "needs-review",
      });
    });

    it("sends a merchant with two confirmed categories to review", () => {
      const row = transaction();
      const ctx = context({
        pastCategories: pastCategories([
          { transaction: row, category: "Groceries", source: "manual" },
          { transaction: row, category: "Dining", source: "manual" },
        ]),
      });

      expect(categorize(row, "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });

    describe("a mixed merchant whose bank type is in the map", () => {
      const rows = [
        { transaction: transaction(), category: "Travel", source: "manual" },
        { transaction: transaction(), category: "Insurance", source: "manual" },
      ] as const;
      const mixed = context({
        pastCategories: pastCategories(rows),
        mixedMerchants: mixedMerchants(rows),
        bankTypeMap: { CARD: "From bank type" },
      });

      it("goes to review", () => {
        expect(categorize(transaction(), "spending", mixed)).toStrictEqual({
          status: "needs-review",
        });
      });

      it("keeps the suggestion from the bank category map", () => {
        const ctx = { ...mixed, bankCategoryMap: { Shopping: "Suggested" } };

        expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
          status: "needs-review",
          suggestedCategory: "Suggested",
        });
      });

      it("still takes a manual category", () => {
        const ctx = { ...mixed, manualCategory: "From manual" };

        expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
          status: "categorized",
          category: "From manual",
          source: "manual",
        });
      });

      it("still takes a category rule", () => {
        const ctx = { ...mixed, categoryRules: [rule] };

        expect(categorize(transaction(), "spending", ctx)).toStrictEqual({
          status: "categorized",
          category: "From rule",
          source: "rule",
        });
      });

      it("leaves other merchants to the bank type map", () => {
        const other = transaction({ description: "EXAMPLE CAFE" });

        expect(categorize(other, "spending", mixed)).toStrictEqual({
          status: "categorized",
          category: "From bank type",
          source: "bank-type",
        });
      });
    });

    it("doesn't spread a category between rows with redacted descriptions", () => {
      const first = transaction({
        description: redactText("PAY DE00123456789012345678"),
      });
      const second = transaction({
        description: redactText("PAY DE00987654321098765432"),
      });
      const ctx = context({
        pastCategories: pastCategories([
          { transaction: first, category: "Rent", source: "manual" },
        ]),
      });

      expect(categorize(second, "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });

    it("doesn't spread a guess from the chain", () => {
      const first = transaction({ fingerprint: "fingerprint-1" });
      const second = transaction({ fingerprint: "fingerprint-2" });
      const byRule = context({ categoryRules: [rule] });
      const guess = categorize(first, "spending", byRule);
      if (guess.status !== "categorized") throw new Error("expected a category");

      const ctx = context({
        pastCategories: pastCategories([
          { transaction: first, category: guess.category, source: guess.source },
        ]),
      });

      expect(categorize(second, "spending", ctx)).toStrictEqual({
        status: "needs-review",
      });
    });

    it("spreads a manual category through the chain", () => {
      const first = transaction({ fingerprint: "fingerprint-1" });
      const second = transaction({ fingerprint: "fingerprint-2" });
      const manual = context({ manualCategory: "Groceries" });
      const choice = categorize(first, "spending", manual);
      if (choice.status !== "categorized") throw new Error("expected a category");

      const ctx = context({
        pastCategories: pastCategories([
          {
            transaction: first,
            category: choice.category,
            source: choice.source,
          },
        ]),
      });

      expect(categorize(second, "spending", ctx)).toStrictEqual({
        status: "categorized",
        category: "Groceries",
        source: "history",
      });
    });
  });

  describe("the bank maps", () => {
    it.each(["FEE_TRANSACTION", "Fee"])("maps the bank type %s to Fees", (bankType) => {
      const row = transaction({ bankType });
      const ctx = context({ bankTypeMap, bankCategoryMap });

      expect(categorize(row, "spending", ctx)).toStrictEqual({
        status: "categorized",
        category: "Fees",
        source: "bank-type",
      });
    });

    it("holds only those two bank types", () => {
      expect(bankTypeMap).toStrictEqual({
        FEE_TRANSACTION: "Fees",
        Fee: "Fees",
      });
    });

    it("matches a bank type exactly", () => {
      const row = transaction({ bankType: "FEE" });

      expect(categorize(row, "spending", context({ bankTypeMap }))).toStrictEqual(
        { status: "needs-review" },
      );
    });

    it("starts with an empty bank category map", () => {
      expect(bankCategoryMap).toStrictEqual({});
    });

    it("keeps both maps as plain data that survive JSON", () => {
      const maps = { bankTypeMap, bankCategoryMap };

      expect(JSON.parse(JSON.stringify(maps))).toStrictEqual(maps);
    });
  });
});
