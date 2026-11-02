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
const SAVINGS_FILE_NAME = "Chase4444_Activity_20261031.csv";
const SAVINGS_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000a3";
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

  function from(table: string) {
    let columns = "";
    const conditions: string[] = [];
    const values: string[] = [];

    function keep(column: string, operator: string, value: string) {
      values.push(value);
      conditions.push(`${column}::text ${operator} $${values.length}`);
      return builder;
    }

    const builder = {
      select(list: string) {
        columns = list;
        return builder;
      },
      eq: (column: string, value: string) => keep(column, "=", value),
      gte: (column: string, value: string) => keep(column, ">=", value),
      lte: (column: string, value: string) => keep(column, "<=", value),
      order: () => builder,
      range: () => builder,
      then(onDone: (reply: Reply) => unknown) {
        const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
        return ask(async (tx) => {
          const read = await tx.query(
            `select ${columns} from public.${table} ${where}`,
            values,
            { parsers: { [DATE_TYPE]: (value) => value } },
          );
          return read.rows;
        }).then(onDone);
      },
    };
    return builder;
  }

  return {
    from,
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
  category_source: string | null;
  note: string | null;
  transfer_pair_id: string | null;
};

function readStored(db: PGlite): Promise<StoredRow[]> {
  return runAs(db, withMfa(OWNER), async (tx) => {
    const { rows } = await tx.query<StoredRow>(
      `select fingerprint, type, category_id, category_source, note, transfer_pair_id
       from public.transactions
       where fingerprint <> 'seeded' order by fingerprint`,
    );
    return rows;
  });
}

function importCsv(
  db: PGlite,
  text: string,
  fileName = FILE_NAME,
): Promise<ImportResult> {
  return importStatements({
    files: [new File([text], fileName)],
    client: databaseClient(db),
    fetch: vi.fn(),
    today: TODAY,
  });
}

/** A Chase bank file with one synthetic row. */
function oneRowFile(row: string): string {
  const [header] = loadFixture(FILE_NAME).split("\n");
  return `${header}\n${row}\n`;
}

async function addSavingsAccount(db: PGlite): Promise<void> {
  await db.exec(
    `insert into public.accounts (id, user_id, name, last_four, format, currency, country)
     values ('${SAVINGS_ACCOUNT_ID}', '${OWNER.id}', 'Savings', '4444', 'chase-bank', 'USD', 'US')`,
  );
}

let db: PGlite;

// A commit can't be undone, so each test gets its own database.
beforeEach(async () => {
  db = await createTestDatabase();
});

