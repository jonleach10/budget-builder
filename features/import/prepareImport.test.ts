import { describe, expect, it, vi } from "vitest";
import { FxError } from "@/features/fx/errors";
import type { RatesByDate } from "@/features/fx/findRate";
import {
  accounts,
  commerzbankFileName,
  loadFixture,
  passThroughHash,
} from "./__fixtures__/load";
import { parseStatement } from "./parseStatement";
import { prepareImport, summarizeImport } from "./prepareImport";
import type { ParsedStatement, Transaction } from "./types";

// Later than every row these tests expect to be stored.
const TODAY = "2026-12-31";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    accountId: "account-1",
    fingerprint: "v1:synthetic",
    repeatIndex: 0,
    postedOn: "2026-10-05",
    amount: { minor: -1250, currency: "USD" },
    description: "SYNTHETIC SHOP",
    ...overrides,
  };
}

function euros(minor: number, postedOn: string): Transaction {
  return transaction({ postedOn, amount: { minor, currency: "EUR" } });
}

function statement(
  transactions: Transaction[],
  ignoredPendingCount = 0,
): ParsedStatement {
  return {
    accountId: "account-1",
    format: "chase-bank",
    transactions,
    ignoredPendingCount,
  };
}

/** Answers like the rate source, one row per saved date in the requested range. */
function rateSource(rates: Record<string, number>) {
  return vi.fn(async (url: string | URL | Request) => {
    const query = new URL(String(url)).searchParams;
    const from = query.get("from") ?? "";
    const to = query.get("to") ?? "";
    const rows = Object.entries(rates)
      .filter(([date]) => date >= from && date <= to)
      .map(([date, rate]) => ({ date, base: "EUR", quote: "USD", rate }));
    return new Response(JSON.stringify(rows));
  });
}

function prepare(
  transactions: Transaction[],
  saved: RatesByDate,
  fetch: ReturnType<typeof rateSource>,
) {
  return prepareImport({
    statements: [statement(transactions)],
    readSavedRates: async () => saved,
    fetch: fetch as unknown as typeof globalThis.fetch,
    today: TODAY,
  });
}

/** Every weekday from 2026-09-24 to 2026-10-05, the range of an Oct 5 row. */
const FULL_RANGE: RatesByDate = {
  "2026-09-24": "1.10",
  "2026-09-25": "1.10",
  "2026-09-28": "1.10",
  "2026-09-29": "1.10",
  "2026-09-30": "1.10",
  "2026-10-01": "1.10",
  "2026-10-02": "1.10",
  "2026-10-05": "1.20",
};

function savedExcept(...dates: string[]): RatesByDate {
  return Object.fromEntries(
    Object.entries(FULL_RANGE).filter(([date]) => !dates.includes(date)),
  );
}

