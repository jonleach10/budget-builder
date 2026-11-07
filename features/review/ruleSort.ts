import type { TransactionType } from "@/features/categorize/transactionType";
import { addRule, type RuleStore } from "@/features/rules/ruleChanges";
import {
  isTransactionType,
  ruleFromForm,
  TYPE_OPTIONS,
  validateRule,
  type RuleForm,
  type RuleRow,
  type ValidRule,
} from "@/features/rules/rules";
import {
  BATCH_SIZE,
  count,
  writeInReview,
  writtenCount,
  type RowChanges,
  type RowEditStore,
  type WrittenRows,
} from "@/features/transactions/rowEdits";
import type { ReviewSource } from "./reviewInbox";
import {
  ruleConflict,
  rowsRuleWouldSort,
  sortCandidates,
} from "./ruleFromCorrection";

/**
 * What Undo needs, held by the notice while it shows. The IDs only narrow
 * Undo's write: a row goes back only if it still holds what the sort wrote.
 */
export type SortUndo = {
  /** The rule to delete, or null when the sort used a rule already stored. */
  ruleId: string | null;
  type: TransactionType;
  categoryId: string | null;
} & WrittenRows;

/** A result in the inbox's notice. It never holds row data. */
export type SortNotice = {
  tone: "done" | "error";
  text: string;
  undo: SortUndo | null;
  /** The rule Sort the Rest sorts with, when a batch failed. */
  sortRest: string | null;
};

export type SaveRuleResult =
  | { ok: true; notice: SortNotice }
  | { ok: false; message: string };

export type RuleSortDeps = {
  rules: RuleStore;
  rows: RowEditStore;
  /** Every stored row and what the inbox needs, or null if a read failed. */
  loadSource: () => Promise<ReviewSource | null>;
  batchSize?: number;
};

const NOT_SAVED = "The rule wasn't saved. Try again.";
const NOT_SAVED_OR_SORTED =
  "The rule wasn't saved, so no rows were sorted. Try again.";
const EXISTS = "This rule already exists, so it wasn't added again.";
const EARLIER =
  "An earlier rule decides this row first, so this rule wasn't added.";
const NOTHING_UNDONE = "Nothing was undone. Try again.";
const SAVED_ONLY = "Rule saved. It applies to future imports.";

function rows(total: number, more = false): string {
  const word = total === 1 ? "row" : "rows";
  return `${count(total)}${more ? " more" : ""} ${word}`;
}

function isForm(form: unknown): form is RuleForm {
  if (typeof form !== "object" || form === null) return false;
  const fields = form as Record<string, unknown>;
  return ["matchOn", "value", "type", "categoryId"].every(
    (field) => typeof fields[field] === "string",
  );
}

function isIdList(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.every((id) => typeof id === "string");
}

/** A server action can be sent anything, so this checks more than the types do. */
function isUndo(undo: unknown): undo is SortUndo {
  if (typeof undo !== "object" || undo === null) return false;
  const token = undo as Record<string, unknown>;
  return (
    (token.ruleId === null || typeof token.ruleId === "string") &&
    isTransactionType(token.type) &&
    (token.categoryId === null ||
      (typeof token.categoryId === "string" && token.type === "spending")) &&
    isIdList(token.fromNoType) &&
    isIdList(token.fromSpending)
  );
}

/** A category rule makes its rows Spending. */
function typeWritten(rule: ValidRule): TransactionType {
  return rule.category_id === null ? (rule.type as TransactionType) : "spending";
}

/** What the notice says the rows were sorted as: the category, or the type. */
function outcomeName(rule: RuleRow, source: ReviewSource): string {
  if (rule.category_id !== null) {
    const category = source.categories.find(({ id }) => id === rule.category_id);
    return category?.name ?? "Spending";
  }
  return TYPE_OPTIONS.find(({ value }) => value === rule.type)?.label ?? "";
}

function changesOf(rule: RuleRow): RowChanges {
  return rule.category_id === null
    ? { type: rule.type }
    : { type: "spending", category_id: rule.category_id, category_source: "rule" };
}

type Sorted = {
  rule: RuleRow;
  name: string;
  /** The rows the rule would sort when the write started. */
  total: number;
  written: WrittenRows;
  failed: boolean;
};

/**
 * Works the rows out again from the stored rule and the stored rows, never from
 * IDs the browser sent, then writes them through `updateInReview`'s guards, so
 * a row changed meanwhile is skipped. "unread" means a read failed and nothing
 * was written.
 */
