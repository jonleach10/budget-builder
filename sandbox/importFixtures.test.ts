import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { importStatements } from "@/features/import/importStatements";
import { databaseClient } from "../supabase/tests/databaseClient";
import { createTestDatabase, OWNER, runAs, withMfa } from "../supabase/tests/harness";
import { fakeRates } from "./fakeRates.ts";
import { generateStatements } from "./generate.ts";
import { type WeirdStatement, weirdStatements } from "./weird.ts";

/**
 * The statements the launch check's import flows upload by hand, through the
 * real import after the normal seed, as the sandbox runs them.
 */

const TODAY = "2026-11-08";

const MORE_ACCOUNTS = `
  insert into public.accounts (user_id, name, last_four, format, currency, country, is_savings) values
    ('${OWNER.id}', 'Sandbox Savings', '4444', 'chase-bank', 'USD', 'US', true),
    ('${OWNER.id}', 'Sandbox Card', '2222', 'chase-card', 'USD', 'US', false),
    ('${OWNER.id}', 'Sandbox Girokonto', '3333', 'commerzbank', 'EUR', 'DE', false)
`;

/** Any call to it fails the import, so a passing import made no rate request. */
const noRateRequests: typeof fetch = async () => {
  throw new Error("The import asked the rates service.");
};

function filesFor(texts: readonly { name: string; text: string }[]): File[] {
  return texts.map(({ name, text }) => new File([text], name));
}

async function storedRowCount(db: PGlite): Promise<number> {
  return runAs(db, withMfa(OWNER), async (tx) => {
    const { rows } = await tx.query<{ count: number }>(
      "select count(*)::int as count from public.transactions",
    );
    return rows[0].count;
  });
}

async function importFixture(db: PGlite, name: WeirdStatement) {
  return importStatements({
    files: filesFor(weirdStatements(TODAY, [name])),
    client: databaseClient(db),
    fetch: noRateRequests,
    today: TODAY,
  });
}

let db: PGlite;
beforeEach(async () => {
  db = await createTestDatabase();
  await db.exec(MORE_ACCOUNTS);
  const seed = await importStatements({
    files: filesFor(generateStatements(TODAY)),
    client: databaseClient(db),
    fetch: fakeRates,
    today: TODAY,
  });
  expect(seed.ok).toBe(true);
});

describe("the seeded statements, uploaded again", () => {
  it("add nothing: every row is skipped, with no possible duplicates", async () => {
    const before = await storedRowCount(db);
    const result = await importFixture(db, "seeded");

    expect(result).toMatchObject({
      ok: true,
      summary: { newRows: 0, possibleDuplicates: 0 },
    });
    if (result.ok) expect(result.summary.skippedRows).toBeGreaterThan(0);
    expect(await storedRowCount(db)).toBe(before);
  });
});

describe("the fresh statements", () => {
  it("add only new rows, at both banks, with no rate request", async () => {
    const before = await storedRowCount(db);
    const result = await importFixture(db, "fresh");

    expect(result).toMatchObject({
      ok: true,
      fileCount: 4,
      summary: { newRows: 5, skippedRows: 0, possibleDuplicates: 0 },
    });
    expect(await storedRowCount(db)).toBe(before + 5);
  });

  it("add nothing more when uploaded a second time", async () => {
    await importFixture(db, "fresh");
    const before = await storedRowCount(db);
    const again = await importFixture(db, "fresh");

    expect(again).toMatchObject({ ok: true, summary: { newRows: 0, skippedRows: 5 } });
    expect(await storedRowCount(db)).toBe(before);
  });
});
