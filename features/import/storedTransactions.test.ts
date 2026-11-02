import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ReadRowsError } from "@/lib/readAllRows";
import {
  readStoredTransactions,
  type StoredTransactionRow,
} from "./storedTransactions";

const SERVER_LIMIT = 1000;

type Column = keyof StoredTransactionRow;

function storedRow(
  overrides: Partial<StoredTransactionRow> = {},
): StoredTransactionRow {
  return {
    id: "row-1",
    account_id: "acct-1",
    fingerprint: "fingerprint-1",
    posted_on: "2026-10-05",
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
    ...overrides,
  };
}

/**
 * Behaves as Supabase's API does: no request returns more than the server
 * limit, whatever range is asked for.
 */
function fakeClient(rows: readonly StoredTransactionRow[], failingRequest = 0) {
  let requests = 0;

  function from() {
    const filters: ((row: StoredTransactionRow) => boolean)[] = [];
    let first = 0;
    let last = rows.length;

    function keep(test: (row: StoredTransactionRow) => boolean) {
      filters.push(test);
      return builder;
    }

    const builder = {
      select: () => builder,
      gte: (column: Column, value: string) =>
        keep((row) => String(row[column]) >= value),
      lte: (column: Column, value: string) =>
        keep((row) => String(row[column]) <= value),
      eq: (column: Column, value: string) =>
        keep((row) => row[column] === value),
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
        requests += 1;
        const reply =
          requests === failingRequest
            ? { data: null, error: { message: "SYNTHETIC SECRET ROW TEXT" } }
            : {
                data: rows
                  .filter((row) => filters.every((test) => test(row)))
                  .slice(first, Math.min(last + 1, first + SERVER_LIMIT)),
                error: null,
              };
        return Promise.resolve(reply).then(onDone, onFailed);
      },
    };
    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

function manyRows(count: number): StoredTransactionRow[] {
  return Array.from({ length: count }, (_, index) =>
    storedRow({ id: `row-${index}`, fingerprint: `fingerprint-${index}` }),
  );
}

describe("readStoredTransactions", () => {
  it("gives a stored row back as a Transaction with its review state", async () => {
    const row = storedRow({
      purchased_on: "2026-10-03",
      amount_minor: -5420,
      currency: "USD",
      purpose: "SYNTHETIC PURPOSE",
      original_amount_minor: -5000,
      original_currency: "EUR",
      original_rate: "1.084",
      bank_type: "DEBIT_CARD",
      bank_category: "Shopping",
      ppd_id: "PPD0001",
      ordering_party_id: "ORDER0001",
      transfer_number: "T0001",
      balance_minor: 120000,
      base_amount_minor: -5420,
      type: "spending",
      category_id: "cat-1",
      category_source: "manual",
      suggested_category_id: "cat-2",
      note: "SYNTHETIC LABEL",
      hidden: true,
      possible_duplicate: true,
      transfer_pair_id: "pair-1",
    });

    await expect(
      readStoredTransactions(fakeClient([row])),
    ).resolves.toStrictEqual([
      {
        id: "row-1",
        accountId: "acct-1",
        fingerprint: "fingerprint-1",
        postedOn: "2026-10-05",
        purchasedOn: "2026-10-03",
        amount: { minor: -5420, currency: "USD" },
        description: "SYNTHETIC SHOP",
        purpose: "SYNTHETIC PURPOSE",
        original: {
          amount: { minor: -5000, currency: "EUR" },
          rate: "1.084",
        },
        bankType: "DEBIT_CARD",
        bankCategory: "Shopping",
        ppdId: "PPD0001",
        orderingPartyId: "ORDER0001",
        transferNumber: "T0001",
        balance: { minor: 120000, currency: "USD" },
        base: { minor: -5420, currency: "USD" },
        type: "spending",
        categoryId: "cat-1",
        categorySource: "manual",
        suggestedCategoryId: "cat-2",
        note: "SYNTHETIC LABEL",
        hidden: true,
        possibleDuplicate: true,
        transferPairId: "pair-1",
      },
    ]);
  });

  it("leaves out bank fields the row doesn't have", async () => {
    const [transaction] = await readStoredTransactions(
      fakeClient([storedRow()]),
    );

    expect(transaction.purpose).toBeUndefined();
    expect(transaction.original).toBeUndefined();
    expect(transaction.balance).toBeUndefined();
    expect(transaction.ppdId).toBeUndefined();
  });

  it("keeps a foreign row's base amount apart from its own amount", async () => {
    const [transaction] = await readStoredTransactions(
      fakeClient([
        storedRow({
          amount_minor: -1200,
          currency: "EUR",
          base_amount_minor: -1314,
          base_currency: "USD",
        }),
      ]),
    );

    expect(transaction.amount).toEqual({ minor: -1200, currency: "EUR" });
    expect(transaction.base).toEqual({ minor: -1314, currency: "USD" });
  });

  it("keeps a balance of zero", async () => {
    const [transaction] = await readStoredTransactions(
      fakeClient([storedRow({ balance_minor: 0 })]),
    );

    expect(transaction.balance).toEqual({ minor: 0, currency: "USD" });
  });

  it("keeps an original amount that has no rate", async () => {
    const [transaction] = await readStoredTransactions(
      fakeClient([
        storedRow({ original_amount_minor: -5000, original_currency: "EUR" }),
      ]),
    );

    expect(transaction.original).toEqual({
      amount: { minor: -5000, currency: "EUR" },
    });
  });

  it("reads past one page of results", async () => {
    const stored = await readStoredTransactions(fakeClient(manyRows(1500)));

    expect(stored).toHaveLength(1500);
    expect(stored[1499].id).toBe("row-1499");
  });

  it("gives no partial result and no row text when a page fails", async () => {
    const failure = await readStoredTransactions(
      fakeClient(manyRows(1500), 2),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ReadRowsError);
    expect(String(failure)).not.toContain("SYNTHETIC");
  });

  describe("narrowing", () => {
    const rows = [
      storedRow({ id: "before", posted_on: "2026-09-30" }),
      storedRow({
        id: "first-day",
        posted_on: "2026-10-01",
        category_source: "manual",
      }),
      storedRow({
        id: "last-day",
        posted_on: "2026-10-31",
        category_source: "rule",
      }),
      storedRow({
        id: "after",
        posted_on: "2026-11-01",
        category_source: "manual",
      }),
    ];
    const client = fakeClient(rows);

    async function idsOf(
      filter: Parameters<typeof readStoredTransactions>[1],
    ): Promise<string[]> {
      const stored = await readStoredTransactions(client, filter);
      return stored.map(({ id }) => id);
    }

    it("reads every row when nothing narrows it", async () => {
      await expect(idsOf({})).resolves.toEqual([
        "before",
        "first-day",
        "last-day",
        "after",
      ]);
    });

    it("includes both ends of a date range", async () => {
      await expect(
        idsOf({ from: "2026-10-01", to: "2026-10-31" }),
      ).resolves.toEqual(["first-day", "last-day"]);
    });

    it("takes a range open at one end", async () => {
      await expect(idsOf({ from: "2026-10-31" })).resolves.toEqual([
        "last-day",
        "after",
      ]);
      await expect(idsOf({ to: "2026-10-01" })).resolves.toEqual([
        "before",
        "first-day",
      ]);
    });

    it("reads only rows with a manual source", async () => {
      await expect(idsOf({ manualOnly: true })).resolves.toEqual([
        "first-day",
        "after",
      ]);
    });

    it("applies a date range and manual source together", async () => {
      await expect(
        idsOf({ to: "2026-10-31", manualOnly: true }),
      ).resolves.toEqual(["first-day"]);
    });
  });
});