async function sortRows(
  deps: RuleSortDeps,
  ruleId: string,
): Promise<Sorted | "gone" | "unread"> {
  const [rules, source] = await Promise.all([deps.rules.list(), deps.loadSource()]);
  if (rules === null || source === null) return "unread";
  const rule = rules.find(({ id }) => id === ruleId);
  if (rule === undefined) return "gone";

  const ids = rowsRuleWouldSort(rule, rules, sortCandidates(source)).map(
    ({ id }) => id,
  );
  const { written, failed } = await writeInReview(
    deps.rows,
    ids,
    rule.category_id === null ? [null] : ["spending", null],
    changesOf(rule),
    deps.batchSize ?? BATCH_SIZE,
  );
  return { rule, name: outcomeName(rule, source), total: ids.length, written, failed };
}

/**
 * How a sort reads in the notice. `saved` puts "Rule saved" first. `created`
 * means the rule was just added here: its rows are "more" than the group's,
 * and Undo deletes the rule too.
 */
function sortedNotice(
  sorted: Sorted,
  { saved, created }: { saved: boolean; created: boolean },
): SortNotice {
  const done = writtenCount(sorted.written);
  const undo: SortUndo = {
    ruleId: created ? sorted.rule.id : null,
    type: typeWritten(sorted.rule),
    categoryId: sorted.rule.category_id,
    ...sorted.written,
  };

  if (sorted.failed) {
    const someText = `${count(done)} of ${rows(sorted.total)} were sorted. The rest are still in the inbox. Click Sort the Rest to finish.`;
    const text = saved
      ? done === 0
        ? "Rule saved, but no rows were sorted. Click Sort the Rest to try again."
        : `Rule saved, and ${someText}`
      : done === 0
        ? "No rows were sorted. Click Sort the Rest to try again."
        : someText;
    return { tone: "error", text, undo, sortRest: sorted.rule.id };
  }

  if (sorted.total === 0) {
    const text = saved ? SAVED_ONLY : "No rows in review match this rule now.";
    return { tone: "done", text, undo, sortRest: null };
  }

  const skipped = sorted.total - done;
  const sortedText = `${rows(done, created)} ${done === 1 ? "was" : "were"} sorted as ${sorted.name}.`;
  const skippedText =
    skipped === 0
      ? ""
      : skipped === 1
        ? " 1 row had already changed, so it was left as it is."
        : ` ${rows(skipped)} had already changed, so they were left as they are.`;
  return {
    tone: "done",
    text: `${saved ? "Rule saved. " : ""}${sortedText}${skippedText}`,
    undo,
    sortRest: null,
  };
}

/**
 * Adds a rule from the inbox, and with `alsoSort` sorts the rows in review it
 * would win. The rule saves first, so if it fails nothing is sorted. If a batch
 * of rows fails, the rule and the rows saved stay, and Sort the Rest finishes.
 * Refuses a rule already stored, or one a stored rule beats on its source row.
 */
export async function saveRuleFromInbox(
  deps: RuleSortDeps,
  form: RuleForm,
  sourceId: string,
  alsoSort: boolean,
): Promise<SaveRuleResult> {
  const failed = {
    ok: false as const,
    message: alsoSort === true ? NOT_SAVED_OR_SORTED : NOT_SAVED,
  };
  if (!isForm(form)) return failed;
  const check = validateRule(ruleFromForm(form));
  if (!check.ok) return check;

  const [rules, source] = await Promise.all([deps.rules.list(), deps.loadSource()]);
  if (rules === null || source === null) return failed;
  const sourceRow = source.rows.find(({ id }) => id === sourceId);
  const conflict =
    sourceRow === undefined ? null : ruleConflict(check.rule, rules, sourceRow);
  if (conflict !== null) {
    return { ok: false, message: conflict.kind === "exists" ? EXISTS : EARLIER };
  }

  const added = await addRule(deps.rules, form);
  if (!added.ok) return failed;

  const justSaved: SortNotice = {
    tone: "done",
    text: SAVED_ONLY,
    undo: {
      ruleId: added.id,
      type: typeWritten(check.rule),
      categoryId: check.rule.category_id,
      fromNoType: [],
      fromSpending: [],
    },
    sortRest: null,
  };
  if (alsoSort !== true) return { ok: true, notice: justSaved };

  const sorted = await sortRows(deps, added.id);
  if (typeof sorted === "string") {
    return {
      ok: true,
      notice: {
        ...justSaved,
        tone: "error",
        text: "Rule saved, but no rows were sorted. Click Sort the Rest to try again.",
        sortRest: added.id,
      },
    };
  }
  return { ok: true, notice: sortedNotice(sorted, { saved: true, created: true }) };
}

