import { describe, expect, it } from "vitest";
import type { Transaction } from "@/features/import/types";
import { findCategory, type CategoryRule } from "./findCategory";
import { findType, type MatchingRule } from "./findType";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    accountId: "acct-1",
    fingerprint: "fingerprint-1",
    postedOn: "2026-10-05",
    amount: { minor: -1199, currency: "USD" },
    description: "EXAMPLE MARKET 42",
    ...overrides,
  };
}

describe("findCategory", () => {
  it("gives the rule's category when the ppdId equals its value", () => {
    const rules: CategoryRule[] = [
      { matchOn: "ppdId", value: "PPD0001", category: "Groceries" },
    ];

    expect(findCategory(transaction({ ppdId: "PPD0001" }), rules)).toBe(
      "Groceries",
    );
  });

  it("gives the rule's category when the orderingPartyId equals its value", () => {
    const rules: CategoryRule[] = [
      { matchOn: "orderingPartyId", value: "ORDER0001", category: "Rent" },
    ];

    expect(
      findCategory(transaction({ orderingPartyId: "ORDER0001" }), rules),
    ).toBe("Rent");
  });

  it("gives undefined when no rule matches", () => {
    const rules: CategoryRule[] = [
      { matchOn: "ppdId", value: "PPD0001", category: "Groceries" },
    ];

    expect(findCategory(transaction(), rules)).toBeUndefined();
  });

  it("gives undefined when there are no rules", () => {
    expect(findCategory(transaction(), [])).toBeUndefined();
  });

  it("matches text at the start of the description, ignoring case", () => {
    const rules: CategoryRule[] = [
      {
        matchOn: "descriptionStartsWith",
        value: "example",
        category: "Groceries",
      },
    ];

    expect(findCategory(transaction(), rules)).toBe("Groceries");
    expect(
      findCategory(transaction({ description: "AN EXAMPLE MARKET" }), rules),
    ).toBeUndefined();
  });

  it("matches text anywhere in the description, ignoring case", () => {
    const rules: CategoryRule[] = [
      { matchOn: "descriptionContains", value: "straße", category: "Rent" },
    ];

    expect(
      findCategory(transaction({ description: "BEISPIEL STRASSE 7" }), rules),
    ).toBe("Rent");
  });

  it("matches IDs exactly", () => {
    const rules: CategoryRule[] = [
      { matchOn: "ppdId", value: "ppd0001", category: "Groceries" },
      { matchOn: "orderingPartyId", value: "order0001", category: "Rent" },
    ];

    expect(
      findCategory(
        transaction({ ppdId: "PPD0001", orderingPartyId: "ORDER0001" }),
        rules,
      ),
    ).toBeUndefined();
  });

  it.each([
    ["ppdId", ""],
    ["orderingPartyId", ""],
    ["descriptionStartsWith", ""],
    ["descriptionContains", ""],
    ["descriptionStartsWith", " "],
    ["descriptionContains", " "],
  ] as const)("never matches %s on the empty value '%s'", (matchOn, value) => {
    const rules: CategoryRule[] = [{ matchOn, value, category: "Fees" }];

    expect(
      findCategory(
        transaction({
          description: " EXAMPLE MARKET",
          ppdId: "",
          orderingPartyId: "",
        }),
        rules,
      ),
    ).toBeUndefined();
  });

  describe("a blank category", () => {
    it.each(["", "   ", "\t\n"])("never comes back as %j", (category) => {
      const rules: CategoryRule[] = [
        { matchOn: "descriptionContains", value: "MARKET", category },
      ];

      expect(findCategory(transaction(), rules)).toBeUndefined();
    });

    it("lets a later rule match instead", () => {
      const rules: CategoryRule[] = [
        { matchOn: "ppdId", value: "PPD0001", category: "  " },
        { matchOn: "descriptionContains", value: "MARKET", category: "Dining" },
      ];

      expect(findCategory(transaction({ ppdId: "PPD0001" }), rules)).toBe(
        "Dining",
      );
    });
  });

  describe("rule order", () => {
    const both = transaction({ ppdId: "PPD0001", orderingPartyId: "ORDER0001" });

    it("tries an ID rule before a text rule listed first", () => {
      const rules: CategoryRule[] = [
        { matchOn: "descriptionContains", value: "MARKET", category: "Dining" },
        { matchOn: "ppdId", value: "PPD0001", category: "Groceries" },
      ];

      expect(findCategory(both, rules)).toBe("Groceries");
    });

    it("uses list order between ID rules", () => {
      const rules: CategoryRule[] = [
        { matchOn: "orderingPartyId", value: "ORDER0001", category: "Rent" },
        { matchOn: "ppdId", value: "PPD0001", category: "Groceries" },
      ];

      expect(findCategory(both, rules)).toBe("Rent");
    });

    it("uses list order between text rules", () => {
      const rules: CategoryRule[] = [
        { matchOn: "descriptionContains", value: "MARKET", category: "Dining" },
        {
          matchOn: "descriptionStartsWith",
          value: "EXAMPLE",
          category: "Groceries",
        },
      ];

      expect(findCategory(both, rules)).toBe("Dining");
    });
  });

  it("picks the same rule as findType from the same list", () => {
    const conditions = [
      { matchOn: "descriptionContains", value: "market" },
      { matchOn: "descriptionStartsWith", value: "EXAMPLE" },
      { matchOn: "orderingPartyId", value: "ORDER0001" },
      { matchOn: "ppdId", value: "PPD0002" },
    ] as const;
    const typeRules: MatchingRule[] = conditions.map((condition, index) => ({
      ...condition,
      type: index === 2 ? "saved" : "spending",
    }));
    const categoryRules: CategoryRule[] = conditions.map(
      (condition, index) => ({
        ...condition,
        category: index === 2 ? "Rent" : "Dining",
      }),
    );
    const row = transaction({ orderingPartyId: "ORDER0001" });

    expect(findType(row, typeRules)).toBe("saved");
    expect(findCategory(row, categoryRules)).toBe("Rent");
  });

  it("works on rules saved as JSON and read back", () => {
    const rules: CategoryRule[] = [
      { matchOn: "descriptionContains", value: "market", category: "Groceries" },
    ];
    const saved = JSON.stringify(rules);

    expect(saved).toBe(
      '[{"matchOn":"descriptionContains","value":"market","category":"Groceries"}]',
    );

    const readBack = JSON.parse(saved) as CategoryRule[];

    expect(findCategory(transaction(), readBack)).toBe("Groceries");
  });

  it("lets a rule give a transfer to a personal account its category", () => {
    const rules: CategoryRule[] = [
      {
        matchOn: "descriptionContains",
        value: "PERSONAL ACCOUNT",
        category: "Personal allowance",
      },
    ];

    expect(
      findCategory(
        transaction({ description: "TRANSFER TO PERSONAL ACCOUNT" }),
        rules,
      ),
    ).toBe("Personal allowance");
  });
});
