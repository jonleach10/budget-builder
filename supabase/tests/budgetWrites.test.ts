import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, OWNER, runAs, withMfa } from "./harness";

const KEY = "(user_id, month, country, category_id)";

/** The SQL behind budgetStore's upserts, which send no user_id. */
function write(month: string, amount: number, onConflict: string): string {
  return `insert into public.budget_amounts (month, country, category_id, amount_minor)
    values ('${month}', 'US', '${OWNER.categoryId}', ${amount})
    on conflict ${KEY} ${onConflict}`;
}

const OVERWRITE = "do update set amount_minor = excluded.amount_minor";
const KEEP = "do nothing";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

async function amountAfter(sql: string, month: string): Promise<unknown> {
  return runAs(db, withMfa(OWNER), async (tx) => {
    await tx.exec(sql);
    const { rows } = await tx.query<{ amount_minor: number }>(
      `select amount_minor from public.budget_amounts where month = '${month}'`,
    );
    return rows.map((row) => Number(row.amount_minor));
  });
}

describe("budget amounts as the app writes them", () => {
  it("saving replaces a stored amount", async () => {
    await expect(
      amountAfter(write("2026-10", 60000, OVERWRITE), "2026-10"),
    ).resolves.toEqual([60000]);
  });

  it("saving adds a new month, with the schema filling in user_id", async () => {
    await expect(
      amountAfter(write("2026-11", 60000, OVERWRITE), "2026-11"),
    ).resolves.toEqual([60000]);
  });

  it("copying never overwrites a stored amount", async () => {
    await expect(
      amountAfter(write("2026-10", 60000, KEEP), "2026-10"),
    ).resolves.toEqual([50000]);
  });

  it("copying adds what's missing", async () => {
    await expect(
      amountAfter(write("2026-11", 60000, KEEP), "2026-11"),
    ).resolves.toEqual([60000]);
  });
});
