import { describe, expect, it, vi } from "vitest";
import type { StoredTransactionRow } from "@/features/import/storedTransactions";
import { loadTransactionsScreen, monthRange } from "./loadTransactions";

const session = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/features/auth/requireSession", () => ({
  serverClient: async () => session.client,
}));

const SERVER_LIMIT = 1000;

const ACCOUNTS = [{ id: "acct-1", name: "Joint Checking", country: "US" }];
const CATEGORIES = [{ id: "cat-groceries", name: "Groceries", position: 0 }];

function storedRow(id: string, posted_on = "2026-10-05"): StoredTransactionRow {
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
    type: "spending",
    category_id: "cat-groceries",
    category_source: "manual",
    suggested_category_id: null,
    note: null,
    hidden: false,
    possible_duplicate: false,
    transfer_pair_id: null,
  };
}

/** Behaves as Supabase's API does: no reply holds more than the server limit. */
function fakeClient(rows: readonly StoredTransactionRow[], failing = false) {
  function listReply(data: unknown) {
    return {
      select: () =>
        Promise.resolve(
          failing
            ? { data: null, error: { message: "SYNTHETIC SECRET ROW TEXT" } }
            : { data, error: null },
        ),
    };
  }

  function transactions() {
    const tests: ((row: StoredTransactionRow) => boolean)[] = [];
    let first = 0;
    let last = rows.length;

    const builder = {
      select: () => builder,
      gte(_column: "posted_on", value: string) {
        tests.push((row) => row.posted_on >= value);
        return builder;
      },
      lte(_column: "posted_on", value: string) {
        tests.push((row) => row.posted_on <= value);
        return builder;
      },
      order: () => builder,
      range(start: number, end: number) {
        first = start;
        last = end;
        return builder;
      },
      then(
        onDone: (reply: unknown) => unknown,
        onFailed: (reason: unknown) => unknown,
      ) {
        const reply = {
          data: rows
            .filter((row) => tests.every((test) => test(row)))
            .slice(first, Math.min(last + 1, first + SERVER_LIMIT)),
          error: null,
        };
        return Promise.resolve(reply).then(onDone, onFailed);
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === "accounts") return listReply(ACCOUNTS);
      if (table === "categories") return listReply(CATEGORIES);
      return transactions();
    },
  };
}

describe("monthRange", () => {
  it("covers a month from its first day to its last", () => {
    expect(monthRange("2026-10")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("handles a leap February", () => {
    expect(monthRange("2028-02").to).toBe("2028-02-29");
  });

  it("handles December, which ends a year", () => {
    expect(monthRange("2026-12").to).toBe("2026-12-31");
  });
});

describe("loadTransactionsScreen", () => {
  it("reads past one page of results", async () => {
    session.client = fakeClient(
      Array.from({ length: SERVER_LIMIT + 200 }, (_, index) =>
        storedRow(`row-${index}`),
      ),
    );

    const screen = await loadTransactionsScreen("2026-10");

    expect(screen?.lines).toHaveLength(SERVER_LIMIT + 200);
  });

  it("reads only the month asked for, including its first and last day", async () => {
    session.client = fakeClient([
      storedRow("before", "2026-09-30"),
      storedRow("first", "2026-10-01"),
      storedRow("last", "2026-10-31"),
      storedRow("after", "2026-11-01"),
    ]);

    const screen = await loadTransactionsScreen("2026-10");

    expect(screen?.lines.map(({ id }) => id)).toEqual(["last", "first"]);
  });

  it("gives the accounts and categories for the filters", async () => {
    session.client = fakeClient([]);

    expect(await loadTransactionsScreen("2026-10")).toEqual({
      lines: [],
      accounts: [{ id: "acct-1", name: "Joint Checking" }],
      categories: [{ id: "cat-groceries", name: "Groceries" }],
    });
  });

  it("gives null when a read fails, so the screen never claims the month is empty", async () => {
    session.client = fakeClient([storedRow("row-1")], true);

    expect(await loadTransactionsScreen("2026-10")).toBeNull();
  });
});
