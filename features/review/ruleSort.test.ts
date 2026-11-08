import { describe, expect, it } from "vitest";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import type { RuleStore } from "@/features/rules/ruleChanges";
import type { RuleForm, RuleRow } from "@/features/rules/rules";
import type { RowChanges, RowEditStore } from "@/features/transactions/rowEdits";
import type { ReviewSource } from "./reviewInbox";
import {
  mergeUndo,
  saveRuleFromInbox,
  sortByRule,
  undoRuleSort,
  type SortUndo,
} from "./ruleSort";

let nextId = 0;

/** A made-up stored row in review: no type, no category. */
function row(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  nextId += 1;
  return {
    id: `t${nextId}`,
    accountId: "acc-card",
    fingerprint: `fingerprint-${nextId}`,
    postedOn: "2026-10-03",
    amount: { minor: -4150, currency: "USD" },
    base: { minor: -4150, currency: "USD" },
    description: `PARCELPOINT MKTPL*${nextId}Q`,
    type: null,
    categoryId: null,
    categorySource: null,
    suggestedCategoryId: null,
    note: null,
    hidden: false,
    possibleDuplicate: false,
    transferPairId: null,
    ...extra,
  };
}

/** The accepted row the offer came from, now sorted by hand. */
function accepted(extra: Partial<StoredTransaction> = {}): StoredTransaction {
  return row({
    id: "source",
    description: "PARCELPOINT MKTPL*7Q2LM1",
    type: "spending",
    categoryId: "cat-shopping",
    categorySource: "manual",
    ...extra,
  });
}

type Options = {
  /** The updateInReview call (1 for the first) that fails. */
  failWrite?: number;
  /** The undoSort call (1 for the first) that fails. */
  failUndo?: number;
  failInsert?: boolean;
  failRemove?: boolean;
  /** Runs before each updateInReview, to change rows meanwhile. */
  beforeWrite?: (rows: Map<string, StoredTransaction>) => void;
};

/** The two tables in memory, with the same guards the Supabase store applies. */
function world(
  startRows: StoredTransaction[],
  startRules: RuleRow[] = [],
  options: Options = {},
) {
  const rows = new Map(startRows.map((stored) => [stored.id, { ...stored }]));
  let rules = [...startRules];
  let writes = 0;
  let undos = 0;

  function apply(id: string, changes: RowChanges) {
    const stored = rows.get(id) as StoredTransaction;
    const categoryId =
      changes.category_id === undefined ? stored.categoryId : changes.category_id;
    rows.set(id, {
      ...stored,
      type: changes.type === undefined ? stored.type : changes.type,
      categoryId,
      categorySource:
        categoryId === null
          ? null
          : changes.category_source === undefined
            ? stored.categorySource
            : changes.category_source,
    });
  }

  const ruleStore: RuleStore = {
    list: async () => rules,
    insert: async (rule) => {
      if (options.failInsert) return null;
      const id = `rule-${rules.length + 1}`;
      rules = [...rules, { ...rule, id }];
      return { id };
    },
    update: async () => "done",
    remove: async (id) => {
      if (options.failRemove) return "failed";
      if (!rules.some((rule) => rule.id === id)) return "missing";
      rules = rules.filter((rule) => rule.id !== id);
      return "done";
    },
  };

  const rowStore: RowEditStore = {
    read: async () => null,
    clearPair: async () => "failed",
    update: async () => "failed",
    async updateInReview(ids, type, changes) {
      writes += 1;
      options.beforeWrite?.(rows);
      if (writes === options.failWrite) return "failed";
      const hit = ids.filter((id) => {
        const stored = rows.get(id);
        return (
          stored !== undefined &&
          !stored.hidden &&
          stored.categoryId === null &&
          stored.transferPairId === null &&
          stored.type === type
        );
      });
      for (const id of hit) apply(id, changes);
      return hit;
    },
    async undoSort(ids, wrote, back) {
      undos += 1;
      if (undos === options.failUndo) return "failed";
      const hit = ids.filter((id) => {
        const stored = rows.get(id);
        return (
          stored !== undefined &&
          !stored.hidden &&
          stored.transferPairId === null &&
          stored.type === wrote.type &&
          stored.categoryId === wrote.categoryId &&
          (wrote.categoryId === null || stored.categorySource === "rule")
        );
      });
      for (const id of hit) apply(id, { type: back, category_id: null });
      return hit;
    },
  };

  const source = (): ReviewSource => ({
    rows: [...rows.values()],
    accounts: [
      { id: "acc-card", name: "Sandbox Card", country: "US" },
      { id: "acc-de", name: "Sandbox Girokonto", country: "DE" },
    ],
    pairingAccounts: [
      { id: "acc-card", format: "chase-card" },
      { id: "acc-de", format: "commerzbank" },
    ],
    categories: [
      { id: "cat-shopping", name: "Shopping", position: 0 },
      { id: "cat-gifts", name: "Gifts", position: 1 },
    ],
    thisMonth: "2026-11",
  });

  return {
    deps: (batchSize = 100) => ({
      rules: ruleStore,
      rows: rowStore,
      loadSource: async () => source(),
      batchSize,
    }),
    row: (id: string) => rows.get(id) as StoredTransaction,
    rules: () => rules,
  };
}

