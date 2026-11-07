import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readStoredTransactions } from "@/features/import/storedTransactions";
import {
  saveRuleFromInbox,
  undoRuleSort,
  type RuleSortDeps,
  type SortUndo,
} from "@/features/review/ruleSort";
import type { RuleForm } from "@/features/rules/rules";
import { ruleStore } from "@/features/rules/ruleStore";
import { rowEditStore } from "@/features/transactions/rowEditStore";
import { databaseClient } from "./databaseClient";
import { createTestDatabase, insertTransaction, OTHER, OWNER } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

// These writes commit, as the app's do, so each test starts from the seeded rows.
beforeEach(async () => {
  await db.exec(`
    delete from public.transactions where fingerprint <> 'seeded';
    delete from public.rules where value <> 'SYNTHETIC';
  `);
});

function idFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/** Stores a made-up row and gives its ID. */
async function addRow(
  index: number,
  extra: Readonly<Record<string, string>> = {},
  user = OWNER,
): Promise<string> {
  const id = idFor(index);
  await db.exec(
    insertTransaction(user, `row-${index}`, {
      id: `'${id}'`,
      description: `'PARCELPOINT MKTPL*${index}Q'`,
      ...extra,
    }),
  );
  return id;
}

/** The row the offer came from, accepted by hand. */
async function addSource(): Promise<string> {
  return addRow(1, {
    description: "'PARCELPOINT MKTPL*7Q2LM1'",
    type: "'spending'",
    category_id: `'${OWNER.categoryId}'`,
    category_source: "'manual'",
  });
}

function deps(): RuleSortDeps {
  const client = databaseClient(db);
  return {
    rules: ruleStore(client),
    rows: rowEditStore(client),
    loadSource: async () => ({
      rows: await readStoredTransactions(client),
      accounts: [{ id: OWNER.accountId, name: "Checking", country: "US" }],
      pairingAccounts: [{ id: OWNER.accountId, format: "chase-bank" }],
      categories: [{ id: OWNER.categoryId, name: "Groceries", position: 0 }],
      thisMonth: "2026-11",
    }),
  };
}

const FORM: RuleForm = {
  matchOn: "descriptionStartsWith",
  value: "PARCELPOINT MKTPL",
  type: "spending",
  categoryId: OWNER.categoryId,
};

type Decisions = {
  type: string | null;
  category_id: string | null;
  category_source: string | null;
};

async function decisionsOn(id: string): Promise<Decisions> {
  const { rows } = await db.query<Decisions>(
    `select type, category_id, category_source from public.transactions where id = $1`,
    [id],
  );
  return rows[0];
}

async function ruleValues(): Promise<string[]> {
  const { rows } = await db.query<{ value: string }>(
    `select value from public.rules where user_id = $1 order by position`,
    [OWNER.id],
  );
  return rows.map(({ value }) => value);
}

const IN_REVIEW = { type: null, category_id: null, category_source: null };
const BY_RULE = {
  type: "spending",
  category_id: OWNER.categoryId,
  category_source: "rule",
};

async function saveAndSort(): Promise<SortUndo> {
  const result = await saveRuleFromInbox(deps(), FORM, idFor(1), true);
  if (!result.ok || result.outcome.undo === null) throw new Error("expected a sort");
  return result.outcome.undo;
}

describe("a rule from the inbox", () => {
  it("is stored last, and changes no row without Also sort", async () => {
    await addSource();
    const waiting = await addRow(2);

    const result = await saveRuleFromInbox(deps(), FORM, idFor(1), false);

    expect(result.ok).toBe(true);
    expect(await ruleValues()).toEqual(["SYNTHETIC", "PARCELPOINT MKTPL"]);
    expect(await decisionsOn(waiting)).toEqual(IN_REVIEW);
  });

  it("sorts rows in review with a rule source, and Undo puts them back", async () => {
    await addSource();
    const none = await addRow(2);
    const spending = await addRow(3, { type: "'spending'" });
    const other = await addRow(4, { description: "'CORNER MARKET'" });

    const undo = await saveAndSort();

    expect(await decisionsOn(none)).toEqual(BY_RULE);
    expect(await decisionsOn(spending)).toEqual(BY_RULE);
    expect(await decisionsOn(other)).toEqual(IN_REVIEW);

    const notice = await undoRuleSort(deps(), undo);

    expect(notice.text).toBe("The rule was deleted, and 2 rows are back in review.");
    expect(await ruleValues()).toEqual(["SYNTHETIC"]);
    expect(await decisionsOn(none)).toEqual(IN_REVIEW);
    expect(await decisionsOn(spending)).toEqual({ ...IN_REVIEW, type: "spending" });
    expect(await decisionsOn(idFor(1))).toMatchObject({ category_source: "manual" });
  });

  it("leaves rows changed since the sort when Undo runs", async () => {
    await addSource();
    const confirmed = await addRow(2);
    const hidden = await addRow(3);
    const kept = await addRow(4);
    const undo = await saveAndSort();
    await db.exec(`
      update public.transactions set category_source = 'manual' where id = '${confirmed}';
      update public.transactions set hidden = true where id = '${hidden}';
    `);

    const notice = await undoRuleSort(deps(), undo);

    expect(notice.text).toBe(
      "The rule was deleted, but 2 rows had changed since the sort, so they were left as they are. The other row is back in review.",
    );
    expect(await decisionsOn(confirmed)).toEqual({ ...BY_RULE, category_source: "manual" });
    expect(await decisionsOn(hidden)).toEqual(BY_RULE);
    expect(await decisionsOn(kept)).toEqual(IN_REVIEW);
  });

  it("can't reach another user's rows through Undo", async () => {
    const theirs = await addRow(9, {
      type: "'spending'",
      category_id: `'${OTHER.categoryId}'`,
      category_source: "'rule'",
    }, OTHER);

    await undoRuleSort(deps(), {
      ruleId: null,
      type: "spending",
      categoryId: OTHER.categoryId,
      fromNoType: [theirs],
      fromSpending: [],
    });

    const { rows } = await db.query<{ category_id: string | null }>(
      `select category_id from public.transactions where id = $1`,
      [theirs],
    );
    expect(rows[0].category_id).toBe(OTHER.categoryId);
  });
});
