import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadBudgetScreen,
  loadOverviewScreen,
} from "@/features/budget/loadScreens";
import {
  merchantKey,
  pastCategories,
} from "@/features/categorize/pastCategories";
import { readStoredTransactions } from "@/features/import/storedTransactions";
import {
  editRow,
  type RowChanges,
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

const session = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock("@/features/auth/requireSession", () => ({
  serverClient: async () => session.client,
}));

const LOG_METHODS = ["log", "info", "warn", "error", "debug"] as const;

const ROW = "00000000-0000-4000-8000-0000000000c1";
const OTHER_ROW = "00000000-0000-4000-8000-0000000000c2";
const UNRELATED_ROW = "00000000-0000-4000-8000-0000000000c3";
const PAIR = "00000000-0000-4000-8000-0000000000d1";

const PAIRED = { type: "'transfer'", transfer_pair_id: `'${PAIR}'` };

type Decisions = {
  type: string | null;
  category_id: string | null;
  category_source: string | null;
  note: string | null;
  hidden: boolean;
  transfer_pair_id: string | null;
};

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

// These edits commit, as the app's do, so each test starts from the seeded rows.
beforeEach(async () => {
  await db.exec(`
    delete from public.transactions where fingerprint <> 'seeded';
    delete from public.categories where name = 'Dining';
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Stores a row a statement could produce, with only the given columns decided. */
function addRow(
  id: string,
  extra: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  return db.exec(insertTransaction(OWNER, `row-${id}`, { id: `'${id}'`, ...extra }));
}

async function addPair(): Promise<void> {
  await addRow(ROW, PAIRED);
  await addRow(OTHER_ROW, PAIRED);
}

/** The columns of a spending row that already holds the owner's category. */
function categorized(source: string): Record<string, string> {
  return {
    type: "'spending'",
    category_id: `'${OWNER.categoryId}'`,
    category_source: `'${source}'`,
  };
}

async function addCategory(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.categories (user_id, name) values ($1, $2) returning id`,
    [OWNER.id, name],
  );
  return rows[0].id;
}

function save(id: string, edit: RowEdit) {
  return editRow(rowEditStore(databaseClient(db)), id, edit);
}

/** Every column of a row, as stored, apart from the one an edit may change. */
async function everythingBut(column: string, id: string): Promise<unknown> {
  const { rows } = await db.query<{ row: unknown }>(
    `select to_jsonb(stored) - $1 as row from public.transactions as stored
     where id = $2`,
    [column, id],
  );
  return rows[0].row;
}

/** What later imports learn from the stored rows, in the order stored. */
async function learnedFromRows() {
  const rows = await readStoredTransactions(databaseClient(db));
  const categorized = rows.map((row) => ({
    transaction: row,
    category: row.categoryId,
    source: row.categorySource ?? undefined,
  }));
  return {
    merchants: rows.map(merchantKey).sort(),
    pastCategories: pastCategories(categorized),
  };
}

const OCTOBER = { month: "2026-10", view: "us" } as const;

async function budgetSpent(): Promise<string | undefined> {
  const screen = await loadBudgetScreen(OCTOBER);
  return screen?.status === "ready" ? screen.totals.spent : undefined;
}

async function overviewSpent(): Promise<string | undefined> {
  const screen = await loadOverviewScreen(OCTOBER, OCTOBER.month);
  return screen?.status === "ready" ? screen.spent : undefined;
}

/** The real store, counting its writes. */
function countingStore() {
  const real = rowEditStore(databaseClient(db));
  const calls = {
    updates: 0,
    store: {
      ...real,
      update(...args: Parameters<RowEditStore["update"]>) {
        calls.updates += 1;
        return real.update(...args);
      },
    } satisfies RowEditStore,
  };
  return calls;
}

async function decisionsOn(id: string): Promise<Decisions> {
  const { rows } = await db.query<Decisions>(
    `select type, category_id, category_source, note, hidden, transfer_pair_id
     from public.transactions where id = $1`,
    [id],
  );
  return rows[0];
}

describe("choosing a category", () => {
  it("sets the type to spending and the source to manual", async () => {
    await addRow(ROW);

    const result = await save(ROW, { categoryId: OWNER.categoryId });

    expect(result).toEqual({ ok: true });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: OWNER.categoryId,
      category_source: "manual",
    });
  });

  it("replaces a category a rule gave, so past categories learn from it", async () => {
    const otherCategory = await addCategory("Dining");
    await addRow(ROW, categorized("rule"));

    await save(ROW, { categoryId: otherCategory });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: otherCategory,
      category_source: "manual",
    });
  });

  it("moves a row from another type to spending", async () => {
    await addRow(ROW, { type: "'income'" });

    await save(ROW, { categoryId: OWNER.categoryId });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: OWNER.categoryId,
    });
  });

  it("clears a category with a blank choice, and the row stays spending", async () => {
    await addRow(ROW, categorized("manual"));

    await save(ROW, { categoryId: null });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: null,
      category_source: null,
    });
  });
});