const SHOPPING_FORM: RuleForm = {
  matchOn: "descriptionStartsWith",
  value: "PARCELPOINT MKTPL",
  type: "spending",
  categoryId: "cat-shopping",
};

const TRANSFER_FORM: RuleForm = {
  matchOn: "descriptionStartsWith",
  value: "SAMPLE CARD AUTOPAY",
  type: "transfer",
  categoryId: "",
};

function sortedAsShopping(stored: StoredTransaction) {
  return {
    type: stored.type,
    categoryId: stored.categoryId,
    categorySource: stored.categorySource,
  };
}

const SHOPPING_BY_RULE = {
  type: "spending",
  categoryId: "cat-shopping",
  categorySource: "rule",
};

describe("saveRuleFromInbox", () => {
  it("adds the rule last in its group, and changes no row without Also sort", async () => {
    const other = row({ id: "other" });
    const stored = world([accepted(), other], [
      {
        id: "rule-0",
        match_on: "descriptionStartsWith",
        value: "CORNER MARKET",
        position: 4,
        type: null,
        category_id: "cat-gifts",
      },
    ]);

    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", false);

    expect(result).toEqual({
      ok: true,
      outcome: {
        tone: "done",
        text: "Rule saved. It applies to future imports.",
        undo: {
          ruleId: "rule-2",
          created: true,
          type: "spending",
          categoryId: "cat-shopping",
          fromNoType: [],
          fromSpending: [],
        },
        sortRest: null,
      },
    });
    expect(stored.rules().at(-1)).toMatchObject({
      value: "PARCELPOINT MKTPL",
      position: 5,
    });
    expect(stored.row("other").type).toBeNull();
  });

  it("sorts the rows the saved rule wins, worked out from stored rows", async () => {
    const none = row({ id: "none" });
    const spending = row({ id: "spending", type: "spending" });
    const unrelated = row({ id: "unrelated", description: "CORNER MARKET" });
    const stored = world([accepted(), none, spending, unrelated]);

    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", true);

    expect(result).toEqual({
      ok: true,
      outcome: {
        tone: "done",
        text: "Rule saved. 2 more rows were sorted as Shopping.",
        undo: {
          ruleId: "rule-1",
          created: true,
          type: "spending",
          categoryId: "cat-shopping",
          fromNoType: ["none"],
          fromSpending: ["spending"],
        },
        sortRest: null,
      },
    });
    expect(sortedAsShopping(stored.row("none"))).toEqual(SHOPPING_BY_RULE);
    expect(sortedAsShopping(stored.row("spending"))).toEqual(SHOPPING_BY_RULE);
    expect(stored.row("unrelated").type).toBeNull();
  });

  it("gives a type rule's rows only the type", async () => {
    const card = accepted({
      description: "SAMPLE CARD AUTOPAY",
      type: "transfer",
      categoryId: null,
      categorySource: null,
    });
    const other = row({ id: "other", description: "SAMPLE CARD AUTOPAY 2" });
    const stored = world([card, other]);

    const result = await saveRuleFromInbox(stored.deps(), TRANSFER_FORM, "source", true);

    expect(result.ok && result.outcome.text).toBe(
      "Rule saved. 1 more row was sorted as Transfer.",
    );
    expect(sortedAsShopping(stored.row("other"))).toEqual({
      type: "transfer",
      categoryId: null,
      categorySource: null,
    });
  });

  it("says how many rows had changed in the meantime", async () => {
    const stored = world([accepted(), row({ id: "a" }), row({ id: "b" })], [], {
      beforeWrite: (rows) => {
        const b = rows.get("b") as StoredTransaction;
        rows.set("b", { ...b, hidden: true });
      },
    });

    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", true);

    expect(result.ok && result.outcome.text).toBe(
      "Rule saved. 1 more row was sorted as Shopping. 1 row had already changed, so it was left as it is.",
    );
    expect(stored.row("b").categoryId).toBeNull();
  });

  it("sorts nothing when the rule isn't saved", async () => {
    const stored = world([accepted(), row({ id: "a" })], [], { failInsert: true });

    expect(
      await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", true),
    ).toEqual({
      ok: false,
      message: "The rule wasn't saved, so no rows were sorted. Try again.",
    });
    expect(stored.row("a").type).toBeNull();
  });

  it("says only that the rule wasn't saved without Also sort", async () => {
    const stored = world([accepted()], [], { failInsert: true });

    expect(
      await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", false),
    ).toEqual({ ok: false, message: "The rule wasn't saved. Try again." });
  });

  it("refuses a rule that's already stored", async () => {
    const same: RuleRow = {
      id: "rule-0",
      match_on: "descriptionStartsWith",
      value: "parcelpoint mktpl",
      position: 0,
      type: null,
      category_id: "cat-shopping",
    };
    const stored = world([accepted(), row({ id: "a" })], [same]);

    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", true);

    expect(result).toEqual({
      ok: false,
      message: "This rule already exists, so it wasn't added again.",
    });
    expect(stored.rules()).toEqual([same]);
    expect(stored.row("a").type).toBeNull();
  });

  it("refuses a rule an earlier rule would never let run", async () => {
    const earlier: RuleRow = {
      id: "rule-0",
      match_on: "descriptionStartsWith",
      value: "PARCELPOINT",
      position: 0,
      type: "spending",
      category_id: null,
    };
    const stored = world([accepted()], [earlier]);

    expect(
      await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", true),
    ).toEqual({
      ok: false,
      message: "An earlier rule decides this row first, so this rule wasn't added.",
    });
    expect(stored.rules()).toEqual([earlier]);
  });

  it("keeps the rule and saved rows when a batch fails, and Sort the Rest finishes", async () => {
    const rows = ["a", "b", "c", "d", "e"].map((id) => row({ id }));
    // Each batch of 2 is a Spending write, then a no-type write: the 3rd write
    // is the second batch's first.
    const stored = world([accepted(), ...rows], [], { failWrite: 3 });

    const result = await saveRuleFromInbox(stored.deps(2), SHOPPING_FORM, "source", true);

    expect(result).toEqual({
      ok: true,
      outcome: {
        tone: "error",
        text: "Rule saved, and 2 of 5 rows were sorted. The rest are still in the inbox. Click Sort the Rest to finish.",
        undo: {
          ruleId: "rule-1",
          created: true,
          type: "spending",
          categoryId: "cat-shopping",
          fromNoType: [expect.any(String), expect.any(String)],
          fromSpending: [],
        },
        sortRest: { ruleId: "rule-1", created: true },
      },
    });
    expect(stored.rules()).toHaveLength(1);
    const left = rows.filter(({ id }) => stored.row(id).type === null);
    expect(left).toHaveLength(3);

    const rest = await sortByRule(stored.deps(2), "rule-1", true);

    expect(rest.text).toBe("3 more rows were sorted as Shopping.");
    expect(rest.undo?.ruleId).toBe("rule-1");
    expect(rest.undo?.fromNoType).toHaveLength(3);
    for (const { id } of rows) {
      expect(sortedAsShopping(stored.row(id))).toEqual(SHOPPING_BY_RULE);
    }
  });

  it("says when a failed first batch sorted nothing", async () => {
    const stored = world([accepted(), row({ id: "a" })], [], { failWrite: 1 });

    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", true);

    expect(result.ok && result.outcome).toMatchObject({
      tone: "error",
      text: "Rule saved, but no rows were sorted. Click Sort the Rest to try again.",
      sortRest: { ruleId: "rule-1", created: true },
    });
  });

  it("refuses a form that isn't one", async () => {
    const stored = world([accepted()]);

    expect(
      await saveRuleFromInbox(stored.deps(), null as unknown as RuleForm, "source", true),
    ).toEqual({ ok: false, message: "The rule wasn't saved, so no rows were sorted. Try again." });
    expect(stored.rules()).toEqual([]);
  });

  it("adds no rule when the row it came from isn't stored", async () => {
    const stored = world([row({ id: "a" })]);

    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "gone", true);

    expect(result).toEqual({
      ok: false,
      message:
        "The row this rule came from can't be found, so the rule wasn't added. Reload the page to try again.",
    });
    expect(stored.rules()).toEqual([]);
    expect(stored.row("a").type).toBeNull();
  });
});

