import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareImport, type ImportRow } from "@/features/import/prepareImport";
import {
  commitAs,
  createTestDatabase,
  LOGGED_OUT,
  OTHER,
  OWNER,
  passwordOnly,
  runAs,
  withMfa,
} from "./harness";

type Counts = { new: number; skipped: number; possible_duplicates: number };

type Row = Record<string, string | number | boolean>;

/** A row as `prepareImport` builds it. All values are synthetic. */
function row(fingerprint: string, overrides: Row = {}, user = OWNER): Row {
  return {
    account_id: user.accountId,
    fingerprint,
    posted_on: "2026-10-05",
    amount_minor: -1250,
    currency: "USD",
    description: "SYNTHETIC SHOP",
    base_amount_minor: -1250,
    base_currency: "USD",
    base_rate: "1",
    possible_duplicate: false,
    ...overrides,
  };
}

const rate = (rate_date: string, value: string) => ({
  rate_date,
  base: "EUR",
  quote: "USD",
  rate: value,
});

const side = (fingerprint: string, user = OWNER) => ({
  accountId: user.accountId,
  fingerprint,
});

const pair = (moneyOut: string, moneyIn: string) => ({
  evidence: "transfer-number",
  moneyOut: side(moneyOut),
  moneyIn: side(moneyIn),
});

async function importRows(
  tx: Transaction,
  rows: unknown[],
  rates: unknown[] = [],
  pairs: unknown[] = [],
): Promise<Counts> {
  const { rows: result } = await tx.query<{ counts: Counts }>(
    `select public.import_transactions($1::jsonb, $2::jsonb, $3::jsonb) as counts`,
    [JSON.stringify(rows), JSON.stringify(rates), JSON.stringify(pairs)],
  );
  return result[0].counts;
}

async function stored(tx: Transaction, fingerprint: string) {
  const { rows } = await tx.query<{
    user_id: string;
    type: string | null;
    category_id: string | null;
    category_source: string | null;
    note: string | null;
    transfer_pair_id: string | null;
    possible_duplicate: boolean;
    description: string;
  }>(`select * from public.transactions where fingerprint = $1`, [fingerprint]);
  return rows[0];
}

async function count(tx: Transaction, table: string): Promise<number> {
  const { rows } = await tx.query<{ total: number }>(
    `select count(*)::int as total from public.${table}`,
  );
  return rows[0].total;
}

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

