import {
  BATCH_SIZE,
  cleanLabel,
  noneSaved,
  ROWS_CHANGED,
  writeRows,
  type RowEditStore,
  type RowsResult,
} from "@/features/transactions/rowEdits";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import { rowsText } from "./reviewInbox";

/** The label a row holds now, as stored, or null with none. */
function labelOf(line: TransactionLine): string | null {
  return line.bankText === null ? null : cleanLabel(line.title);
}

/** The dialog starts with the label every row shares, as Edit Row starts with the row's. */
export function groupLabelStart(rows: readonly TransactionLine[]): string {
  const [first, ...rest] = rows.map(labelOf);
  return first !== null && first !== undefined && rest.every((label) => label === first)
    ? first
    : "";
}

export type GroupLabelCheck = {
  /** What saving changes beyond adding the label, said before saving. */
  warning: string | null;
  /** A blank label with no label to clear would change nothing. */
  canSave: boolean;
  saveText: "Save Label" | "Clear Labels";
};

/** Change All overwrites every row's label, so the dialog says what that replaces. */
export function checkGroupLabel(
  rows: readonly TransactionLine[],
  label: string,
): GroupLabelCheck {
  const next = cleanLabel(label);
  const held = rows.map(labelOf).filter((other) => other !== null);

  if (next === null) {
    return held.length === 0
      ? { warning: null, canSave: false, saveText: "Save Label" }
      : {
          warning:
            "The label is blank, so saving clears the label on every row in this group.",
          canSave: true,
          saveText: "Clear Labels",
        };
  }

  const replaced = held.filter((other) => other !== next).length;
  const warning =
    replaced === 0
      ? null
      : replaced === 1
        ? "1 row already has a different label. Saving replaces it."
        : `${rowsText(replaced)} already have a different label. Saving replaces them.`;
  return { warning, canSave: true, saveText: "Save Label" };
}

/** As Accept and a rule's sort say it, for a row changed since the inbox loaded. */
function leftText(left: number): string {
  if (left === 0) return "";
  return left === 1
    ? " 1 row had already left review, so it was left as it is."
    : ` ${rowsText(left)} had already left review, so they were left as they are.`;
}

/**
 * Change All: gives every row of a merchant group still in review one label,
 * through the same write path as Accept. Only the label is sent, so the rows
 * keep their type and category and stay in review. A blank label clears it.
 * A row that left review since the inbox loaded is left as it is.
 */
export async function labelGroup(
  store: RowEditStore,
  ids: readonly string[],
  label: string,
  batchSize = BATCH_SIZE,
): Promise<RowsResult> {
  const write = await writeRows(store, ids, { label }, batchSize);
  if ("refused" in write) return write.refused;
  const { saved, total, failed } = write;
  const done = cleanLabel(label) === null ? "cleared" : "saved";

  if (failed) {
    if (saved === 0) return noneSaved(total);
    return {
      ok: false,
      message: `The label was ${done} on ${saved.toLocaleString("en-US")} of ${rowsText(total)}. Click Change All again to finish.`,
    };
  }
  if (saved === 0) return ROWS_CHANGED;
  return {
    ok: true,
    notice: `The label was ${done} on ${rowsText(saved)}.${leftText(total - saved)}`,
    saved,
    total,
  };
}
