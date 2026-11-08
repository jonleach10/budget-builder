import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { findRate } from "@/features/fx/findRate";
import { importStatements } from "@/features/import/importStatements";
import { databaseClient } from "../supabase/tests/databaseClient";
import {
  createTestDatabase,
  OWNER,
  runAs,
  withMfa,
} from "../supabase/tests/harness";
import { fakeRates } from "./fakeRates.ts";
import { generateStatements } from "./generate.ts";
import { applyWeirdRows, WEIRD_ROWS, weirdRowsIn } from "./weirdRows.ts";

const TODAY = "2026-11-15";

/** The sandbox's other three accounts, beside the harness owner's checking 1111. */
const MORE_ACCOUNTS = `
  insert into public.accounts (user_id, name, last_four, format, currency, country, is_savings) values
    ('${OWNER.id}', 'Sandbox Savings', '4444', 'chase-bank', 'USD', 'US', true),
    ('${OWNER.id}', 'Sandbox Card', '2222', 'chase-card', 'USD', 'US', false),
    ('${OWNER.id}', 'Sandbox Girokonto', '3333', 'commerzbank', 'EUR', 'DE', false)
`;

/** The normal seed's statements, through the real import, as the sandbox seed does. */
async function seededDatabase(): Promise<PGlite> {
  const db = await createTestDatabase();
  await db.exec(MORE_ACCOUNTS);

  const result = await importStatements({
    files: generateStatements(TODAY).map(({ name, text }) => new File([text], name)),
    client: databaseClient(db),
    fetch: fakeRates,
    today: TODAY,
  });
  expect(result.ok).toBe(true);
  return db;
}

async function savedRates(db: PGlite): Promise<Record<string, string>> {
  const rows = await runAs(db, withMfa(OWNER), async (tx) => {
    const { rows: found } = await tx.query<{ rate_date: string; rate: string }>(
      `select rate_date::text, rate from public.fx_rates
       where base = 'EUR' and quote = 'USD'`,
    );
    return found;
  });
  return Object.fromEntries(rows.map(({ rate_date, rate }) => [rate_date, rate]));
}

type PairedRow = {
  last_four: string;
  posted_on: string;
  amount_minor: number;
  type: string | null;
  transfer_pair_id: string | null;
};

async function rowsOnThe5th(db: PGlite, month: string): Promise<PairedRow[]> {
  return runAs(db, withMfa(OWNER), async (tx) => {
    const { rows } = await tx.query<PairedRow>(
      `select account.last_four, row.posted_on::text, row.amount_minor::int,
              row.type, row.transfer_pair_id::text
       from public.transactions as row
       join public.accounts as account on account.id = row.account_id
       where row.posted_on = $1 and row.transfer_number is not null
       order by account.last_four`,
      [`${month}-05`],
    );
    return rows;
  });
}

/** Rows whose pair id no other row shares: one side of a move, alone. */
async function halfPaired(db: PGlite): Promise<string[]> {
  return runAs(db, withMfa(OWNER), async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select min(id::text) as id from public.transactions
       where transfer_pair_id is not null
       group by transfer_pair_id having count(*) = 1`,
    );
    return rows.map(({ id }) => id);
  });
}

let db: PGlite;

beforeEach(async () => {
  db = await seededDatabase();
});

describe("applyWeirdRows, missing rate", () => {
  it("leaves this month with no first-of-month rate, and last month with its own", async () => {
    expect(findRate(await savedRates(db), "2026-11-01")).toBeDefined();

    await applyWeirdRows(databaseClient(db), TODAY, ["missing-rate"]);

    const rates = await savedRates(db);
    expect(findRate(rates, "2026-11-01")).toBeUndefined();
    expect(findRate(rates, "2026-10-01")).toBeDefined();
    expect(findRate(rates, "2026-11-02")).toBeDefined();
  });
});

describe("applyWeirdRows, half-failed move", () => {
  it("leaves the newest savings move paired on the checking side only", async () => {
    expect(await halfPaired(db)).toEqual([]);
    const [checking, savings] = await rowsOnThe5th(db, "2026-11");
    expect(checking.transfer_pair_id).toBe(savings.transfer_pair_id);

    await applyWeirdRows(databaseClient(db), TODAY, ["half-failed-move"]);

    expect(await halfPaired(db)).toHaveLength(1);
    expect(await rowsOnThe5th(db, "2026-11")).toEqual([
      {
        last_four: "1111",
        posted_on: "2026-11-05",
        amount_minor: -25_000,
        type: "transfer",
        transfer_pair_id: checking.transfer_pair_id,
      },
      {
        last_four: "4444",
        posted_on: "2026-11-05",
        amount_minor: 25_000,
        type: null,
        transfer_pair_id: null,
      },
    ]);
  });

  it("leaves last month's move paired on both sides", async () => {
    await applyWeirdRows(databaseClient(db), TODAY, ["half-failed-move"]);

    const [checking, savings] = await rowsOnThe5th(db, "2026-10");
    expect(checking.transfer_pair_id).not.toBeNull();
    expect(checking.transfer_pair_id).toBe(savings.transfer_pair_id);
  });
});

describe("weirdRowsIn", () => {
  it("names a repeated weird row once, so asking twice still breaks one move", async () => {
    const asked = weirdRowsIn(["half-failed-move", "half-failed-move"]);

    await applyWeirdRows(databaseClient(db), TODAY, asked);

    expect(await halfPaired(db)).toHaveLength(1);
  });

  it("keeps only the weird-row names, in their usual order", () => {
    expect(
      weirdRowsIn(["leap-day", "half-failed-move", "missing-rate", "missing-rate"]),
    ).toEqual(["missing-rate", "half-failed-move"]);
  });
});

describe("applyWeirdRows, all at once", () => {
  it("gives the same rows from the same seed and date", async () => {
    const other = await seededDatabase();

    await applyWeirdRows(databaseClient(db), TODAY, WEIRD_ROWS);
    await applyWeirdRows(databaseClient(other), TODAY, WEIRD_ROWS);

    const comparable = async (database: PGlite) => ({
      rates: await savedRates(database),
      moves: (await rowsOnThe5th(database, "2026-11")).map((row) => ({
        ...row,
        transfer_pair_id: row.transfer_pair_id !== null,
      })),
      halfPaired: (await halfPaired(database)).length,
    });
    expect(await comparable(db)).toEqual(await comparable(other));
  });
});