describe("moving a row away from spending", () => {
  it.each([["income"], ["transfer"], ["saved"], ["personal"]] as const)(
    "clears its category and source when it becomes %s",
    async (type) => {
      await addRow(ROW, categorized("manual"));

      const result = await save(ROW, { type });

      expect(result).toEqual({ ok: true });
      await expect(decisionsOn(ROW)).resolves.toMatchObject({
        type,
        category_id: null,
        category_source: null,
      });
    },
  );

  it("clears its category when it goes back to no type", async () => {
    await addRow(ROW, categorized("rule"));

    await save(ROW, { type: null });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: null,
      category_id: null,
      category_source: null,
    });
  });

  it("does it all in one update", async () => {
    await addRow(ROW, categorized("manual"));
    const calls = countingStore();

    await editRow(calls.store, ROW, { type: "income" });

    expect(calls.updates).toBe(1);
  });
});

describe("setting a type", () => {
  it("keeps the category when the row stays spending", async () => {
    await addRow(ROW, categorized("rule"));

    await save(ROW, { type: "spending" });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: OWNER.categoryId,
      category_source: "rule",
    });
  });

  it("writes nothing when the edit changes nothing", async () => {
    await addRow(ROW, categorized("rule"));
    const calls = countingStore();

    const result = await editRow(calls.store, ROW, { type: "spending" });

    expect(result).toEqual({ ok: true });
    expect(calls.updates).toBe(0);
  });
});

