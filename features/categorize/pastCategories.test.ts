import { describe, expect, it } from "vitest";
import type { Transaction } from "@/features/import/types";
import {
  merchantKey,
  pastCategories,
  type CategorizedRow,
} from "./pastCategories";

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

function confirmed(category: string, row = transaction()): CategorizedRow {
  return { transaction: row, category, source: "manual" };
}

describe("merchantKey", () => {
  it("uses the ppdId first", () => {
    const one = transaction({
      ppdId: "PPD0001",
      orderingPartyId: "ORDER0001",
      description: "EXAMPLE MARKET 1",
    });
    const other = transaction({
      ppdId: "PPD0001",
      orderingPartyId: "ORDER0002",
      description: "EXAMPLE CAFE 2",
    });

    expect(merchantKey(one)).toBe(merchantKey(other));
  });

  it("uses the orderingPartyId when there's no ppdId", () => {
    const one = transaction({
      orderingPartyId: "ORDER0001",
      description: "EXAMPLE MARKET 1",
    });
    const other = transaction({
      orderingPartyId: "ORDER0001",
      description: "EXAMPLE CAFE 2",
    });

    expect(merchantKey(one)).toBe(merchantKey(other));
  });

  it("uses the description when there's no ID", () => {
    expect(merchantKey(transaction({ description: "EXAMPLE MARKET" }))).toBe(
      merchantKey(transaction({ description: "EXAMPLE MARKET" })),
    );
    expect(merchantKey(transaction({ description: "EXAMPLE MARKET" }))).not.toBe(
      merchantKey(transaction({ description: "EXAMPLE CAFE" })),
    );
  });

  it.each([
    ["Example Market", "EXAMPLE MARKET"],
    ["Beispiel Müller", "BEISPIEL MÜLLER"],
    ["Beispiel Straße", "BEISPIEL STRASSE"],
  ])("ignores case between %s and %s", (one, other) => {
    expect(merchantKey(transaction({ description: one }))).toBe(
      merchantKey(transaction({ description: other })),
    );
  });

  it("compares IDs exactly", () => {
    expect(merchantKey(transaction({ ppdId: "ppd0001" }))).not.toBe(
      merchantKey(transaction({ ppdId: "PPD0001" })),
    );
    expect(merchantKey(transaction({ orderingPartyId: "order0001" }))).not.toBe(
      merchantKey(transaction({ orderingPartyId: "ORDER0001" })),
    );
  });

  it("never gives a ppdId and a description with the same text the same key", () => {
    expect(merchantKey(transaction({ ppdId: "SHARED0001" }))).not.toBe(
      merchantKey(transaction({ description: "SHARED0001" })),
    );
  });

  it("never gives an orderingPartyId and a description the same key", () => {
    expect(merchantKey(transaction({ orderingPartyId: "SHARED0001" }))).not.toBe(
      merchantKey(transaction({ description: "SHARED0001" })),
    );
  });

  it("never gives a ppdId and an orderingPartyId the same key", () => {
    expect(merchantKey(transaction({ ppdId: "SHARED0001" }))).not.toBe(
      merchantKey(transaction({ orderingPartyId: "SHARED0001" })),
    );
  });

  it.each(["", "   "])("treats a ppdId of %j as missing", (ppdId) => {
    expect(
      merchantKey(transaction({ ppdId, orderingPartyId: "ORDER0001" })),
    ).toBe(merchantKey(transaction({ orderingPartyId: "ORDER0001" })));
  });

  it.each(["", "   "])("treats an orderingPartyId of %j as missing", (id) => {
    expect(
      merchantKey(
        transaction({ orderingPartyId: id, description: "EXAMPLE MARKET" }),
      ),
    ).toBe(merchantKey(transaction({ description: "EXAMPLE MARKET" })));
  });

  it.each(["", "   "])("gives no key to a description of %j", (description) => {
    expect(merchantKey(transaction({ description }))).toBeUndefined();
  });
});

describe("pastCategories", () => {
  function lookUp(rows: CategorizedRow[], row = transaction()) {
    const key = merchantKey(row);
    return key === undefined ? undefined : pastCategories(rows)[key];
  }

  it("gives an empty lookup for no rows", () => {
    expect(pastCategories([])).toEqual({});
  });

  it("gives a merchant its confirmed category", () => {
    expect(lookUp([confirmed("Groceries")])).toBe("Groceries");
  });

  it("finds the category for another row from the same merchant", () => {
    const rows = [confirmed("Groceries", transaction({ ppdId: "PPD0001" }))];
    const later = transaction({
      ppdId: "PPD0001",
      description: "EXAMPLE MARKET 99",
    });

    expect(lookUp(rows, later)).toBe("Groceries");
  });

  it("keeps merchants apart", () => {
    const market = transaction({ description: "EXAMPLE MARKET" });
    const cafe = transaction({ description: "EXAMPLE CAFE" });
    const rows = [confirmed("Groceries", market), confirmed("Dining", cafe)];

    expect(lookUp(rows, market)).toBe("Groceries");
    expect(lookUp(rows, cafe)).toBe("Dining");
  });

  it("keeps a merchant confirmed with one category many times", () => {
    expect(lookUp([confirmed("Groceries"), confirmed("Groceries")])).toBe(
      "Groceries",
    );
  });

  it("has no entry for a merchant with two confirmed categories", () => {
    expect(lookUp([confirmed("Groceries"), confirmed("Dining")])).toBeUndefined();
  });

  it("doesn't bring a mixed merchant back with a third row", () => {
    const rows = [
      confirmed("Groceries"),
      confirmed("Dining"),
      confirmed("Groceries"),
    ];

    expect(lookUp(rows)).toBeUndefined();
  });

  it.each(["rule", "history", "bank-type"] as const)(
    "skips a row the chain categorized by %s",
    (source) => {
      const rows = [{ transaction: transaction(), category: "Dining", source }];

      expect(lookUp(rows)).toBeUndefined();
    },
  );

  it("doesn't let a guess make a confirmed merchant mixed", () => {
    const rows: CategorizedRow[] = [
      confirmed("Groceries"),
      { transaction: transaction(), category: "Dining", source: "history" },
    ];

    expect(lookUp(rows)).toBe("Groceries");
  });

  it("skips a row with a category but no source", () => {
    expect(
      lookUp([{ transaction: transaction(), category: "Dining" }]),
    ).toBeUndefined();
  });

  it.each(["", "   ", null, undefined])(
    "skips a confirmed row whose category is %j",
    (category) => {
      const rows: CategorizedRow[] = [
        { transaction: transaction(), category, source: "manual" },
      ];

      expect(lookUp(rows)).toBeUndefined();
    },
  );

  it("doesn't let a blank category make a confirmed merchant mixed", () => {
    expect(lookUp([confirmed("Groceries"), confirmed("  ")])).toBe("Groceries");
  });

  it("skips rows with no key, so they can't share a category", () => {
    const blank = transaction({ description: "  " });

    expect(pastCategories([confirmed("Groceries", blank)])).toEqual({});
  });

  it("gives plain data that survives JSON", () => {
    const lookup = pastCategories([confirmed("Groceries")]);

    expect(JSON.parse(JSON.stringify(lookup))).toEqual(lookup);
  });
});
