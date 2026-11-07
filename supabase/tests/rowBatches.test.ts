import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readStoredTransactions } from "@/features/import/storedTransactions";
import { buildReviewInbox } from "@/features/review/reviewInbox";
import {
  editRows,
  type RowEdit,
  type RowEditStore,
} from "@/features/transactions/rowEdits";
import { rowEditStore } from "@/features/transactions/rowEditStore";
import { databaseClient } from "./databaseClient";
import {
  createTestDatabase,
  insertTransaction,
  OTHER,
  OWNER,
  passwordOnly,
} from "./harness";

const LOG_METHODS = ["log", "info", "warn", "error", "debug"] as const;

const NOT_SAVED = { ok: false, message: "These rows weren't saved. Try again." };

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

// These writes commit, as the app's do, so each test starts from the seeded rows.
beforeEach(async () => {
  await db.exec(`
    delete from public.transactions where fingerprint <> 'seeded';
    delete from public.categories where name = 'Dining';
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function idFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/** Stores rows in review, all from one merchant, and gives their IDs. */
async function addGroup(
  count: number,
  extra: Readonly<Record<string, string>> = {},
  first = 100,
): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) => idFor(first + index));
  for (const id of ids) {
    await db.exec(insertTransaction(OWNER, `row-${id}`, { id: `'${id}'`, ...extra }));
  }
  return ids;
}

type Decisions = {
  id: string;
  type: string | null;
  category_id: string | null;
  category_source: string | null;
};

async function decisionsOn(ids: readonly string[]): Promise<Decisions[]> {
  const { rows } = await db.query<Decisions>(
    `select id, type, category_id, category_source from public.transactions
     where id = any($1::uuid[]) order by id`,
    [ids],
  );
  return rows;
}

async function addCategory(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.categories (user_id, name) values ($1, $2) returning id`,
    [OWNER.id, name],
  );
  return rows[0].id;
}

function accept(ids: readonly string[], edit: RowEdit, batchSize?: number) {
  return editRows(rowEditStore(databaseClient(db)), ids, edit, batchSize);
}

/** The real store, keeping the IDs each batch sent, failing from one batch on. */
function batchingStore(failFrom = Number.POSITIVE_INFINITY) {
  const real = rowEditStore(databaseClient(db));
  const batches: string[][] = [];
  const store: RowEditStore = {
    ...real,
    async updateInReview(ids, type, changes) {
      // Each batch asks for its spending rows first, so this sees every batch once.
      if (type === "spending") batches.push([...ids]);
      if (batches.length > failFrom) return "failed";
      return real.updateInReview(ids, type, changes);
    },
  };
  return { store, batches };
}

const SPENDING_GROCERIES = {
  type: "spending",
  category_id: OWNER.categoryId,
  category_source: "manual",
};

describe("accepting a group", () => {
  it("gives every row the category, as spending, with a manual source", async () => {
    const ids = await addGroup(3);

    const result = await accept(ids, { categoryId: OWNER.categoryId });

    expect(result).toEqual({ ok: true, notice: "3 rows were saved." });
    for (const row of await decisionsOn(ids)) {
      expect(row).toMatchObject(SPENDING_GROCERIES);
    }
  });

  it("accepts a group of rows with redacted text as a whole", async () => {
    const ids = await addGroup(2, { description: "'PAY [REDACTED]'" });

    const result = await accept(ids, { categoryId: OWNER.categoryId });

    expect(result).toEqual({ ok: true, notice: "2 rows were saved." });
    for (const row of await decisionsOn(ids)) {
      expect(row).toMatchObject(SPENDING_GROCERIES);
    }
  });

  it("says 1 row for a group of one", async () => {
    const ids = await addGroup(1);

    await expect(accept(ids, { categoryId: OWNER.categoryId })).resolves.toEqual({
      ok: true,
      notice: "1 row was saved.",
    });
  });

  it("gives every row a type other than spending, with no category", async () => {
    const ids = await addGroup(2);

    await accept(ids, { type: "income" });

    for (const row of await decisionsOn(ids)) {
      expect(row).toMatchObject({
        type: "income",
        category_id: null,
        category_source: null,
      });
    }
  });

  it("takes spending rows with no category as well as rows with no type", async () => {
    const untyped = await addGroup(1);
    const spending = await addGroup(1, { type: "'spending'" }, 200);

    const result = await accept([...untyped, ...spending], {
      categoryId: OWNER.categoryId,
    });

    expect(result).toEqual({ ok: true, notice: "2 rows were saved." });
    for (const row of await decisionsOn([...untyped, ...spending])) {
      expect(row).toMatchObject(SPENDING_GROCERIES);
    }
  });

  it("leaves a row the owner decided another way since the inbox loaded", async () => {
    const dining = await addCategory("Dining");
    const [changed, ...rest] = await addGroup(3);
    await db.exec(
      `update public.transactions set type = 'spending', category_id = '${dining}',
       category_source = 'manual' where id = '${changed}'`,
    );

    const result = await accept([changed, ...rest], {
      categoryId: OWNER.categoryId,
    });

    expect(result).toEqual({ ok: true, notice: "2 rows were saved." });
    await expect(decisionsOn([changed])).resolves.toMatchObject([
      { type: "spending", category_id: dining },
    ]);
  });

  it("leaves a row the owner hid since the inbox loaded", async () => {
    const [hidden, ...rest] = await addGroup(3);
    await db.exec(`update public.transactions set hidden = true where id = '${hidden}'`);

    const result = await accept([hidden, ...rest], {
      categoryId: OWNER.categoryId,
    });

    expect(result).toEqual({ ok: true, notice: "2 rows were saved." });
    await expect(decisionsOn([hidden])).resolves.toMatchObject([
      { type: null, category_id: null },
    ]);
  });

  it("leaves a row that was given a type since the inbox loaded", async () => {
    const [changed] = await addGroup(1, { type: "'income'" });

    const result = await accept([changed], { categoryId: OWNER.categoryId });

    expect(result).toEqual({
      ok: false,
      message: "These rows have changed, so none were saved. Check the rows, then try again.",
    });
    await expect(decisionsOn([changed])).resolves.toMatchObject([
      { type: "income", category_id: null },
    ]);
  });

  it("teaches past categories, so the merchant's next row gets a suggestion", async () => {
    const ids = await addGroup(2);
    await accept(ids, { categoryId: OWNER.categoryId });
    await addGroup(1, {}, 300);

    const inbox = buildReviewInbox({
      rows: await readStoredTransactions(databaseClient(db)),
      accounts: [{ id: OWNER.accountId, name: "Checking", country: "US" }],
      categories: [{ id: OWNER.categoryId, name: "Groceries", position: 0 }],
      thisMonth: "2026-11",
    });

    // The seeded row is the same merchant, and still in review.
    expect(inbox.groups).toHaveLength(1);
    const left = inbox.groups[0].rows.map(({ id }) => id);
    expect(left).toContain(idFor(300));
    for (const id of ids) expect(left).not.toContain(id);
    expect(inbox.groups[0].suggestion).toEqual({
      categoryId: OWNER.categoryId,
      name: "Groceries",
    });
  });
});

describe("a large group", () => {
  it("saves in batches", async () => {
    const ids = await addGroup(5);
    const { store, batches } = batchingStore();

    const result = await editRows(store, ids, { categoryId: OWNER.categoryId }, 2);

    expect(result).toEqual({ ok: true, notice: "5 rows were saved." });
    expect(batches).toEqual([ids.slice(0, 2), ids.slice(2, 4), ids.slice(4)]);
  });

  it("uses batches of 100 unless told otherwise", async () => {
    const ids = await addGroup(101);
    const { store, batches } = batchingStore();

    await editRows(store, ids, { categoryId: OWNER.categoryId });

    expect(batches.map((batch) => batch.length)).toEqual([100, 1]);
  });

  it("keeps saved rows saved when a batch fails, and says how many", async () => {
    const ids = await addGroup(5);
    const { store } = batchingStore(1);

    const result = await editRows(store, ids, { categoryId: OWNER.categoryId }, 2);

    expect(result).toEqual({
      ok: false,
      message:
        "2 of 5 rows were saved. The rest are still in the inbox. Accept the group again to finish.",
    });
    const rows = await decisionsOn(ids);
    expect(rows.slice(0, 2)).toMatchObject([SPENDING_GROCERIES, SPENDING_GROCERIES]);
    for (const row of rows.slice(2)) {
      expect(row).toMatchObject({ type: null, category_id: null });
    }
  });

  it("can be accepted again after a failed batch, and finishes", async () => {
    const ids = await addGroup(5);
    await editRows(batchingStore(1).store, ids, { categoryId: OWNER.categoryId }, 2);

    const result = await accept(ids, { categoryId: OWNER.categoryId }, 2);

    expect(result).toEqual({ ok: true, notice: "3 rows were saved." });
    for (const row of await decisionsOn(ids)) {
      expect(row).toMatchObject(SPENDING_GROCERIES);
    }
  });

  it("says nothing was saved when the first batch fails", async () => {
    const ids = await addGroup(3);

    const result = await editRows(
      batchingStore(0).store,
      ids,
      { categoryId: OWNER.categoryId },
      2,
    );

    expect(result).toEqual(NOT_SAVED);
    for (const row of await decisionsOn(ids)) {
      expect(row).toMatchObject({ type: null, category_id: null });
    }
  });

  it("says this row for a group of one that fails", async () => {
    const ids = await addGroup(1);

    await expect(
      editRows(batchingStore(0).store, ids, { categoryId: OWNER.categoryId }),
    ).resolves.toEqual({ ok: false, message: "This row wasn't saved. Try again." });
  });
});

describe("a group that can't be accepted", () => {
  it.each<[string, unknown, unknown]>([
    ["no rows", [], { categoryId: OWNER.categoryId }],
    ["IDs that aren't a list", "row", { categoryId: OWNER.categoryId }],
    ["an ID that isn't text", [1], { categoryId: OWNER.categoryId }],
    ["an unknown type", [idFor(100)], { type: "refund" }],
    ["a type and a category that disagree", [idFor(100)], {
      type: "income",
      categoryId: OWNER.categoryId,
    }],
    ["no edit at all", [idFor(100)], null],
  ])("is refused: %s", async (_name, ids, edit) => {
    await addGroup(1);

    const result = await accept(ids as string[], edit as RowEdit);

    expect(result).toEqual(NOT_SAVED);
    await expect(decisionsOn([idFor(100)])).resolves.toMatchObject([
      { type: null, category_id: null },
    ]);
  });

  it("refuses a change to bank data", async () => {
    const ids = await addGroup(1);

    const result = await accept(ids, {
      description: "changed",
      categoryId: OWNER.categoryId,
    } as RowEdit);

    expect(result).toEqual({
      ok: false,
      message: "Bank dates, amounts and descriptions can't be changed.",
    });
  });

  it("refuses another user's rows", async () => {
    const theirs = idFor(900);
    await db.exec(insertTransaction(OTHER, "theirs", { id: `'${theirs}'` }));

    const result = await accept([theirs], { type: "income" });

    expect(result.ok).toBe(false);
    await expect(decisionsOn([theirs])).resolves.toMatchObject([{ type: null }]);
  });

  it("refuses a session that hasn't passed MFA", async () => {
    const ids = await addGroup(2);
    const store = rowEditStore(databaseClient(db, passwordOnly(OWNER)));

    const result = await editRows(store, ids, { categoryId: OWNER.categoryId });

    expect(result.ok).toBe(false);
    for (const row of await decisionsOn(ids)) {
      expect(row).toMatchObject({ type: null, category_id: null });
    }
  });

  it("keeps row data out of the message and the logs", async () => {
    const ids = await addGroup(3);
    const logged = LOG_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    const result = await editRows(
      batchingStore(1).store,
      ids,
      { categoryId: OWNER.categoryId, label: "SYNTHETIC SECRET LABEL" },
      2,
    );

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|0000-4000/);
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });
});