describe("changing a paired row's type", () => {
  it.each([["spending"], ["income"], ["saved"], ["personal"]] as const)(
    "removes the pair from both rows when it becomes %s",
    async (type) => {
      await addPair();

      const result = await save(ROW, { type });

      expect(result).toEqual({ ok: true });
      await expect(decisionsOn(ROW)).resolves.toMatchObject({
        type,
        transfer_pair_id: null,
      });
      await expect(decisionsOn(OTHER_ROW)).resolves.toMatchObject({
        type: null,
        category_id: null,
        transfer_pair_id: null,
      });
    },
  );

  it("sends both rows back to review when it goes to no type", async () => {
    await addPair();

    await save(ROW, { type: null });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: null,
      transfer_pair_id: null,
    });
    await expect(decisionsOn(OTHER_ROW)).resolves.toMatchObject({
      type: null,
      transfer_pair_id: null,
    });
  });

  it("removes the pair when a category makes the row spending", async () => {
    await addPair();

    await save(ROW, { categoryId: OWNER.categoryId });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: OWNER.categoryId,
      category_source: "manual",
      transfer_pair_id: null,
    });
    await expect(decisionsOn(OTHER_ROW)).resolves.toMatchObject({
      type: null,
      transfer_pair_id: null,
    });
  });

  it("leaves the other row's label and hidden state alone", async () => {
    await addRow(ROW, PAIRED);
    await addRow(OTHER_ROW, {
      ...PAIRED,
      note: "'Owner label'",
      hidden: "true",
    });

    await save(ROW, { type: "income" });

    await expect(decisionsOn(OTHER_ROW)).resolves.toMatchObject({
      note: "Owner label",
      hidden: true,
    });
  });

  it("leaves rows in other pairs alone", async () => {
    await addPair();
    const otherPair = {
      type: "'transfer'",
      transfer_pair_id: "'00000000-0000-4000-8000-0000000000d2'",
    };
    await addRow(UNRELATED_ROW, otherPair);

    await save(ROW, { type: "income" });

    await expect(decisionsOn(UNRELATED_ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: "00000000-0000-4000-8000-0000000000d2",
    });
  });

  it("keeps the pair when the row stays a transfer", async () => {
    await addPair();

    await save(ROW, { type: "transfer" });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
    await expect(decisionsOn(OTHER_ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
  });

  it("clears both rows in one update, before the owner's choice lands", async () => {
    await addPair();
    const real = rowEditStore(databaseClient(db));
    let seenAtChoice: Decisions[] = [];

    await editRow(
      {
        ...real,
        async update(...args) {
          seenAtChoice = [await decisionsOn(ROW), await decisionsOn(OTHER_ROW)];
          return real.update(...args);
        },
      },
      ROW,
      { type: "income" },
    );

    expect(seenAtChoice).toMatchObject([
      { type: null, transfer_pair_id: null },
      { type: null, transfer_pair_id: null },
    ]);
  });

  it("changes nothing if clearing the pair fails", async () => {
    await addPair();
    const real = rowEditStore(databaseClient(db));

    const result = await editRow(
      { ...real, clearPair: async () => "failed" },
      ROW,
      { type: "income" },
    );

    expect(result).toEqual({
      ok: false,
      message: "This row wasn't saved. Try again.",
    });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
    await expect(decisionsOn(OTHER_ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
  });

  it("says so if the pair went but the owner's choice didn't land", async () => {
    await addPair();
    const real = rowEditStore(databaseClient(db));

    const result = await editRow(
      { ...real, update: async () => "failed" },
      ROW,
      { type: "income" },
    );

    expect(result).toEqual({
      ok: false,
      message:
        "The pair was removed, but the rest of this edit wasn't saved. Both rows are back in review. Try again.",
    });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: null,
      transfer_pair_id: null,
    });
  });

  it("can be tried again after that, and lands", async () => {
    await addPair();
    const real = rowEditStore(databaseClient(db));
    await editRow({ ...real, update: async () => "failed" }, ROW, {
      type: "income",
    });

    const result = await save(ROW, { type: "income" });

    expect(result).toEqual({ ok: true });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({ type: "income" });
  });

  it("doesn't save a row that was paired after it was read", async () => {
    await addRow(ROW);
    const real = rowEditStore(databaseClient(db));

    const result = await editRow(
      {
        ...real,
        async read(id) {
          const row = await real.read(id);
          await db.exec(
            `update public.transactions
             set type = 'transfer', transfer_pair_id = '${PAIR}'
             where id = '${ROW}'`,
          );
          return row;
        },
      },
      ROW,
      { type: "income" },
    );

    expect(result.ok).toBe(false);
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
  });
});

describe("a label", () => {
  it("is stored trimmed in the note column", async () => {
    await addRow(ROW);

    const result = await save(ROW, { label: "  Corner shop  " });

    expect(result).toEqual({ ok: true });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      note: "Corner shop",
    });
  });

  it("is capped at 100 characters", async () => {
    await addRow(ROW);

    await save(ROW, { label: "a".repeat(101) });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      note: "a".repeat(100),
    });
  });

  it.each([
    ["an emoji", [0x1f6d2]],
    ["a flag", [0x1f1e9, 0x1f1ea]],
    ["a decomposed umlaut", [0x75, 0x308]],
    ["a joined emoji", [0x1f469, 0x200d, 0x1f467]],
  ])("counts %s as one character at the cap", async (_name, codePoints) => {
    await addRow(ROW);
    const character = String.fromCodePoint(...codePoints);

    await save(ROW, { label: `${"a".repeat(99)}${character}${character}` });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      note: `${"a".repeat(99)}${character}`,
    });
  });

  it("holds no trailing space when the cap lands on one", async () => {
    await addRow(ROW);

    await save(ROW, { label: `${"a".repeat(99)} b` });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      note: "a".repeat(99),
    });
  });

  it.each([
    ["empty", ""],
    ["spaces", "   "],
    ["a no-break space", String.fromCharCode(0xa0)],
  ])("is cleared by a blank value: %s", async (_name, label) => {
    await addRow(ROW, { note: "'Corner shop'" });

    await save(ROW, { label });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({ note: null });
  });

  it("changes nothing else on the row", async () => {
    await addRow(ROW, categorized("rule"));
    const before = await everythingBut("note", ROW);

    await save(ROW, { label: "Corner shop" });

    await expect(everythingBut("note", ROW)).resolves.toEqual(before);
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      note: "Corner shop",
    });
  });

  it("leaves merchant grouping and past categories as they were", async () => {
    await addRow(ROW, categorized("manual"));
    await addRow(OTHER_ROW, categorized("rule"));
    const before = await learnedFromRows();

    await save(ROW, { label: "Corner shop" });
    await save(OTHER_ROW, { label: "Other shop" });

    await expect(learnedFromRows()).resolves.toEqual(before);
  });

  it("keeps a row's pair", async () => {
    await addPair();

    await save(ROW, { label: "Rent move" });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
  });
});

