import type { ActionResult, WriteResult } from "@/lib/actionResult";
import { isDirection, moveWithin, nextPosition } from "@/lib/ordering";
import {
  isIdRule,
  ruleFromForm,
  validateRule,
  type RuleForm,
  type RuleRow,
  type ValidRule,
} from "./rules";

type PlacedRule = ValidRule & { position: number };

/** The part of the rules table this needs, so tests can pass a fake. */
export type RuleStore = {
  /** Null means the read failed, which is different from having no rules. */
  list(): Promise<readonly RuleRow[] | null>;
  insert(rule: PlacedRule): Promise<WriteResult>;
  update(id: string, changes: Partial<PlacedRule>): Promise<WriteResult>;
  remove(id: string): Promise<WriteResult>;
};

const OK: ActionResult = { ok: true };
const NOT_SAVED: ActionResult = {
  ok: false,
  message: "The rule wasn't saved. Try again.",
};
const NOT_DELETED: ActionResult = {
  ok: false,
  message: "The rule wasn't deleted. Try again.",
};
const GONE: ActionResult = {
  ok: false,
  message: "This rule no longer exists. Reload the page to see the current list.",
};

function outcome(write: WriteResult, failed: ActionResult): ActionResult {
  if (write === "done") return OK;
  return write === "missing" ? GONE : failed;
}

function groupOf(rows: readonly RuleRow[], rule: Pick<RuleRow, "match_on">) {
  return rows.filter((row) => isIdRule(row) === isIdRule(rule));
}

export async function addRule(
  store: RuleStore,
  form: RuleForm,
): Promise<ActionResult> {
  const check = validateRule(ruleFromForm(form));
  if (!check.ok) return check;

  const rows = await store.list();
  if (rows === null) return NOT_SAVED;

  const position = nextPosition(groupOf(rows, check.rule));
  return outcome(await store.insert({ ...check.rule, position }), NOT_SAVED);
}

/** A rule keeps its place, unless its new match puts it in the other group. */
export async function editRule(
  store: RuleStore,
  id: string,
  form: RuleForm,
): Promise<ActionResult> {
  const check = validateRule(ruleFromForm(form));
  if (!check.ok) return check;

  const rows = await store.list();
  if (rows === null) return NOT_SAVED;

  const current = rows.find((row) => row.id === id);
  if (current === undefined) return GONE;

  const changes: Partial<PlacedRule> =
    isIdRule(current) === isIdRule(check.rule)
      ? check.rule
      : { ...check.rule, position: nextPosition(groupOf(rows, check.rule)) };

  return outcome(await store.update(id, changes), NOT_SAVED);
}

export async function deleteRule(
  store: RuleStore,
  id: string,
): Promise<ActionResult> {
  return outcome(await store.remove(id), NOT_DELETED);
}

/** Each group keeps its own order, so positions only matter within a group. */
export async function moveRule(
  store: RuleStore,
  id: string,
  direction: string,
): Promise<ActionResult> {
  if (!isDirection(direction)) return NOT_SAVED;

  const rows = await store.list();
  if (rows === null) return NOT_SAVED;

  const rule = rows.find((row) => row.id === id);
  if (rule === undefined) return GONE;

  for (const { id: rowId, position } of moveWithin(
    groupOf(rows, rule),
    id,
    direction,
  )) {
    const write = await store.update(rowId, { position });
    if (write !== "done") return outcome(write, NOT_SAVED);
  }
  return OK;
}
