import type { TransactionType } from "@/features/categorize/transactionType";
import { isTransactionType } from "@/features/rules/rules";
import type { ActionResult, WriteResult } from "@/lib/actionResult";

export const LABEL_LIMIT = 100;

/**
 * What the owner decided about a row. A field left out stays as it is, so a
 * label alone can't touch the row's type or category. Bank fields aren't here,
 * and `editRow` refuses any edit that names one.
 */
export type RowEdit = {
  /** Null sends the row back to review with no type. */
  type?: TransactionType | null;
  /** A category makes the row spending. Null clears the one it has. */
  categoryId?: string | null;
  /** Lives in `note`, so it never reaches `description`, rules or fingerprints. */
  label?: string;
  hidden?: boolean;
};

/** What a stored row holds that decides how an edit lands on it. */
export type RowState = {
  type: TransactionType | null;
  category_id: string | null;
  transfer_pair_id: string | null;
};

export type RowChanges = {
  type?: TransactionType | null;
  category_id?: string | null;
  category_source?: "manual" | null;
  note?: string | null;
  hidden?: boolean;
};

/** The part of the transactions table this needs. */
export type RowEditStore = {
  /** Null means the read failed or there's no such row. */
  read(id: string): Promise<RowState | null>;
  /** Sends every row in a pair back to review, in one update. */
  clearPair(pairId: string): Promise<WriteResult>;
  /** Lands only while the row's pair is still `pairId`, which can be null. */
  update(
    id: string,
    pairId: string | null,
    changes: RowChanges,
  ): Promise<WriteResult>;
};

const EDIT_FIELDS: ReadonlySet<string> = new Set([
  "type",
  "categoryId",
  "label",
  "hidden",
] satisfies (keyof RowEdit)[]);

const OK: ActionResult = { ok: true };
const NOT_SAVED: ActionResult = {
  ok: false,
  message: "This row wasn't saved. Try again.",
};
const BANK_DATA: ActionResult = {
  ok: false,
  message: "Bank dates, amounts and descriptions can't be changed.",
};
const ONLY_PAIR_REMOVED: ActionResult = {
  ok: false,
  message:
    "The pair was removed, but the rest of this edit wasn't saved. Both rows are back in review. Try again.",
};

/** What `clearPair` leaves on a row. */
const IN_REVIEW = { type: null, category_id: null, transfer_pair_id: null };

const READER_CHARACTERS = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Counts what a reader sees as one character, so the cap can't cut one in half. */
export function cleanLabel(text: string): string | null {
  const characters = [...READER_CHARACTERS.segment(text.trim())];
  const capped = characters
    .slice(0, LABEL_LIMIT)
    .map(({ segment }) => segment)
    .join("")
    .trimEnd();
  return capped === "" ? null : capped;
}

/** A server action can be sent anything, so this checks more than the types do. */
function isValidEdit({ type, categoryId, label, hidden }: RowEdit): boolean {
  const hasCategory = typeof categoryId === "string";
  return (
    (type === undefined || type === null || isTransactionType(type)) &&
    (categoryId === undefined ||
      categoryId === null ||
      (hasCategory && categoryId !== "")) &&
    (label === undefined || typeof label === "string") &&
    (hidden === undefined || typeof hidden === "boolean") &&
    (!hasCategory || type === undefined || type === "spending")
  );
}

function typeAfter(row: RowState, edit: RowEdit): TransactionType | null {
  if (typeof edit.categoryId === "string") return "spending";
  return edit.type === undefined ? row.type : edit.type;
}

/** The schema refuses a category on any type but spending. */
function categoryChanges(
  row: RowState,
  edit: RowEdit,
  type: TransactionType | null,
): RowChanges {
  if (typeof edit.categoryId === "string") {
    return { category_id: edit.categoryId, category_source: "manual" };
  }
  const clears = edit.categoryId === null || type !== "spending";
  return clears && row.category_id !== null
    ? { category_id: null, category_source: null }
    : {};
}

function changesFor(row: RowState, edit: RowEdit): RowChanges {
  const type = typeAfter(row, edit);
  return {
    ...(type === row.type ? {} : { type }),
    ...categoryChanges(row, edit, type),
    ...(edit.label === undefined ? {} : { note: cleanLabel(edit.label) }),
    ...(edit.hidden === undefined ? {} : { hidden: edit.hidden }),
  };
}

/**
 * The one way a stored row's review columns change. Changing a paired row's
 * type clears the pair from both rows first, in one update, so a failure can't
 * leave one row holding half a pair. The owner's choice then lands on a row
 * that's back in review.
 */
export async function editRow(
  store: RowEditStore,
  id: string,
  edit: RowEdit,
): Promise<ActionResult> {
  if (typeof edit !== "object" || edit === null) return NOT_SAVED;
  if (Object.keys(edit).some((field) => !EDIT_FIELDS.has(field))) {
    return BANK_DATA;
  }
  if (!isValidEdit(edit)) return NOT_SAVED;

  const row = await store.read(id);
  if (row === null) return NOT_SAVED;

  const pairId = row.transfer_pair_id;
  const breaksPair = pairId !== null && typeAfter(row, edit) !== row.type;
  if (breaksPair && (await store.clearPair(pairId)) !== "done") {
    return NOT_SAVED;
  }

  const start = breaksPair ? IN_REVIEW : row;
  const changes = changesFor(start, edit);
  if (Object.keys(changes).length === 0) return OK;

  const write = await store.update(id, start.transfer_pair_id, changes);
  if (write === "done") return OK;
  return breaksPair ? ONLY_PAIR_REMOVED : NOT_SAVED;
}