describe("hiding a row", () => {
  it("stores the choice, and unhiding brings it back", async () => {
    await addRow(ROW);

    await save(ROW, { hidden: true });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({ hidden: true });

    await save(ROW, { hidden: false });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({ hidden: false });
  });

  it("keeps its type, category and pair", async () => {
    await addPair();
    await addRow(UNRELATED_ROW, categorized("manual"));

    await save(ROW, { hidden: true });
    await save(UNRELATED_ROW, { hidden: true });

    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "transfer",
      transfer_pair_id: PAIR,
    });
    await expect(decisionsOn(UNRELATED_ROW)).resolves.toMatchObject({
      type: "spending",
      category_id: OWNER.categoryId,
      category_source: "manual",
    });
  });

  it("leaves Budget's totals, and comes back when unhidden", async () => {
    await addRow(ROW, categorized("manual"));
    session.client = databaseClient(db);

    await expect(budgetSpent()).resolves.toBe("$12.50");

    await save(ROW, { hidden: true });
    await expect(budgetSpent()).resolves.toBe("$0.00");

    await save(ROW, { hidden: false });
    await expect(budgetSpent()).resolves.toBe("$12.50");
  });

  it("leaves Overview's totals, and comes back when unhidden", async () => {
    await addRow(ROW, categorized("manual"));
    session.client = databaseClient(db);

    await expect(overviewSpent()).resolves.toBe("$12.50");

    await save(ROW, { hidden: true });
    await expect(overviewSpent()).resolves.toBe("$0.00");

    await save(ROW, { hidden: false });
    await expect(overviewSpent()).resolves.toBe("$12.50");
  });
});

describe("dismissing a possible duplicate", () => {
  async function flagOn(id: string): Promise<boolean> {
    const { rows } = await db.query<{ possible_duplicate: boolean }>(
      `select possible_duplicate from public.transactions where id = $1`,
      [id],
    );
    return rows[0].possible_duplicate;
  }

  it("clears the flag and changes nothing else on the row", async () => {
    await addRow(ROW, { possible_duplicate: "true" });
    const before = await everythingBut("possible_duplicate", ROW);

    await expect(save(ROW, { possibleDuplicate: false })).resolves.toEqual({ ok: true });

    await expect(flagOn(ROW)).resolves.toBe(false);
    await expect(everythingBut("possible_duplicate", ROW)).resolves.toEqual(before);
  });

  it("keeps the row in Budget's totals", async () => {
    await addRow(ROW, { ...categorized("manual"), possible_duplicate: "true" });
    session.client = databaseClient(db);

    await save(ROW, { possibleDuplicate: false });

    await expect(budgetSpent()).resolves.toBe("$12.50");
  });

  it("refuses to flag a row, and changes nothing", async () => {
    await addRow(ROW);

    await expect(
      save(ROW, { possibleDuplicate: true } as unknown as RowEdit),
    ).resolves.toEqual({ ok: false, message: "This row wasn't saved. Try again." });
    await expect(flagOn(ROW)).resolves.toBe(false);
  });
});

describe("a change to bank data", () => {
  it.each([
    ["description"],
    ["purpose"],
    ["posted_on"],
    ["postedOn"],
    ["purchased_on"],
    ["amount_minor"],
    ["amount"],
    ["currency"],
    ["fingerprint"],
    ["base_amount_minor"],
    ["account_id"],
  ])("is refused: %s", async (field) => {
    await addRow(ROW);
    const before = await everythingBut("note", ROW);

    const result = await save(ROW, {
      [field]: "changed",
      label: "Corner shop",
    } as RowEdit);

    expect(result).toEqual({
      ok: false,
      message: "Bank dates, amounts and descriptions can't be changed.",
    });
    await expect(everythingBut("note", ROW)).resolves.toEqual(before);
    await expect(decisionsOn(ROW)).resolves.toMatchObject({ note: null });
  });

  it.each([
    ["description", "changed"],
    ["posted_on", "2026-10-02"],
    ["amount_minor", 1],
  ])("is refused by the column grants too: %s", async (column, value) => {
    await addRow(ROW);
    const before = await everythingBut("note", ROW);
    const store = rowEditStore(databaseClient(db));

    const write = await store.update(ROW, null, {
      [column]: value,
    } as RowChanges);

    expect(write).toBe("failed");
    await expect(everythingBut("note", ROW)).resolves.toEqual(before);
  });
});

