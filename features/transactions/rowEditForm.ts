import type { TransactionType } from "@/features/categorize/transactionType";
import { cleanLabel, type RowEdit } from "./rowEdits";
import type { TransactionLine } from "./transactionsScreenData";

/** Edit Row's fields. A blank type or category means the row has none. */
export type RowForm = {
  label: string;
  type: TransactionType | "";
  categoryId: string;
  hidden: boolean;
};

export function rowForm(line: TransactionLine): RowForm {
  return {
    label: line.bankText === null ? "" : line.title,
    type: line.type ?? "",
    categoryId: line.category === null ? "" : (line.categoryId ?? ""),
    hidden: line.hidden,
  };
}

/** A category only means something under Spending, so changing type clears it. */
export function withFormType(form: RowForm, type: RowForm["type"]): RowForm {
  return { ...form, type, categoryId: "" };
}

/**
 * Only what the owner changed, because the write path treats every field it's
 * given as a decision. Saving a label on a row a rule categorized leaves the
 * category out, so the row doesn't start counting as confirmed.
 */
export function editFrom(line: TransactionLine, form: RowForm): RowEdit {
  const start = rowForm(line);
  const { label, type, categoryId, hidden } = form;

  return {
    ...(type === start.type ? {} : { type: type === "" ? null : type }),
    ...(categoryId === start.categoryId
      ? {}
      : { categoryId: categoryId === "" ? null : categoryId }),
    ...(cleanLabel(label) === cleanLabel(start.label) ? {} : { label }),
    ...(hidden === start.hidden ? {} : { hidden }),
  };
}

/** Shown before saving. The write path decides the same thing again. */
export function pairWarning(
  line: TransactionLine,
  form: RowForm,
): string | null {
  if (!line.paired || form.type === rowForm(line).type) return null;

  return line.pairedWith === null
    ? "Changing the type removes this row's pair. The other row goes back to review."
    : `Changing the type removes this row's pair with ${line.pairedWith}. That row goes back to review.`;
}