describe("prepareImport", () => {
  describe("rows in USD", () => {
    it("store their own amount at a rate of 1, with no rate lookups", async () => {
      const fetch = rateSource({});
      const readSavedRates = vi.fn(async () => ({}));

      const { rows, rates } = await prepareImport({
        statements: [statement([transaction()])],
        readSavedRates,
        fetch: fetch as unknown as typeof globalThis.fetch,
        today: TODAY,
      });

      expect(rows[0]).toMatchObject({
        amount_minor: -1250,
        currency: "USD",
        base_amount_minor: -1250,
        base_currency: "USD",
        base_rate: "1",
      });
      expect(rates).toEqual([]);
      expect(readSavedRates).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("rows in EUR", () => {
    it("convert at the rate for the posted date", async () => {
      const { rows } = await prepare(
        [euros(-10000, "2026-10-05")],
        FULL_RANGE,
        rateSource({}),
      );

      // 100.00 EUR at 1.20 is 120.00 USD.
      expect(rows[0]).toMatchObject({
        amount_minor: -10000,
        currency: "EUR",
        base_amount_minor: -12000,
        base_currency: "USD",
        base_rate: "1.20",
      });
    });

    it("use Friday's rate for a row posted on Sunday", async () => {
      const { rows } = await prepare(
        [euros(-10000, "2026-10-04")],
        { ...FULL_RANGE, "2026-10-02": "1.15" },
        rateSource({}),
      );

      expect(rows[0].base_rate).toBe("1.15");
      expect(rows[0].base_amount_minor).toBe(-11500);
    });
  });

  describe("the rate range", () => {
    it("runs from 7 days before the first of the earliest month to the latest date", async () => {
      const readSavedRates = vi.fn(async () => ({ "2026-10-15": "1.10" }));

      await prepareImport({
        statements: [
          statement([euros(-1, "2026-10-15"), euros(-1, "2026-09-20")]),
        ],
        readSavedRates,
        fetch: rateSource({}) as unknown as typeof globalThis.fetch,
        today: TODAY,
      }).catch(() => undefined);

      expect(readSavedRates).toHaveBeenCalledWith("2026-08-25", "2026-10-15");
    });

    it("looks only at EUR rows", async () => {
      const readSavedRates = vi.fn(async () => FULL_RANGE);

      await prepareImport({
        statements: [
          statement([
            euros(-1, "2026-10-05"),
            transaction({ postedOn: "2026-01-02" }),
            transaction({ postedOn: "2026-12-30" }),
          ]),
        ],
        readSavedRates,
        fetch: rateSource({}) as unknown as typeof globalThis.fetch,
        today: TODAY,
      });

      expect(readSavedRates).toHaveBeenCalledWith("2026-09-24", "2026-10-05");
    });
  });

  describe("fetching rates", () => {
    it("fetches nothing when every weekday has a saved rate", async () => {
      const fetch = rateSource({});

      await prepare([euros(-1, "2026-10-05")], FULL_RANGE, fetch);

      expect(fetch).not.toHaveBeenCalled();
    });

    it("fetches only from the first missing weekday to the last", async () => {
      const fetch = rateSource({ "2026-10-02": 1.3, "2026-10-05": 1.4 });
      const saved = savedExcept("2026-10-02", "2026-10-05");

      await prepare([euros(-1, "2026-10-05")], saved, fetch);

      expect(fetch).toHaveBeenCalledTimes(1);
      const query = new URL(String(fetch.mock.calls[0][0])).searchParams;
      expect(query.get("from")).toBe("2026-10-02");
      expect(query.get("to")).toBe("2026-10-05");
    });

    it("doesn't fall back on an older saved rate when a newer one exists", async () => {
      const { rows } = await prepare(
        [euros(-10000, "2026-10-05")],
        savedExcept("2026-10-05"),
        rateSource({ "2026-10-05": 1.25 }),
      );

      expect(rows[0].base_rate).toBe("1.25");
    });

    it("returns only the rates that aren't saved yet", async () => {
      const { rates } = await prepare(
        [euros(-1, "2026-10-05")],
        savedExcept("2026-10-05"),
        rateSource({ "2026-10-05": 1.25 }),
      );

      expect(rates).toEqual([
        { rate_date: "2026-10-05", base: "EUR", quote: "USD", rate: "1.25" },
      ]);
    });

    it("keeps a saved rate over a fetched one", async () => {
      const { rates, rows } = await prepare(
        [euros(-10000, "2026-10-01"), euros(-10000, "2026-10-05")],
        { ...savedExcept("2026-09-30", "2026-10-02"), "2026-10-01": "1.15" },
        rateSource({ "2026-09-30": 9, "2026-10-01": 9, "2026-10-02": 9 }),
      );

      expect(rows[0].base_rate).toBe("1.15");
      expect(rates.map((rate) => rate.rate_date)).toEqual([
        "2026-09-30",
        "2026-10-02",
      ]);
    });
  });

  describe("when no rate can be had", () => {
    it("fails on a row with no rate within 7 days", async () => {
      const error = await prepare(
        [euros(-1, "2026-10-05")],
        {},
        rateSource({}),
      ).catch((e) => e);

      expect(error).toBeInstanceOf(FxError);
      expect(error.reason).toBe("no-rate");
    });

    it("fails when the fetch fails", async () => {
      const fetch = vi.fn(async () => new Response("", { status: 500 }));

      const error = await prepareImport({
        statements: [statement([euros(-1, "2026-10-05")])],
        readSavedRates: async () => ({}),
        fetch: fetch as unknown as typeof globalThis.fetch,
        today: TODAY,
      }).catch((e) => e);

      expect(error).toBeInstanceOf(FxError);
      expect(error.reason).toBe("request-failed");
    });

    it("fails on a currency with no rate source", async () => {
      const row = transaction({ amount: { minor: -1, currency: "GBP" } });

      const error = await prepare([row], {}, rateSource({})).catch((e) => e);

      expect(error).toBeInstanceOf(FxError);
      expect(error.reason).toBe("no-rate");
    });
  });

  describe("row columns", () => {
    it("carries every field the bank gave", async () => {
      const { rows } = await prepare(
        [
          transaction({
            purchasedOn: "2026-10-04",
            purpose: "SYNTHETIC MEMO",
            original: {
              amount: { minor: -1100, currency: "EUR" },
              rate: "1.13",
            },
            bankType: "DEBIT_CARD",
            bankCategory: "Shopping",
            ppdId: "1000000001",
            orderingPartyId: "DE00ZZZ00001234567",
            transferNumber: "20000000002",
            balance: { minor: 500000, currency: "USD" },
          }),
        ],
        {},
        rateSource({}),
      );

      expect(rows[0]).toEqual({
        account_id: "account-1",
        fingerprint: "v1:synthetic",
        posted_on: "2026-10-05",
        purchased_on: "2026-10-04",
        amount_minor: -1250,
        currency: "USD",
        description: "SYNTHETIC SHOP",
        purpose: "SYNTHETIC MEMO",
        original_amount_minor: -1100,
        original_currency: "EUR",
        original_rate: "1.13",
        bank_type: "DEBIT_CARD",
        bank_category: "Shopping",
        ppd_id: "1000000001",
        ordering_party_id: "DE00ZZZ00001234567",
        transfer_number: "20000000002",
        balance_minor: 500000,
        base_amount_minor: -1250,
        base_currency: "USD",
        base_rate: "1",
        possible_duplicate: false,
      });
    });

    it("flags only the second and later identical rows", async () => {
      const { rows } = await prepare(
        [
          transaction({ repeatIndex: 0 }),
          transaction({ repeatIndex: 1 }),
          transaction({ repeatIndex: 2 }),
        ],
        {},
        rateSource({}),
      );

      expect(rows.map((row) => row.possible_duplicate)).toEqual([
        false,
        true,
        true,
      ]);
    });

    it("joins the rows of every file and adds their pending counts", async () => {
      const { rows, ignoredPendingCount } = await prepareImport({
        statements: [
          statement([transaction()], 2),
          statement([transaction({ accountId: "account-2" })], 3),
        ],
        readSavedRates: async () => ({}),
        fetch: rateSource({}) as unknown as typeof globalThis.fetch,
        today: TODAY,
      });

      expect(rows.map((row) => row.account_id)).toEqual([
        "account-1",
        "account-2",
      ]);
      expect(ignoredPendingCount).toBe(5);
    });
  });

  describe("rows dated after today", () => {
    const today = "2026-10-05";

    function prepareOn(
      transactions: Transaction[],
      saved: RatesByDate,
      fetch: ReturnType<typeof rateSource>,
      ignoredPending = 0,
    ) {
      return prepareImport({
        statements: [statement(transactions, ignoredPending)],
        readSavedRates: async () => saved,
        fetch: fetch as unknown as typeof globalThis.fetch,
        today,
      });
    }

    it("are left out and counted with the pending rows", async () => {
      const { rows, ignoredPendingCount } = await prepareOn(
        [euros(-1, "2026-10-05"), euros(-90000, "2026-10-16")],
        FULL_RANGE,
        rateSource({}),
        2,
      );

      expect(rows.map((row) => row.posted_on)).toEqual(["2026-10-05"]);
      expect(ignoredPendingCount).toBe(3);
    });

    it("are left out when they're in USD too", async () => {
      const { rows, ignoredPendingCount } = await prepareOn(
        [transaction({ postedOn: "2026-10-06" })],
        {},
        rateSource({}),
      );

      expect(rows).toEqual([]);
      expect(ignoredPendingCount).toBe(1);
    });

    it("don't extend the rate range", async () => {
      const readSavedRates = vi.fn(async () => FULL_RANGE);
      const fetch = rateSource({});

      await prepareImport({
        statements: [
          statement([euros(-1, "2026-10-05"), euros(-1, "2026-10-16")]),
        ],
        readSavedRates,
        fetch: fetch as unknown as typeof globalThis.fetch,
        today,
      });

      expect(readSavedRates).toHaveBeenCalledWith("2026-09-24", "2026-10-05");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("need no rate when no other EUR row is in the upload", async () => {
      const readSavedRates = vi.fn(async () => ({}));
      const fetch = rateSource({});

      const { rows, rates } = await prepareImport({
        statements: [statement([euros(-1, "2026-10-16")])],
        readSavedRates,
        fetch: fetch as unknown as typeof globalThis.fetch,
        today,
      });

      expect(rows).toEqual([]);
      expect(rates).toEqual([]);
      expect(readSavedRates).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("are stored by a later import, once the date has come", async () => {
      const row = euros(-90000, "2026-10-05");

      const early = await prepareImport({
        statements: [statement([row])],
        readSavedRates: async () => FULL_RANGE,
        fetch: rateSource({}) as unknown as typeof globalThis.fetch,
        today: "2026-10-04",
      });
      const later = await prepareOn([row], FULL_RANGE, rateSource({}));

      expect(early.rows).toEqual([]);
      expect(later.rows.map((stored) => stored.posted_on)).toEqual([
        "2026-10-05",
      ]);
    });

    it("don't stop the Commerzbank fixture, which has one", async () => {
      const parsed = await parseStatement({
        fileName: commerzbankFileName,
        text: loadFixture(commerzbankFileName),
        accounts,
        hash: passThroughHash,
      });
      const fetch = rateSource({ "2026-10-07": 1.1, "2026-10-12": 1.1 });

      const { rows, ignoredPendingCount } = await prepareImport({
        statements: [parsed],
        readSavedRates: async () => ({}),
        fetch: fetch as unknown as typeof globalThis.fetch,
        today: "2026-10-31",
      });

      // Six booked rows, one of them dated 2030, and two pending rows.
      expect(rows).toHaveLength(5);
      expect(rows.map((row) => row.posted_on)).not.toContain("2030-11-05");
      expect(ignoredPendingCount).toBe(3);
    });
  });

  describe("a row dated today", () => {
    it("is stored", async () => {
      const { rows, ignoredPendingCount } = await prepareImport({
        statements: [statement([euros(-1, "2026-10-05")])],
        readSavedRates: async () => FULL_RANGE,
        fetch: rateSource({}) as unknown as typeof globalThis.fetch,
        today: "2026-10-05",
      });

      expect(rows).toHaveLength(1);
      expect(ignoredPendingCount).toBe(0);
    });
  });
});

describe("summarizeImport", () => {
  it("joins the stored counts with the ignored pending count", () => {
    expect(
      summarizeImport({ new: 7, skipped: 2, possible_duplicates: 1 }, 3),
    ).toEqual({
      newRows: 7,
      skippedRows: 2,
      possibleDuplicates: 1,
      ignoredPending: 3,
    });
  });
});