describe("an edit that can't be saved", () => {
  const NOT_SAVED = { ok: false, message: "This row wasn't saved. Try again." };

  it.each<[string, unknown]>([
    ["an unknown type", { type: "refund" }],
    ["a type that isn't text", { type: 1 }],
    ["a category that isn't text", { categoryId: 1 }],
    ["a blank category", { categoryId: "" }],
    ["a label that isn't text", { label: 1 }],
    ["a hidden value that isn't true or false", { hidden: "true" }],
    [
      "a type and a category that disagree",
      { type: "income", categoryId: OWNER.categoryId },
    ],
    ["no type and a category", { type: null, categoryId: OWNER.categoryId }],
    ["no edit at all", null],
    ["text in place of an edit", "income"],
  ])("is refused: %s", async (_name, edit) => {
    await addRow(ROW, categorized("manual"));
    const before = await everythingBut("note", ROW);

    await expect(save(ROW, edit as RowEdit)).resolves.toEqual(NOT_SAVED);

    await expect(everythingBut("note", ROW)).resolves.toEqual(before);
  });

  it("refuses another user's category, and changes nothing", async () => {
    await addRow(ROW);

    const result = await save(ROW, { categoryId: OTHER.categoryId });

    expect(result).toEqual(NOT_SAVED);
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: null,
      category_id: null,
    });
  });

  it("refuses a row that doesn't exist", async () => {
    await expect(save(ROW, { hidden: true })).resolves.toEqual(NOT_SAVED);
  });

  it("refuses another user's row", async () => {
    await db.exec(
      insertTransaction(OTHER, "theirs", { id: `'${UNRELATED_ROW}'` }),
    );

    await expect(save(UNRELATED_ROW, { hidden: true })).resolves.toEqual(
      NOT_SAVED,
    );
    await expect(decisionsOn(UNRELATED_ROW)).resolves.toMatchObject({
      hidden: false,
    });
  });

  it("refuses a session that hasn't passed MFA", async () => {
    await addRow(ROW);
    const store = rowEditStore(databaseClient(db, passwordOnly(OWNER)));

    await expect(editRow(store, ROW, { hidden: true })).resolves.toEqual(
      NOT_SAVED,
    );
    await expect(decisionsOn(ROW)).resolves.toMatchObject({ hidden: false });
  });

  it("keeps a label and row text out of the message and the logs", async () => {
    await addRow(ROW);
    const logged = LOG_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    const result = await save(ROW, {
      label: "SYNTHETIC SECRET LABEL",
      categoryId: OTHER.categoryId,
    });

    expect(result).toEqual(NOT_SAVED);
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });
});

describe("no edit", () => {
  const EDITS: readonly [string, RowEdit][] = [
    ["spending", { type: "spending" }],
    ["income", { type: "income" }],
    ["saved", { type: "saved" }],
    ["personal", { type: "personal" }],
    ["no type", { type: null }],
    ["a category", { categoryId: OWNER.categoryId }],
  ];

  it.each(EDITS)(
    "leaves a row paired with a type other than transfer: %s",
    async (_name, edit) => {
      await addPair();

      await save(ROW, edit);

      const { rows } = await db.query(
        `select id from public.transactions
         where transfer_pair_id is not null
           and type is distinct from 'transfer'`,
      );
      expect(rows).toEqual([]);
    },
  );
});

describe("setting a row to transfer by hand", () => {
  it.each([
    ["in review, with no type", {}],
    ["that never reached review, with a rule's category", categorized("rule")],
    ["the owner already categorized", categorized("manual")],
    ["of another type", { type: "'income'" }],
    ["that's hidden", { hidden: "true" }],
  ])("works on a row %s, with no pair", async (_name, extra) => {
    await addRow(ROW, extra);

    const result = await save(ROW, { type: "transfer" });

    expect(result).toEqual({ ok: true });
    await expect(decisionsOn(ROW)).resolves.toMatchObject({
      type: "transfer",
      category_id: null,
      transfer_pair_id: null,
    });
  });
});
