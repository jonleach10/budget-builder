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
    // Their row matches the owner's rule and holds what it would write.
    const rule = await storeRule("PARCELPOINT MKTPL", "transfer");
    const theirs = await addRow(9, { type: "'transfer'" }, OTHER);

    await undoRuleSort(deps(), {
      ruleId: rule,
      created: false,
      type: "transfer",
      categoryId: null,
      fromNoType: [theirs],
      fromSpending: [],
    });

    const { rows } = await db.query<{ type: string | null }>(
      `select type from public.transactions where id = $1`,
      [theirs],
    );
    expect(rows[0].type).toBe("transfer");
  });
});

/** A stored rule of the owner's, made outside the inbox. */
async function storeRule(value: string, type: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.rules (user_id, match_on, value, type)
       values ($1, 'descriptionStartsWith', $2, $3) returning id`,
    [OWNER.id, value, type],
  );
  return rows[0].id;
}

async function ruleExists(id: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from public.rules where id = $1`, [id]);
  return rows.length === 1;
}

async function typeOf(id: string): Promise<string | null> {
  return (await decisionsOn(id)).type;
}

describe("an Undo token, checked on the server", () => {
  // From the review probe: a token could name any of the owner's rules.
  it("doesn't delete one of the owner's unrelated rules", async () => {
    const unrelated = await storeRule("SAMPLE PAYROLL", "income");

    const notice = await undoRuleSort(deps(), {
      ruleId: unrelated,
      created: true,
      type: "transfer",
      categoryId: null,
      fromNoType: [],
      fromSpending: [],
    });

    expect(await ruleExists(unrelated)).toBe(true);
    expect(notice.text).toBe("This rule has changed since the sort, so nothing was undone.");
  });

  // From the review probe: a type token with no rule sent any Transfer row back.
  it("is refused with no rule, so an unrelated Transfer row stays", async () => {
    const confirmed = await addRow(77, {
      description: "'SAMPLE BROKERAGE'",
      type: "'transfer'",
    });

    const notice = await undoRuleSort(deps(), {
      ruleId: null,
      type: "transfer",
      categoryId: null,
      fromNoType: [confirmed],
      fromSpending: [],
    } as unknown as SortUndo);

    expect(await typeOf(confirmed)).toBe("transfer");
    expect(notice.text).toBe("Nothing was undone. Try again.");
  });

  it("puts back only rows its rule matches", async () => {
    const rule = await storeRule("SAMPLE CARD AUTOPAY", "transfer");
    const matched = await addRow(78, { description: "'SAMPLE CARD AUTOPAY 1'", type: "'transfer'" });
    const unrelated = await addRow(79, { description: "'SAMPLE BROKERAGE'", type: "'transfer'" });

    const notice = await undoRuleSort(deps(), {
      ruleId: rule,
      created: false,
      type: "transfer",
      categoryId: null,
      fromNoType: [matched, unrelated],
      fromSpending: [],
    });

    expect(await typeOf(matched)).toBeNull();
    expect(await typeOf(unrelated)).toBe("transfer");
    // Sort N Rows used a rule already stored, so Undo keeps it.
    expect(await ruleExists(rule)).toBe(true);
    expect(notice.text).toBe(
      "1 row had changed since the sort, so it was left as it is. The other row is back in review.",
    );
  });

  it("says so when the rule is already gone, and puts nothing back", async () => {
    await addSource();
    const waiting = await addRow(2);
    const undo = await saveAndSort();
    await db.exec(`delete from public.rules where value = 'PARCELPOINT MKTPL'`);

    const notice = await undoRuleSort(deps(), undo);

    expect(notice.text).toBe("This rule no longer exists, so nothing was undone.");
    expect(await decisionsOn(waiting)).toEqual(BY_RULE);
  });
});