const STORED_SHOPPING: RuleRow = {
  id: "rule-0",
  match_on: "descriptionStartsWith",
  value: "PARCELPOINT MKTPL",
  position: 0,
  type: null,
  category_id: "cat-shopping",
};

describe("sortByRule on a rule that was already stored", () => {
  it("offers no Undo when no row matches it now", async () => {
    const stored = world([row({ id: "other", description: "CORNER MARKET" })], [STORED_SHOPPING]);

    expect(await sortByRule(stored.deps(), "rule-0", false)).toEqual({
      tone: "done",
      text: "No rows in review match this rule now.",
      undo: null,
      sortRest: null,
    });
  });

  it("offers no Undo when every row changed before it was sorted", async () => {
    const stored = world([row({ id: "a" })], [STORED_SHOPPING], {
      beforeWrite: (rows) => {
        const a = rows.get("a") as StoredTransaction;
        rows.set("a", { ...a, hidden: true });
      },
    });

    expect(await sortByRule(stored.deps(), "rule-0", false)).toEqual({
      tone: "done",
      text: "1 row had already changed, so it was left as it is.",
      undo: null,
      sortRest: null,
    });
  });

  it("keeps Sort the Rest from treating the stored rule as one to delete", async () => {
    const stored = world([row({ id: "a" })], [STORED_SHOPPING], { failWrite: 1 });

    const notice = await sortByRule(stored.deps(), "rule-0", false);

    expect(notice.undo).toBeNull();
    expect(notice.sortRest).toEqual({ ruleId: "rule-0", created: false });
  });
});

