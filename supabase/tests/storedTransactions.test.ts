import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareImport } from "@/features/import/prepareImport";
import {
  STORED_COLUMNS,
  toStoredTransaction,
  type StoredTransactionRow,
} from "@/features/import/storedTransactions";
import type { Transaction } from "@/features/import/types";
import { createTestDatabase, OWNER, runAs, withMfa } from "./harness";

// PGlite turns a date into a Date object. Supabase's API sends it as text.
const DATE_TYPE = 1082;

/** Every bank field filled in. All values are synthetic. */
const EVERY_FIELD: Transaction = {
  accountId: OWNER.accountId,
  fingerprint: "round-trip",
  postedOn: "2026-10-05",
  purchasedOn: "2026-10-03",
  amount: { minor: -5420, currency: "USD" },
  description: "SYNTHETIC  SHOP",
  purpose: "SYNTHETIC PURPOSE",
  original: { amount: { minor: -5000, currency: "EUR" }, rate: "1.084" },
  bankType: "DEBIT_CARD",
  bankCategory: "Shopping",
  ppdId: "PPD0001",
  orderingPartyId: "ORDER0001",
  transferNumber: "T0001",
  balance: { minor: 120000, currency: "USD" },
};

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

async function importAndRead(row: Transaction) {
  const { rows } = await prepareImport({
    statements: [
      {
        accountId: row.accountId,
        format: "chase-bank",
        transactions: [row],
        ignoredPendingCount: 0,
      },
    ],
    readSavedRates: async () => ({}),
    fetch: globalThis.fetch,
    today: "2026-10-31",
  });

  return runAs(db, withMfa(OWNER), async (tx) => {
    await tx.query(
      `select public.import_transactions($1::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      [JSON.stringify(rows)],
    );
    const read = await tx.query<StoredTransactionRow>(
      `select ${STORED_COLUMNS} from public.transactions where fingerprint = $1`,
      [row.fingerprint],
      { parsers: { [DATE_TYPE]: (value) => value } },
    );
    return read.rows.map(toStoredTransaction);
  });
}

describe("a stored row read back", () => {
  it("keeps every bank field through import_transactions", async () => {
    const [stored] = await importAndRead(EVERY_FIELD);

    expect(stored).toMatchObject(EVERY_FIELD);
  });

  it("arrives with nothing decided about it yet", async () => {
    const [stored] = await importAndRead(EVERY_FIELD);

    expect(stored).toMatchObject({
      type: null,
      categoryId: null,
      categorySource: null,
      suggestedCategoryId: null,
      note: null,
      hidden: false,
      possibleDuplicate: false,
      transferPairId: null,
    });
  });
});
