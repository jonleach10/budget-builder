import type { ActionResult, WriteResult } from "@/lib/actionResult";
import { isDirection, moveWithin, nextPosition } from "@/lib/ordering";
import {
  deleteRefusal,
  DUPLICATE_NAME,
  validateCategoryName,
  type CategoryRow,
  type CategoryUsage,
} from "./categories";

type CategoryWrite = WriteResult | "duplicate";

/** The parts of the database this needs, so tests can pass a fake. */
export type CategoryStore = {
  /** Null means the read failed, which is different from having no categories. */
  list(): Promise<readonly CategoryRow[] | null>;
  /** Null means a count failed, so the usage isn't known. */
  usage(id: string): Promise<CategoryUsage | null>;
  insert(category: Omit<CategoryRow, "id">): Promise<CategoryWrite>;
  update(
    id: string,
    changes: Partial<Omit<CategoryRow, "id">>,
  ): Promise<CategoryWrite>;
  remove(id: string): Promise<WriteResult>;
};

const OK: ActionResult = { ok: true };
const NOT_SAVED: ActionResult = {
  ok: false,
  message: "The category wasn't saved. Try again.",
};
const NOT_DELETED: ActionResult = {
  ok: false,
  message: "The category wasn't deleted. Try again.",
};
const GONE: ActionResult = {
  ok: false,
  message:
    "This category no longer exists. Reload the page to see the current list.",
};

function outcome(write: CategoryWrite, failed: ActionResult): ActionResult {
  switch (write) {
    case "done":
      return OK;
    case "missing":
      return GONE;
    case "duplicate":
      return { ok: false, message: DUPLICATE_NAME };
    case "failed":
      return failed;
  }
}

export async function addCategory(
  store: CategoryStore,
  name: string,
): Promise<ActionResult> {
  const rows = await store.list();
  if (rows === null) return NOT_SAVED;

  const check = validateCategoryName(name, rows);
  if (!check.ok) return check;

  return outcome(
    await store.insert({ name: check.name, position: nextPosition(rows) }),
    NOT_SAVED,
  );
}

export async function renameCategory(
  store: CategoryStore,
  id: string,
  name: string,
): Promise<ActionResult> {
  const rows = await store.list();
  if (rows === null) return NOT_SAVED;
  if (!rows.some((row) => row.id === id)) return GONE;

  const check = validateCategoryName(name, rows, id);
  if (!check.ok) return check;

  return outcome(await store.update(id, { name: check.name }), NOT_SAVED);
}

export async function moveCategory(
  store: CategoryStore,
  id: string,
  direction: string,
): Promise<ActionResult> {
  if (!isDirection(direction)) return NOT_SAVED;

  const rows = await store.list();
  if (rows === null) return NOT_SAVED;
  if (!rows.some((row) => row.id === id)) return GONE;

  for (const { id: rowId, position } of moveWithin(rows, id, direction)) {
    const write = await store.update(rowId, { position });
    if (write !== "done") return outcome(write, NOT_SAVED);
  }
  return OK;
}

/**
 * The foreign keys would remove a category's rules and budget amounts and clear
 * it from transactions, so this deletes only on counts it has read and found to
 * be zero. A failed count stops the delete.
 */
export async function deleteCategory(
  store: CategoryStore,
  id: string,
): Promise<ActionResult> {
  const rows = await store.list();
  if (rows === null) return NOT_DELETED;

  const category = rows.find((row) => row.id === id);
  if (category === undefined) return GONE;

  const usage = await store.usage(category.id);
  if (usage === null) return NOT_DELETED;

  const refusal = deleteRefusal(category.name, usage);
  if (refusal !== null) return { ok: false, message: refusal };

  const result = outcome(await store.remove(category.id), NOT_DELETED);
  return result.ok ? { ok: true, notice: `${category.name} deleted.` } : result;
}