describe("sortByRule after Sort the Rest", () => {
  it("still offers Undo, which deletes the rule, when nothing was left to sort", async () => {
    const stored = world([row({ id: "other", description: "CORNER MARKET" })], [STORED_SHOPPING]);

    const notice = await sortByRule(stored.deps(), "rule-0", true);

    expect(notice.undo).toMatchObject({ ruleId: "rule-0", fromNoType: [], fromSpending: [] });
  });
});

describe("sortByRule", () => {
  it("sorts the rows a stored rule wins, and Undo won't delete that rule", async () => {
    const same: RuleRow = {
      id: "rule-0",
      match_on: "descriptionStartsWith",
      value: "PARCELPOINT MKTPL",
      position: 0,
      type: null,
      category_id: "cat-shopping",
    };
    const stored = world([row({ id: "a" }), row({ id: "b" })], [same]);

    const notice = await sortByRule(stored.deps(), "rule-0", false);

    expect(notice).toEqual({
      tone: "done",
      text: "2 rows were sorted as Shopping.",
      undo: {
        ruleId: "rule-0",
        created: false,
        type: "spending",
        categoryId: "cat-shopping",
        fromNoType: ["a", "b"],
        fromSpending: [],
      },
      sortRest: null,
    });
  });

  it("says when the rule no longer exists", async () => {
    const stored = world([row({ id: "a" })]);

    expect(await sortByRule(stored.deps(), "rule-gone", true)).toEqual({
      tone: "error",
      text: "This rule no longer exists, so no rows were sorted.",
      undo: null,
      sortRest: null,
    });
  });
});