describe("import_transactions", () => {
  describe("storing rows", () => {
    it("stores new rows and counts them", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        const counts = await importRows(tx, [row("a"), row("b")]);

        expect(counts).toEqual({ new: 2, skipped: 0, possible_duplicates: 0 });
        expect((await stored(tx, "a")).description).toBe("SYNTHETIC SHOP");
      });
    });

    it("stores nothing for an empty upload", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        expect(await importRows(tx, [])).toEqual({
          new: 0,
          skipped: 0,
          possible_duplicates: 0,
        });
      });
    });

    it("skips a row seen in an earlier import", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("a")]);

        const counts = await importRows(tx, [row("a"), row("b")]);

        expect(counts).toEqual({ new: 1, skipped: 1, possible_duplicates: 0 });
      });
    });

    it("skips a row that two files in one upload share", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        const counts = await importRows(tx, [row("a"), row("a")]);

        expect(counts).toEqual({ new: 1, skipped: 1, possible_duplicates: 0 });
      });
    });

    it("leaves an edited row alone on re-import", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("a")]);
        await tx.query(
          `update public.transactions
             set type = 'spending', category_id = $1,
                 category_source = 'manual', note = 'Kept'
           where fingerprint = 'a'`,
          [OWNER.categoryId],
        );

        await importRows(tx, [row("a", { type: "income" })]);

        expect(await stored(tx, "a")).toMatchObject({
          type: "spending",
          category_id: OWNER.categoryId,
          category_source: "manual",
          note: "Kept",
        });
      });
    });

    it("counts possible duplicates among new rows only", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        const first = [
          row("a"),
          row("a-copy", { possible_duplicate: true }),
        ];
        await importRows(tx, first);

        const counts = await importRows(tx, [
          ...first,
          row("b"),
          row("b-copy", { possible_duplicate: true }),
        ]);

        expect(counts).toEqual({ new: 2, skipped: 2, possible_duplicates: 1 });
        expect((await stored(tx, "b-copy")).possible_duplicate).toBe(true);
        expect((await stored(tx, "b")).possible_duplicate).toBe(false);
      });
    });

    it("keeps the classification a row arrives with", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [
          row("a", {
            type: "spending",
            category_id: OWNER.categoryId,
            category_source: "rule",
          }),
        ]);

        expect(await stored(tx, "a")).toMatchObject({
          type: "spending",
          category_id: OWNER.categoryId,
          category_source: "rule",
        });
      });
    });

    // jsonb_populate_recordset ignores a key with no column, so a misspelled
    // name in prepareImport would store null with no error.
    it("stores every column prepareImport sends", async () => {
      const { rows } = await prepareImport({
        statements: [
          {
            accountId: OWNER.accountId,
            format: "chase-bank",
            ignoredPendingCount: 0,
            transactions: [
              {
                accountId: OWNER.accountId,
                fingerprint: "v1:every-column",
                repeatIndex: 1,
                postedOn: "2026-10-05",
                purchasedOn: "2026-10-04",
                amount: { minor: -1250, currency: "USD" },
                description: "SYNTHETIC SHOP",
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
              },
            ],
          },
        ],
        readSavedRates: async () => ({}),
        fetch: globalThis.fetch,
        today: "2026-10-05",
      });

      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, rows);

        const { rows: saved } = await tx.query<Record<string, unknown>>(
          `select *, posted_on::text as posted_on,
                  purchased_on::text as purchased_on
           from public.transactions where fingerprint = 'v1:every-column'`,
        );
        const sent = Object.keys(rows[0]);
        expect(sent).toHaveLength(21);
        for (const column of sent) {
          expect(saved[0][column], column).toBe(
            rows[0][column as keyof ImportRow],
          );
        }
      });
    });

    it("stores a row for the session's user, whatever the row says", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("a", { user_id: OTHER.id })]);

        expect((await stored(tx, "a")).user_id).toBe(OWNER.id);
      });
    });
  });

  describe("storing rates", () => {
    it("adds new rates and keeps saved ones as they are", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [],
          [rate("2026-10-01", "9.99"), rate("2026-10-02", "1.09")],
        );

        const { rows } = await tx.query<{ rate_date: Date; rate: string }>(
          `select rate_date::text as rate_date, rate from public.fx_rates order by rate_date`,
        );
        expect(rows).toEqual([
          { rate_date: "2026-10-01", rate: "1.08" },
          { rate_date: "2026-10-02", rate: "1.09" },
        ]);
      });
    });
  });

  describe("storing pairs", () => {
    it("marks both rows of a pair with one pair id", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("out"), row("in", { amount_minor: 1250, base_amount_minor: 1250 })],
          [],
          [pair("out", "in")],
        );

        const moneyOut = await stored(tx, "out");
        const moneyIn = await stored(tx, "in");
        expect(moneyOut.type).toBe("transfer");
        expect(moneyIn.type).toBe("transfer");
        expect(moneyOut.transfer_pair_id).not.toBeNull();
        expect(moneyOut.transfer_pair_id).toBe(moneyIn.transfer_pair_id);
      });
    });

    it("pairs a new row with one from an earlier import", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("out")]);

        await importRows(tx, [row("in")], [], [pair("out", "in")]);

        expect((await stored(tx, "out")).type).toBe("transfer");
      });
    });

    it("gives each pair its own id", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("a"), row("b"), row("c"), row("d")],
          [],
          [pair("a", "b"), pair("c", "d")],
        );

        const first = await stored(tx, "a");
        const second = await stored(tx, "c");
        expect(first.transfer_pair_id).not.toBe(second.transfer_pair_id);
      });
    });

    it("accepts a row already set to transfer", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("out", { type: "transfer" }), row("in")],
          [],
          [pair("out", "in")],
        );

        expect((await stored(tx, "out")).transfer_pair_id).not.toBeNull();
      });
    });

    it("can't change an edited row, or half-pair its partner", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("out", { type: "personal" }), row("in")]);

        await importRows(tx, [], [], [pair("out", "in")]);

        expect(await stored(tx, "out")).toMatchObject({
          type: "personal",
          transfer_pair_id: null,
        });
        expect(await stored(tx, "in")).toMatchObject({
          type: null,
          transfer_pair_id: null,
        });
      });
    });

    it("leaves a row that already has a pair", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("out"), row("in"), row("later")],
          [],
          [pair("out", "in")],
        );
        const before = (await stored(tx, "out")).transfer_pair_id;

        await importRows(tx, [], [], [pair("out", "later")]);

        expect((await stored(tx, "out")).transfer_pair_id).toBe(before);
        expect((await stored(tx, "later")).transfer_pair_id).toBeNull();
      });
    });

    it("skips a pair naming a row that isn't stored", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("out")], [], [pair("out", "missing")]);

        expect((await stored(tx, "out")).transfer_pair_id).toBeNull();
      });
    });

    it("gives a row named in two pairs to the first pair only", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("out"), row("in-a"), row("in-b")],
          [],
          [pair("out", "in-a"), pair("out", "in-b")],
        );

        const out = await stored(tx, "out");
        expect(out.transfer_pair_id).not.toBeNull();
        expect((await stored(tx, "in-a")).transfer_pair_id).toBe(
          out.transfer_pair_id,
        );
        expect(await stored(tx, "in-b")).toMatchObject({
          type: null,
          transfer_pair_id: null,
        });
      });
    });

    it("still pairs a row whose earlier pair was skipped", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("a"), row("b"), row("c"), row("d")],
          [],
          [pair("a", "b"), pair("b", "c"), pair("c", "d")],
        );

        const third = await stored(tx, "c");
        expect(third.transfer_pair_id).not.toBeNull();
        expect((await stored(tx, "d")).transfer_pair_id).toBe(
          third.transfer_pair_id,
        );
      });
    });

    it("gives one pair listed twice a single id", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(
          tx,
          [row("out"), row("in")],
          [],
          [pair("out", "in"), pair("out", "in")],
        );

        const out = await stored(tx, "out");
        expect(out.transfer_pair_id).not.toBeNull();
        expect((await stored(tx, "in")).transfer_pair_id).toBe(
          out.transfer_pair_id,
        );
      });
    });

    it("skips a pair naming the same row twice", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("alone")], [], [pair("alone", "alone")]);

        expect(await stored(tx, "alone")).toMatchObject({
          type: null,
          transfer_pair_id: null,
        });
      });
    });
  });

  describe("a failure", () => {
    // These calls commit, as the app's do, so a partial store would stay and show.
    let ownDb: PGlite;
    const session = withMfa(OWNER);

    beforeAll(async () => {
      ownDb = await createTestDatabase();
    }, 60_000);

    const call = (rows: unknown[], rates: unknown[]) =>
      commitAs(ownDb, session, (tx) => importRows(tx, rows, rates));

    const refusedCall = (rows: unknown[], rates: unknown[]) =>
      call(rows, rates).catch((caught: Error) => caught);

    const totals = () =>
      runAs(ownDb, session, async (tx) => ({
        rows: await count(tx, "transactions"),
        rates: await count(tx, "fx_rates"),
      }));

    it.each([
      ["a bad date", { posted_on: "not-a-date" }],
      ["a bad currency", { currency: "dollars" }],
      ["a missing amount", { amount_minor: "" }],
      ["a bad type", { type: "gift" }],
    ])("from %s stores nothing at all", async (_label, overrides) => {
      const before = await totals();

      const error = await refusedCall(
        [row("good"), row("bad", overrides)],
        [rate("2026-10-03", "1.09")],
      );

      expect(error).toBeInstanceOf(Error);
      expect(await totals()).toEqual(before);
    });

    it("from a bad rate stores no rows", async () => {
      const before = await totals();

      const error = await refusedCall(
        [row("good")],
        [rate("2026-10-03", "0")],
      );

      expect(error).toBeInstanceOf(Error);
      expect(await totals()).toEqual(before);
    });

    // Shows the counts above can fail: what a call stores does reach them.
    it("doesn't apply to a call that succeeds", async () => {
      const before = await totals();

      await call([row("kept")], [rate("2026-10-04", "1.09")]);

      expect(await totals()).toEqual({
        rows: before.rows + 1,
        rates: before.rates + 1,
      });
    });
  });

  describe("who can call it", () => {
    it("refuses a logged-out session", async () => {
      await expect(
        runAs(db, LOGGED_OUT, (tx) => importRows(tx, [row("a")])),
      ).rejects.toThrow(/permission denied/);
    });

    it("refuses a password-only session", async () => {
      await expect(
        runAs(db, passwordOnly(OWNER), (tx) => importRows(tx, [row("a")])),
      ).rejects.toThrow(/can't use/);
    });

    it("refuses a password-only session's rates", async () => {
      await expect(
        runAs(db, passwordOnly(OWNER), (tx) =>
          importRows(tx, [], [rate("2026-10-03", "1.09")]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("refuses another user's account", async () => {
      await expect(
        runAs(db, withMfa(OWNER), (tx) =>
          importRows(tx, [row("a", {}, OTHER)]),
        ),
      ).rejects.toThrow(/can't use/);
    });

    it("refuses another user's account rather than skip a row it holds", async () => {
      await expect(
        runAs(db, withMfa(OWNER), (tx) =>
          importRows(tx, [row("seeded", {}, OTHER)]),
        ),
      ).rejects.toThrow(/can't use/);
    });

    it("can't pair another user's rows", async () => {
      await runAs(db, withMfa(OWNER), async (tx) => {
        await importRows(tx, [row("mine")]);
        const theirs = { accountId: OTHER.accountId, fingerprint: "seeded" };

        await importRows(tx, [], [], [
          { moneyOut: side("mine"), moneyIn: theirs },
        ]);

        // Dropping the role reads past the policies, and reading here comes
        // before the rollback, so a change to their row would still show.
        await tx.exec("reset role");
        const { rows } = await tx.query(
          `select transfer_pair_id from public.transactions
           where account_id = $1 and fingerprint = 'seeded'`,
          [OTHER.accountId],
        );
        expect(rows).toEqual([{ transfer_pair_id: null }]);
        expect((await stored(tx, "mine")).transfer_pair_id).toBeNull();
      });
    });
  });

  describe("how it's defined", () => {
    it("runs as the caller, with an empty search path", async () => {
      const { rows } = await db.query<{
        prosecdef: boolean;
        proconfig: string[];
      }>(
        `select prosecdef, proconfig from pg_proc
         where oid = 'public.import_transactions(jsonb, jsonb, jsonb)'::regprocedure`,
      );

      expect(rows).toEqual([
        { prosecdef: false, proconfig: ['search_path=""'] },
      ]);
    });

    it.each([
      ["anon", false],
      ["authenticated", true],
    ])("gives %s execute: %s", async (role, allowed) => {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_function_privilege(
           $1, 'public.import_transactions(jsonb, jsonb, jsonb)', 'execute'
         ) as allowed`,
        [role],
      );

      expect(rows[0].allowed).toBe(allowed);
    });
  });
});

describe("accounts.is_savings", () => {
  it("starts false", async () => {
    await runAs(db, withMfa(OWNER), async (tx) => {
      const { rows } = await tx.query<{ is_savings: boolean }>(
        `select is_savings from public.accounts`,
      );

      expect(rows).toEqual([{ is_savings: false }]);
    });
  });
});
