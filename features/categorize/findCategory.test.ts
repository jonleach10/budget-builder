import { describe, expect, it } from "vitest";
import { redactText } from "@/features/import/redact";
import type { Transaction } from "@/features/import/types";
import { findCategory, type CategoryRule } from "./findCategory";
import { findType, type MatchingRule } from "./findType";

// A code point, because the character would be invisible in this file.
const NO_BREAK_SPACE = String.fromCharCode(0x00a0);

const OTHER_WHITESPACE = [
  ["a tab", "\t"],
  ["a no-break space", NO_BREAK_SPACE],
  ["a run with a no-break space", ` ${NO_BREAK_SPACE} `],
];

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

  it.each([
    ["straße", "BEISPIEL STRAẞE 7"],
    ["STRAẞE", "Beispiel Straße 7"],
    ["STRASSE", "BEISPIEL STRAẞE 7"],
  ])("matches the capital sharp s: %s in %s", (value, description) => {
    const rules: CategoryRule[] = [
      { matchOn: "descriptionContains", value, category: "Rent" },
    ];

    expect(findCategory(transaction({ description }), rules)).toBe("Rent");
  });

  describe.each(["descriptionStartsWith", "descriptionContains"] as const)(
    "whitespace in a %s rule",
    (matchOn) => {
      const rule = (value: string): CategoryRule[] => [
        { matchOn, value, category: "Groceries" },
      ];

      it("matches a run in the row where the rule has one space", () => {
        expect(
          findCategory(
            transaction({ description: "EXAMPLE     MARKET 42" }),
            rule("EXAMPLE MARKET"),
          ),
        ).toBe("Groceries");
      });

      it("matches one space in the row where the rule has a run", () => {
        expect(findCategory(transaction(), rule("EXAMPLE   MARKET"))).toBe(
          "Groceries",
        );
      });

      it("still ignores case", () => {
        expect(
          findCategory(
            transaction({ description: "EXAMPLE    MARKET 42" }),
            rule("example market"),
          ),
        ).toBe("Groceries");
      });

      it("still needs a space where the rule has one", () => {
        expect(
          findCategory(
            transaction({ description: "EXAMPLEMARKET 42" }),
            rule("EXAMPLE MARKET"),
          ),
        ).toBeUndefined();
      });

      it.each(OTHER_WHITESPACE)("matches %s in the row", (_, whitespace) => {
        expect(
          findCategory(
            transaction({ description: `EXAMPLE${whitespace}MARKET 42` }),
            rule("EXAMPLE MARKET"),
          ),
        ).toBe("Groceries");
      });

      it.each(OTHER_WHITESPACE)(
        "matches %s in a rule copied from the bank text the row was cleaned from",
        (_, whitespace) => {
          const copied = `EXAMPLE${whitespace}MARKET`;

          expect(
            findCategory(
              transaction({ description: redactText(`${copied} 42`) }),
              rule(copied),
            ),
          ).toBe("Groceries");
        },
      );
    },
  );

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

  describe("a first match with no category", () => {
    it.each([null, "", "   ", "\t\n"])("gives null for %j", (category) => {
      const rules: CategoryRule[] = [
        { matchOn: "descriptionContains", value: "MARKET", category },
      ];

      expect(findCategory(transaction(), rules)).toBeNull();
    });

    it("stops a later rule from giving one", () => {
      const rules: CategoryRule[] = [
        { matchOn: "ppdId", value: "PPD0001", category: null },
        { matchOn: "descriptionContains", value: "MARKET", category: "Dining" },
      ];

      expect(findCategory(transaction({ ppdId: "PPD0001" }), rules)).toBeNull();
    });

    it("has no say when it doesn't match", () => {
      const rules: CategoryRule[] = [
        { matchOn: "ppdId", value: "PPD0001", category: null },
        { matchOn: "descriptionContains", value: "MARKET", category: "Dining" },
      ];

      expect(findCategory(transaction(), rules)).toBe("Dining");
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