function undoFor(extra: Partial<SortUndo> = {}): SortUndo {
  return {
    ruleId: "rule-1",
    created: true,
    type: "spending",
    categoryId: "cat-shopping",
    fromNoType: [],
    fromSpending: [],
    ...extra,
  };
}

async function savedAndSorted(rows: StoredTransaction[], options: Options = {}) {
  const stored = world([accepted(), ...rows], [], options);
  const result = await saveRuleFromInbox(stored.deps(1), SHOPPING_FORM, "source", true);
  if (!result.ok || result.outcome.undo === null) throw new Error("expected a sort");
  return { stored, undo: result.outcome.undo };
}

describe("undoRuleSort", () => {
  it("deletes the rule and returns each row to its earlier state", async () => {
    const { stored, undo } = await savedAndSorted([
      row({ id: "none" }),
      row({ id: "spending", type: "spending" }),
    ]);

    const notice = await undoRuleSort(stored.deps(), undo);

    expect(notice).toEqual({
      tone: "done",
      text: "The rule was deleted, and 2 rows are back in review.",
      undo: null,
      sortRest: null,
    });
    expect(stored.rules()).toEqual([]);
    expect(sortedAsShopping(stored.row("none"))).toEqual({
      type: null,
      categoryId: null,
      categorySource: null,
    });
    expect(stored.row("spending").type).toBe("spending");
    expect(stored.row("spending").categoryId).toBeNull();
    expect(stored.row("source").categorySource).toBe("manual");
  });

  it("leaves a row the owner changed since the sort", async () => {
    const { stored, undo } = await savedAndSorted([row({ id: "a" }), row({ id: "b" })]);
    const changed = stored.row("b");
    // The owner gave it another category by hand.
    Object.assign(changed, { categoryId: "cat-gifts", categorySource: "manual" });

    const notice = await undoRuleSort(stored.deps(), undo);

    expect(notice.text).toBe(
      "The rule was deleted, but 1 row had changed since the sort, so it was left as it is. The other row is back in review.",
    );
    expect(notice.tone).toBe("error");
    expect(stored.row("b").categoryId).toBe("cat-gifts");
    expect(stored.row("a").categoryId).toBeNull();
  });

  it("only deletes a rule saved without sorting", async () => {
    const stored = world([accepted(), row({ id: "a" })]);
    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", false);
    if (!result.ok || result.outcome.undo === null) throw new Error("expected a rule");

    const notice = await undoRuleSort(stored.deps(), result.outcome.undo);

    expect(notice.text).toBe("The rule was deleted.");
    expect(stored.rules()).toEqual([]);
  });

  it("puts the rows back first, and keeps Undo when the rule can't be deleted", async () => {
    const { stored, undo } = await savedAndSorted([row({ id: "a" })], { failRemove: true });

    const notice = await undoRuleSort(stored.deps(), undo);

    expect(notice).toEqual({
      tone: "error",
      text: "1 row is back in review, but the rule wasn't deleted. Click Undo to finish.",
      undo: { ...undo, fromNoType: [], fromSpending: [] },
      sortRest: null,
    });
    expect(stored.row("a").categoryId).toBeNull();
    expect(stored.rules()).toHaveLength(1);
  });

  it("undoes nothing when a rule saved without sorting can't be deleted", async () => {
    const stored = world([accepted()], [], { failRemove: true });
    const result = await saveRuleFromInbox(stored.deps(), SHOPPING_FORM, "source", false);
    if (!result.ok || result.outcome.undo === null) throw new Error("expected a rule");

    const notice = await undoRuleSort(stored.deps(), result.outcome.undo);

    expect(notice.text).toBe("Nothing was undone. Try again.");
    expect(notice.undo).toEqual(result.outcome.undo);
  });

  it("puts nothing back when the rule is already gone, and says so", async () => {
    const { stored, undo } = await savedAndSorted([row({ id: "a" })]);
    await stored.deps().rules.remove(undo.ruleId);

    const notice = await undoRuleSort(stored.deps(), undo);

    expect(notice).toEqual({
      tone: "error",
      text: "This rule no longer exists, so nothing was undone.",
      undo: null,
      sortRest: null,
    });
    expect(stored.row("a").categoryId).toBe("cat-shopping");
  });

  it("puts nothing back when the rule now gives something else", async () => {
    const { stored, undo } = await savedAndSorted([row({ id: "a" })]);

    const notice = await undoRuleSort(stored.deps(), { ...undo, categoryId: "cat-gifts" });

    expect(notice.text).toBe("This rule has changed since the sort, so nothing was undone.");
    expect(stored.rules()).toHaveLength(1);
    expect(stored.row("a").categoryId).toBe("cat-shopping");
  });

  it("puts back only rows the rule matches, whatever the token names", async () => {
    const { stored, undo } = await savedAndSorted([row({ id: "a" })]);
    const other = stored.row("source");

    const notice = await undoRuleSort(stored.deps(), {
      ...undo,
      fromNoType: [...undo.fromNoType, "unrelated"],
    });

    expect(notice.text).toBe(
      "The rule was deleted, but 1 row had changed since the sort, so it was left as it is. The other row is back in review.",
    );
    expect(other.categorySource).toBe("manual");
  });

  it("keeps the rows not yet put back when a batch fails, so Undo can finish", async () => {
    const rows = ["a", "b", "c"].map((id) => row({ id }));
    const { stored, undo } = await savedAndSorted(rows, { failUndo: 2 });

    const notice = await undoRuleSort(stored.deps(1), undo);

    expect(notice.tone).toBe("error");
    // The rule is deleted last, so it's still there to check the rest against.
    expect(notice.text).toBe("1 of 3 rows is back in review. Click Undo to finish.");
    expect(notice.undo).toEqual({ ...undo, fromNoType: undo.fromNoType.slice(1) });
    expect(stored.rules()).toHaveLength(1);

    const again = await undoRuleSort(stored.deps(), notice.undo as SortUndo);
    expect(again.text).toBe("The rule was deleted, and 2 rows are back in review.");
    for (const id of ["a", "b", "c"]) expect(stored.row(id).categoryId).toBeNull();
  });

  it("only puts rows back after Sort N Rows on a rule that was already stored", async () => {
    const stored = world([row({ id: "a" })], [
      {
        id: "rule-0",
        match_on: "descriptionStartsWith",
        value: "PARCELPOINT MKTPL",
        position: 0,
        type: null,
        category_id: "cat-shopping",
      },
    ]);
    const sorted = await sortByRule(stored.deps(), "rule-0", false);

    const notice = await undoRuleSort(stored.deps(), sorted.undo as SortUndo);

    expect(notice.text).toBe("1 row is back in review.");
    expect(stored.rules()).toHaveLength(1);
  });

  it("refuses a token that isn't one, without writing", async () => {
    const stored = world([row({ id: "a" })]);

    const notice = await undoRuleSort(
      stored.deps(),
      { ...undoFor(), fromNoType: [42] } as unknown as SortUndo,
    );

    expect(notice.text).toBe("Nothing was undone. Try again.");
  });
});

describe("mergeUndo", () => {
  it("adds Sort the Rest's rows to the first sort's", () => {
    expect(
      mergeUndo(
        undoFor({ fromNoType: ["a"], fromSpending: ["b"] }),
        undoFor({ fromNoType: ["c"] }),
      ),
    ).toEqual(undoFor({ fromNoType: ["a", "c"], fromSpending: ["b"] }));
  });
});
