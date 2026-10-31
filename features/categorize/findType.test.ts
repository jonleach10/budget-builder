import { describe, expect, it } from "vitest";
import type { Transaction } from "@/features/import/types";
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

describe("findType", () => {
  it("gives the rule's type when the ppdId equals its value", () => {
    const rules: MatchingRule[] = [
      { matchOn: "ppdId", value: "PPD0001", type: "income" },
    ];

    expect(findType(transaction({ ppdId: "PPD0001" }), rules)).toBe("income");
  });

  it("gives the rule's type when the orderingPartyId equals its value", () => {
    const rules: MatchingRule[] = [
      { matchOn: "orderingPartyId", value: "ORDER0001", type: "saved" },
    ];

    expect(
      findType(transaction({ orderingPartyId: "ORDER0001" }), rules),
    ).toBe("saved");
  });

  it("gives undefined when no rule matches", () => {
    const rules: MatchingRule[] = [
      { matchOn: "ppdId", value: "PPD0001", type: "income" },
      { matchOn: "orderingPartyId", value: "ORDER0001", type: "saved" },
    ];

    expect(
      findType(
        transaction({ ppdId: "PPD0002", orderingPartyId: "ORDER0002" }),
        rules,
      ),
    ).toBeUndefined();
  });

  it("gives undefined when there are no rules", () => {
    expect(findType(transaction(), [])).toBeUndefined();
  });

  it("doesn't match an ID value against the other ID field", () => {
    const rules: MatchingRule[] = [
      { matchOn: "ppdId", value: "SHARED0001", type: "income" },
    ];

    expect(
      findType(transaction({ orderingPartyId: "SHARED0001" }), rules),
    ).toBeUndefined();
  });

  describe("description starts with", () => {
    const rules: MatchingRule[] = [
      { matchOn: "descriptionStartsWith", value: "EXAMPLE", type: "spending" },
    ];

    it("matches text at the start", () => {
      expect(
        findType(transaction({ description: "EXAMPLE MARKET 42" }), rules),
      ).toBe("spending");
    });

    it("doesn't match the same text later on", () => {
      expect(
        findType(transaction({ description: "AN EXAMPLE MARKET" }), rules),
      ).toBeUndefined();
    });
  });

  describe("description contains", () => {
    const rules: MatchingRule[] = [
      { matchOn: "descriptionContains", value: "MARKET", type: "transfer" },
    ];

    it("matches text anywhere", () => {
      expect(
        findType(transaction({ description: "EXAMPLE MARKET 42" }), rules),
      ).toBe("transfer");
    });

    it("doesn't match when the text is absent", () => {
      expect(
        findType(transaction({ description: "EXAMPLE CAFE 42" }), rules),
      ).toBeUndefined();
    });
  });

  describe("case", () => {
    it.each([
      ["descriptionStartsWith", "example market", "EXAMPLE MARKET 42"],
      ["descriptionStartsWith", "EXAMPLE MARKET", "Example Market 42"],
      ["descriptionContains", "market", "EXAMPLE MARKET 42"],
      ["descriptionContains", "MARKET", "Example Market 42"],
      ["descriptionContains", "MÜLLER", "Beispiel Müller GmbH"],
      ["descriptionContains", "STRASSE", "Beispiel Straße 7"],
      ["descriptionContains", "straße", "BEISPIEL STRASSE 7"],
    ] as const)("%s %s matches %s", (matchOn, value, description) => {
      const rules: MatchingRule[] = [{ matchOn, value, type: "spending" }];

      expect(findType(transaction({ description }), rules)).toBe("spending");
    });

    it("matches a ppdId exactly", () => {
      const rules: MatchingRule[] = [
        { matchOn: "ppdId", value: "ppd0001", type: "income" },
      ];

      expect(
        findType(transaction({ ppdId: "PPD0001" }), rules),
      ).toBeUndefined();
    });

    it("matches an orderingPartyId exactly", () => {
      const rules: MatchingRule[] = [
        { matchOn: "orderingPartyId", value: "order0001", type: "income" },
      ];

      expect(
        findType(transaction({ orderingPartyId: "ORDER0001" }), rules),
      ).toBeUndefined();
    });
  });

  describe("an empty match value", () => {
    it.each(["descriptionStartsWith", "descriptionContains"] as const)(
      "never matches on %s",
      (matchOn) => {
        const rules: MatchingRule[] = [{ matchOn, value: "", type: "saved" }];

        expect(findType(transaction(), rules)).toBeUndefined();
      },
    );

    it("never matches an empty ppdId", () => {
      const rules: MatchingRule[] = [
        { matchOn: "ppdId", value: "", type: "saved" },
      ];

      expect(findType(transaction({ ppdId: "" }), rules)).toBeUndefined();
    });

    it("never matches an empty orderingPartyId", () => {
      const rules: MatchingRule[] = [
        { matchOn: "orderingPartyId", value: "", type: "saved" },
      ];

      expect(
        findType(transaction({ orderingPartyId: "" }), rules),
      ).toBeUndefined();
    });

    it.each(["descriptionStartsWith", "descriptionContains"] as const)(
      "treats only spaces as empty on %s",
      (matchOn) => {
        const rules: MatchingRule[] = [{ matchOn, value: " ", type: "saved" }];

        expect(
          findType(transaction({ description: " EXAMPLE MARKET" }), rules),
        ).toBeUndefined();
      },
    );
  });

  describe("a transaction without an ID", () => {
    it("isn't matched by a ppdId rule", () => {
      const rules: MatchingRule[] = [
        { matchOn: "ppdId", value: "PPD0001", type: "income" },
      ];

      expect(findType(transaction(), rules)).toBeUndefined();
    });

    it("isn't matched by an orderingPartyId rule", () => {
      const rules: MatchingRule[] = [
        { matchOn: "orderingPartyId", value: "ORDER0001", type: "income" },
      ];

      expect(findType(transaction(), rules)).toBeUndefined();
    });
  });

  describe("rule order", () => {
    const both = transaction({
      description: "EXAMPLE MARKET 42",
      ppdId: "PPD0001",
      orderingPartyId: "ORDER0001",
    });

    it("tries a ppdId rule before a text rule listed first", () => {
      const rules: MatchingRule[] = [
        { matchOn: "descriptionContains", value: "MARKET", type: "spending" },
        { matchOn: "ppdId", value: "PPD0001", type: "income" },
      ];

      expect(findType(both, rules)).toBe("income");
    });

    it("tries an orderingPartyId rule before a text rule listed first", () => {
      const rules: MatchingRule[] = [
        { matchOn: "descriptionStartsWith", value: "EXAMPLE", type: "spending" },
        { matchOn: "orderingPartyId", value: "ORDER0001", type: "saved" },
      ];

      expect(findType(both, rules)).toBe("saved");
    });

    it("uses list order between ID rules", () => {
      const rules: MatchingRule[] = [
        { matchOn: "orderingPartyId", value: "ORDER0001", type: "saved" },
        { matchOn: "ppdId", value: "PPD0001", type: "income" },
      ];

      expect(findType(both, rules)).toBe("saved");
    });

    it("uses list order between text rules", () => {
      const rules: MatchingRule[] = [
        { matchOn: "descriptionContains", value: "MARKET", type: "personal" },
        { matchOn: "descriptionStartsWith", value: "EXAMPLE", type: "spending" },
      ];

      expect(findType(both, rules)).toBe("personal");
    });

    it("falls back to a text rule when no ID rule matches", () => {
      const rules: MatchingRule[] = [
        { matchOn: "ppdId", value: "PPD0002", type: "income" },
        { matchOn: "descriptionContains", value: "MARKET", type: "spending" },
      ];

      expect(findType(both, rules)).toBe("spending");
    });
  });

  it("works on rules saved as JSON and read back", () => {
    const rules: MatchingRule[] = [
      { matchOn: "ppdId", value: "PPD0001", type: "income" },
      { matchOn: "descriptionContains", value: "market", type: "spending" },
    ];
    const saved = JSON.stringify(rules);

    expect(saved).toBe(
      '[{"matchOn":"ppdId","value":"PPD0001","type":"income"},' +
        '{"matchOn":"descriptionContains","value":"market","type":"spending"}]',
    );

    const readBack = JSON.parse(saved) as MatchingRule[];

    expect(readBack).toEqual(rules);
    expect(findType(transaction(), readBack)).toBe("spending");
  });
});