describe("importing a statement into the real schema", () => {
  it("stores each row as far as it can be classified", async () => {
    const result = await importCsv(db, loadFixture(FILE_NAME));

    expect(result).toMatchObject({
      ok: true,
      summary: { newRows: 10, skippedRows: 0 },
    });

    const stored = await readStored(db);
    expect(stored).toHaveLength(10);
    // Card purchases and fees have a bank type. The other five reach review.
    expect(stored.filter((row) => row.type === "spending")).toHaveLength(5);
    expect(stored.filter((row) => row.type === null)).toHaveLength(5);
    // The owner has no Fees category, so no row gets one from its bank type.
    expect(stored.every((row) => row.category_id === null)).toBe(true);
  });

  it("stores the category from one of the owner's rules", async () => {
    await importCsv(
      db,
      oneRowFile(
        `DEBIT,10/05/2026,"SYNTHETIC MARKET",-12.00,DEBIT_CARD,988.00,,`,
      ),
    );

    await expect(readStored(db)).resolves.toMatchObject([
      {
        type: "spending",
        category_id: OWNER.categoryId,
        category_source: "rule",
      },
    ]);
  });

  it("gives a merchant the category the owner confirmed on an earlier row", async () => {
    await importCsv(
      db,
      oneRowFile(`DEBIT,10/05/2026,"CORNER BAKERY",-12.00,DEBIT_CARD,988.00,,`),
    );
    await commitAs(db, withMfa(OWNER), (tx) =>
      tx.query(
        `update public.transactions
         set type = 'spending', category_id = $1, category_source = 'manual'
         where fingerprint <> 'seeded'`,
        [OWNER.categoryId],
      ),
    );

    await importCsv(
      db,
      oneRowFile(`DEBIT,10/20/2026,"CORNER BAKERY",-14.00,DEBIT_CARD,974.00,,`),
    );

    const stored = await readStored(db);
    expect(stored.map((row) => row.category_source).sort()).toEqual([
      "history",
      "manual",
    ]);
    expect(stored.every((row) => row.category_id === OWNER.categoryId)).toBe(
      true,
    );
  });

  it("pairs a transfer across two uploads, one after the other", async () => {
    await addSavingsAccount(db);

    const first = await importCsv(
      db,
      oneRowFile(
        `DEBIT,10/07/2026,"Online Transfer to  SAV ...4444 transaction#: 12345678901",-100.00,ACCT_XFER,900.00,,`,
      ),
    );
    expect(first).toMatchObject({ ok: true, summary: { newRows: 1 } });
    const [waiting] = await readStored(db);
    expect(waiting).toMatchObject({ type: null, transfer_pair_id: null });

    const second = await importCsv(
      db,
      oneRowFile(
        `CREDIT,10/08/2026,"Online Transfer from  CHK ...1111 transaction#: 12345678901",100.00,ACCT_XFER,1100.00,,`,
      ),
      SAVINGS_FILE_NAME,
    );
    expect(second).toMatchObject({ ok: true, summary: { newRows: 1 } });

    const stored = await readStored(db);
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.type === "transfer")).toBe(true);
    expect(stored[0].transfer_pair_id).not.toBeNull();
    expect(stored[0].transfer_pair_id).toBe(stored[1].transfer_pair_id);
  });

  it("pairs a numbered transfer across two uploads when its text has a past category", async () => {
    await addSavingsAccount(db);
    await importCsv(
      db,
      oneRowFile(
        `DEBIT,09/07/2026,"Online Transfer to  SAV ...4444 transaction#: 11111111111",-100.00,ACCT_XFER,900.00,,`,
      ),
    );
    await commitAs(db, withMfa(OWNER), (tx) =>
      tx.query(
        `update public.transactions
         set type = 'spending', category_id = $1, category_source = 'manual'
         where fingerprint <> 'seeded'`,
        [OWNER.categoryId],
      ),
    );

    await importCsv(
      db,
      oneRowFile(
        `DEBIT,10/07/2026,"Online Transfer to  SAV ...4444 transaction#: 12345678901",-100.00,ACCT_XFER,800.00,,`,
      ),
    );
    await importCsv(
      db,
      oneRowFile(
        `CREDIT,10/08/2026,"Online Transfer from  CHK ...1111 transaction#: 12345678901",100.00,ACCT_XFER,1100.00,,`,
      ),
      SAVINGS_FILE_NAME,
    );

    const october = (await readStored(db)).filter(
      (row) => row.category_source !== "manual",
    );
    expect(october.map((row) => row.type)).toEqual(["transfer", "transfer"]);
    expect(october[0].transfer_pair_id).not.toBeNull();
    expect(october[0].transfer_pair_id).toBe(october[1].transfer_pair_id);
  });

  it("leaves a stored row alone when the owner gave it another type", async () => {
    await addSavingsAccount(db);
    await importCsv(
      db,
      oneRowFile(
        `DEBIT,10/07/2026,"Online Transfer to  SAV ...4444 transaction#: 12345678901",-100.00,ACCT_XFER,900.00,,`,
      ),
    );
    await commitAs(db, withMfa(OWNER), (tx) =>
      tx.query(
        `update public.transactions set type = 'personal'
         where fingerprint <> 'seeded'`,
      ),
    );

    await importCsv(
      db,
      oneRowFile(
        `CREDIT,10/08/2026,"Online Transfer from  CHK ...1111 transaction#: 12345678901",100.00,ACCT_XFER,1100.00,,`,
      ),
      SAVINGS_FILE_NAME,
    );

    const stored = await readStored(db);
    expect(stored.map((row) => row.type)).toHaveLength(2);
    expect(stored.map((row) => row.type)).toEqual(
      expect.arrayContaining(["personal", null]),
    );
    expect(stored.every((row) => row.transfer_pair_id === null)).toBe(true);
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
