import { describe, expect, it } from "vitest";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import { keepOpenInPlace } from "./groupOrder";
import { buildReviewInbox, type MerchantGroup } from "./reviewInbox";

let nextId = 0;

function row(description: string): StoredTransaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    accountId: "acc-us",
    fingerprint: `fingerprint-${nextId}`,
    postedOn: "2026-10-03",
    amount: { minor: -4000, currency: "USD" },
    base: { minor: -4000, currency: "USD" },
    description,
    type: null,
    categoryId: null,
    categorySource: null,
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
  };
}

function rows(description: string, count: number): StoredTransaction[] {
  return Array.from({ length: count }, () => row(description));
}

/** The groups as the inbox builds them, largest first. */
function groupsOf(stored: readonly StoredTransaction[]): MerchantGroup[] {
  return buildReviewInbox({
    rows: stored,
    accounts: [{ id: "acc-us", name: "Joint Checking", country: "US" }],
    pairingAccounts: [{ id: "acc-us", format: "chase-bank" }],
    categories: [],
    thisMonth: "2026-11",
  }).groups;
}

const names = (groups: readonly MerchantGroup[]) => groups.map(({ name }) => name);

describe("the open group's place", () => {
  const deli = rows("SAMPLE DELI", 3);
  const transit = rows("SAMPLE TRANSIT", 3);
  const books = rows("SAMPLE BOOKS", 2);
  const loaded = groupsOf([...deli, ...transit, ...books]);

  it("starts largest first", () => {
    expect(names(loaded)).toEqual(["SAMPLE DELI", "SAMPLE TRANSIT", "SAMPLE BOOKS"]);
  });

  it("keeps an open group where it was after its count drops", () => {
    // One SAMPLE DELI row was saved, so the inbox now sorts it last.
    const after = groupsOf([...deli.slice(1), ...transit, ...books]);
    expect(names(after)).toEqual(["SAMPLE TRANSIT", "SAMPLE BOOKS", "SAMPLE DELI"]);

    const shown = keepOpenInPlace(after, { key: loaded[0].key, index: 0 });

    expect(names(shown)).toEqual(["SAMPLE DELI", "SAMPLE TRANSIT", "SAMPLE BOOKS"]);
    expect(shown[0].count).toBe(2);
  });

  it("orders largest first again once no group is open", () => {
    const after = groupsOf([...deli.slice(1), ...transit, ...books]);

    expect(names(keepOpenInPlace(after, null))).toEqual([
      "SAMPLE TRANSIT",
      "SAMPLE BOOKS",
      "SAMPLE DELI",
    ]);
  });

  it("orders largest first once the open group has left the inbox", () => {
    const after = groupsOf([...transit, ...books]);

    expect(
      names(keepOpenInPlace(after, { key: loaded[0].key, index: 0 })),
    ).toEqual(["SAMPLE TRANSIT", "SAMPLE BOOKS"]);
  });

  it("keeps a group opened lower down at its place", () => {
    // SAMPLE TRANSIT was opened second, then lost two rows.
    const after = groupsOf([...deli, transit[0], ...books]);

    expect(
      names(keepOpenInPlace(after, { key: loaded[1].key, index: 1 })),
    ).toEqual(["SAMPLE DELI", "SAMPLE TRANSIT", "SAMPLE BOOKS"]);
  });

  it("puts the open group last when the list got shorter than its place", () => {
    // SAMPLE BOOKS was third; SAMPLE TRANSIT left the inbox meanwhile.
    const after = groupsOf([...deli, books[0]]);

    expect(
      names(keepOpenInPlace(after, { key: loaded[2].key, index: 2 })),
    ).toEqual(["SAMPLE DELI", "SAMPLE BOOKS"]);
  });
});