/**
 * Sorts the rows in review a stored rule wins: Sort the Rest after a failed
 * batch (`created`, as the inbox just added the rule), or Sort N Rows when the
 * same rule was already stored.
 */
export async function sortByRule(
  deps: RuleSortDeps,
  ruleId: string,
  created: boolean,
): Promise<SortNotice> {
  const sorted = typeof ruleId === "string" ? await sortRows(deps, ruleId) : "unread";
  if (sorted === "gone") {
    return {
      tone: "error",
      text: "This rule no longer exists, so no rows were sorted.",
      undo: null,
      sortRest: null,
    };
  }
  if (sorted === "unread") {
    return {
      tone: "error",
      text: "No rows were sorted. Try again.",
      undo: null,
      sortRest: created === true ? ruleId : null,
    };
  }
  return sortedNotice(sorted, { saved: false, created: created === true });
}

/** Sort the Rest adds to what the first sort wrote, so one Undo covers both. */
export function mergeUndo(first: SortUndo, rest: SortUndo): SortUndo {
  return {
    ...first,
    fromNoType: [...first.fromNoType, ...rest.fromNoType],
    fromSpending: [...first.fromSpending, ...rest.fromSpending],
  };
}

function areBack(total: number): string {
  return `${rows(total)} ${total === 1 ? "is" : "are"} back in review.`;
}

/** Joins "The rule was deleted" to the rest, when a rule was deleted. */
function afterDelete(deleted: boolean, joiner: string, rest: string): string {
  if (!deleted) return rest.charAt(0).toUpperCase() + rest.slice(1);
  return `The rule was deleted${joiner}${rest}`;
}

function undoneText(deleted: boolean, back: number, total: number): string {
  if (total === 0) return deleted ? "The rule was deleted." : "Nothing needed undoing.";

  const changed = total - back;
  if (changed === 0) return afterDelete(deleted, ", and ", areBack(back));

  const left =
    changed === 1
      ? "1 row had changed since the sort, so it was left as it is."
      : `${rows(changed)} had changed since the sort, so they were left as they are.`;
  const other =
    back === 0
      ? ""
      : back === 1
        ? " The other row is back in review."
        : ` The other ${count(back)} are back in review.`;
  return afterDelete(deleted, ", but ", `${left}${other}`);
}

/**
 * Deletes the rule, then puts each sorted row back to its earlier state, only
 * where it still holds what the sort wrote. A rule already gone counts as
 * deleted, so Undo can be tried again. If a batch of rows fails, the notice
 * keeps the rows not yet tried, so Undo can finish.
 */
export async function undoRuleSort(
  deps: RuleSortDeps,
  undo: SortUndo,
): Promise<SortNotice> {
  if (!isUndo(undo)) {
    return { tone: "error", text: NOTHING_UNDONE, undo: null, sortRest: null };
  }
  const deleted = undo.ruleId !== null;
  if (deleted && (await deps.rules.remove(undo.ruleId as string)) === "failed") {
    return { tone: "error", text: NOTHING_UNDONE, undo, sortRest: null };
  }

  const total = undo.fromNoType.length + undo.fromSpending.length;
  const wrote = { type: undo.type, categoryId: undo.categoryId };
  const batchSize = deps.batchSize ?? BATCH_SIZE;
  let back = 0;

  for (const [list, earlier] of [
    ["fromNoType", null],
    ["fromSpending", "spending"],
  ] as const) {
    const ids = undo[list];
    for (let start = 0; start < ids.length; start += batchSize) {
      const batch = ids.slice(start, start + batchSize);
      const write = await deps.rows.undoSort(batch, wrote, earlier);
      if (write === "failed") {
        const rest: SortUndo =
          list === "fromNoType"
            ? { ...undo, fromNoType: ids.slice(start) }
            : { ...undo, fromNoType: [], fromSpending: ids.slice(start) };
        const part = `${count(back)} of ${rows(total)} ${back === 1 ? "is" : "are"} back in review. Click Undo to finish.`;
        return {
          tone: "error",
          text: afterDelete(deleted, ", and ", part),
          undo: rest,
          sortRest: null,
        };
      }
      back += write.length;
    }
  }

  return {
    tone: back === total ? "done" : "error",
    text: undoneText(deleted, back, total),
    undo: null,
    sortRest: null,
  };
}
