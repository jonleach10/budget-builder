import { describe, expect, it, vi } from "vitest";
import type { StoredTransactionRow } from "@/features/import/storedTransactions";
import { loadReviewInbox } from "./loadReviewInbox";

const session = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/features/auth/requireSession", () => ({
  serverClient: async () => session.client,
}));

// One reply serves both account reads, so each row has every column either asks for.
const ACCOUNTS = [
  { id: "acct-1", name: "Joint Checking", country: "US", format: "chase-bank" },
  { id: "acct-2", name: "Joint Savings", country: "US", format: "chase-bank" },
];
const CATEGORIES = [{ id: "cat-groceries", name: "Groceries", position: 0 }];

function storedRow(
  id: string,
  posted_on: string,
  extra: Partial<StoredTransactionRow> = {},
): StoredTransactionRow {
  return {
    id,
    account_id: "acct-1",
    fingerprint: `fingerprint-${id}`,
    posted_on,
    purchased_on: null,
    amount_minor: -1199,
    currency: "USD",
    description: "SYNTHETIC SHOP",
    purpose: null,
    original_amount_minor: null,
    original_currency: null,
    original_rate: null,
    bank_type: null,
    bank_category: null,
    ppd_id: null,
    ordering_party_id: null,
    transfer_number: null,
    balance_minor: null,
    base_amount_minor: -1199,
    base_currency: "USD",
    type: null,
    category_id: null,
    category_source: null,
    suggested_category_id: null,
    note: null,
    hidden: false,
    possible_duplicate: false,
    transfer_pair_id: null,
    ...extra,
  };
}

/** Reads every stored row in one page, or fails with row text in the error. */
function fakeClient(rows: readonly StoredTransactionRow[], failing = false) {
  const reply = (data: unknown) =>
    failing
      ? { data: null, error: { message: "SYNTHETIC SECRET ROW TEXT" } }
      : { data, error: null };

  return {
    from(table: string) {
      if (table === "accounts" || table === "categories") {
        return {
          select: () =>
            Promise.resolve(reply(table === "accounts" ? ACCOUNTS : CATEGORIES)),
        };
      }
      const builder = {
        select: () => builder,
        order: () => builder,
        range: () => builder,
        then(onDone: (value: unknown) => unknown) {
          return Promise.resolve(reply(rows)).then(onDone);
        },
      };
      return builder;
    },
  };
}

describe("loadReviewInbox", () => {
  it("reads rows from every month, and learns from confirmed ones", async () => {
    session.client = fakeClient([
      storedRow("confirmed", "2025-03-02", {
        type: "spending",
        category_id: "cat-groceries",
        category_source: "manual",
      }),
      storedRow("open-old", "2025-11-30"),
      storedRow("open-new", "2026-10-05"),
    ]);

    const inbox = await loadReviewInbox("2026-11");

    expect(inbox?.left).toBe(2);
    expect(inbox?.groups[0].rows.map(({ id, date }) => [id, date])).toEqual([
      ["open-new", "Oct 5"],
      ["open-old", "Nov 30, 2025"],
    ]);
    expect(inbox?.groups[0].suggestion?.name).toBe("Groceries");
  });

  it("reads each account's format, so rows on two accounts can match", async () => {
    session.client = fakeClient([
      storedRow("out", "2026-10-05", { amount_minor: -50000, base_amount_minor: -50000 }),
      storedRow("in", "2026-10-06", {
        account_id: "acct-2",
        amount_minor: 50000,
        base_amount_minor: 50000,
      }),
    ]);

    const inbox = await loadReviewInbox("2026-11");

    expect(inbox?.transfers.map(({ key }) => key)).toEqual(["in,out"]);
  });

  it("gives null when a read fails, so the inbox never claims to be done", async () => {
    session.client = fakeClient([storedRow("row-1", "2026-10-05")], true);

    expect(await loadReviewInbox("2026-11")).toBeNull();
  });
});
