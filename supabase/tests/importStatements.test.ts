import type { PGlite, Transaction } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "@/features/import/__fixtures__/load";
import {
  importStatements,
  type ImportResult,
} from "@/features/import/importStatements";
import { commitAs, createTestDatabase, OWNER, runAs, withMfa } from "./harness";

const FILE_NAME = "Chase1111_Activity_20261031.csv";
const TODAY = "2026-10-31";

// PGlite turns a date into a Date object. Supabase's API sends it as text.
const DATE_TYPE = 1082;

type Reply = { data: unknown; error: unknown };

/**
 * Answers the calls an import makes from the real tables and function, as this
 * session. Each call is its own transaction, as each API request is, and a
 * failed one comes back as a reply.
 */
function databaseClient(db: PGlite): SupabaseClient {
  async function ask(work: (tx: Transaction) => Promise<unknown>): Promise<Reply> {
    try {
      return { data: await commitAs(db, withMfa(OWNER), work), error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  function rows(table: string, columns: string) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      gte: () => builder,
      lte: () => builder,
      order: () => builder,
      range: () => builder,
      then(onDone: (reply: Reply) => unknown) {
        return ask(async (tx) => {
          const read = await tx.query(`select ${columns} from public.${table}`, [], {
            parsers: { [DATE_TYPE]: (value) => value },
          });
          return read.rows;
        }).then(onDone);
      },
    };
    return builder;
  }

  return {
    from: (table: "accounts" | "fx_rates") =>
      table === "accounts"
        ? rows(table, "id, last_four, format, currency")
        : rows(table, "rate_date, rate"),
    rpc: (_name: string, args: Record<string, unknown>) =>
      ask(async (tx) => {
        const { rows: reply } = await tx.query<{ counts: unknown }>(
          `select public.import_transactions($1::jsonb, $2::jsonb, $3::jsonb) as counts`,
          [
            JSON.stringify(args.p_rows),
            JSON.stringify(args.p_rates),
            JSON.stringify(args.p_pairs),
          ],
        );
        return reply[0].counts;
      }),
  } as unknown as SupabaseClient;
}

type StoredRow = {
  fingerprint: string;
  type: string | null;
  category_id: string | null;
  note: string | null;
};

function readStored(db: PGlite): Promise<StoredRow[]> {
  return runAs(db, withMfa(OWNER), async (tx) => {
    const { rows } = await tx.query<StoredRow>(
      `select fingerprint, type, category_id, note from public.transactions
       where fingerprint <> 'seeded' order by fingerprint`,
    );
    return rows;
  });
}

function importCsv(db: PGlite, text: string): Promise<ImportResult> {
  return importStatements({
    files: [new File([text], FILE_NAME)],
    client: databaseClient(db),
    fetch: vi.fn(),
    today: TODAY,
  });
}

let db: PGlite;

// A commit can't be undone, so each test gets its own database.
beforeEach(async () => {
  db = await createTestDatabase();
});

describe("importing a statement into the real schema", () => {
  it("stores each row with nothing decided, so it reaches review", async () => {
    const result = await importCsv(db, loadFixture(FILE_NAME));

    expect(result).toMatchObject({
      ok: true,
      summary: { newRows: 10, skippedRows: 0 },
    });

    const stored = await readStored(db);
    expect(stored).toHaveLength(10);
    expect(stored.every((row) => row.type === null)).toBe(true);
    expect(stored.every((row) => row.category_id === null)).toBe(true);
  });

  it("stores nothing new from the same file and changes no stored row", async () => {
    const text = loadFixture(FILE_NAME);
    await importCsv(db, text);
    await commitAs(db, withMfa(OWNER), (tx) =>
      tx.query(
        `update public.transactions set type = 'spending', note = 'Owner label'
         where fingerprint <> 'seeded'`,
      ),
    );
    const before = await readStored(db);

    const again = await importCsv(db, text);

    expect(again).toMatchObject({
      ok: true,
      summary: { newRows: 0, skippedRows: 10 },
    });
    await expect(readStored(db)).resolves.toEqual(before);
  });

  it("stores nothing from a file with a bad row", async () => {
    const text = loadFixture(FILE_NAME).replace("3360.51", "3360.52");

    const result = await importCsv(db, text);

    expect(result.ok).toBe(false);
    await expect(readStored(db)).resolves.toEqual([]);
  });
});
