import type { TransactionType } from "@/features/categorize/transactionType";
import { cleanLabel, type RowEdit } from "@/features/transactions/rowEdits";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import type { Suggestion } from "./reviewInbox";

/** What the owner picks for a group or a row. A blank category means none yet. */
export type Decision = { type: TransactionType; categoryId: string };

/** Spending with no category: the owner still has to choose one. */
export const START_DECISION: Decision = { type: "spending", categoryId: "" };

/** A category only means something under Spending, so changing type clears it. */
export function withDecisionType(
  decision: Decision,
  type: TransactionType,
): Decision {
  return { ...decision, type, categoryId: "" };
}

/**
 * The edit a finished decision makes, or null while spending has no category.
 * A category makes a row spending, so the type goes only when it isn't.
 */
export function decisionEdit({ type, categoryId }: Decision): RowEdit | null {
  if (type !== "spending") return { type };
  return categoryId === "" ? null : { categoryId };
}

export function acceptLabel(count: number): string {
  return count === 1
    ? "Accept 1 Row"
    : `Accept ${count.toLocaleString("en-US")} Rows`;
}

/** Use fills the category with the suggestion. It's hidden once that's done. */
export function showsUse(
  decision: Decision,
  suggestion: Suggestion | null,
): boolean {
  return (
    suggestion !== null &&
    decision.type === "spending" &&
    decision.categoryId !== suggestion.categoryId
  );
}

export type NoMerchantForm = Decision & { label: string };

export function noMerchantForm(line: TransactionLine): NoMerchantForm {
  return {
    label: line.bankText === null ? "" : line.title,
    type: line.type ?? "spending",
    categoryId: "",
  };
}

/**
 * What saving a No Merchant row sends, or null if nothing changed. A label can
 * be saved alone, so the owner can note a payee before choosing a category.
 */
export function noMerchantEdit(
  line: TransactionLine,
  form: NoMerchantForm,
): RowEdit | null {
  const decided = decisionEdit(form);
  const labelChanged =
    cleanLabel(form.label) !== cleanLabel(noMerchantForm(line).label);
  const edit: RowEdit = {
    ...(decided ?? {}),
    ...(labelChanged ? { label: form.label } : {}),
  };
  return Object.keys(edit).length === 0 ? null : edit;
}
