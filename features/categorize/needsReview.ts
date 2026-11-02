import type { TransactionType } from "./transactionType";

/** A category's name, or nothing if the row has none or its ID is unknown. */
type CategoryName = string | null | undefined;

export type ReviewFacts = {
  hidden: boolean;
  type: TransactionType | null;
  category: CategoryName;
};

export function hasNoCategory(category: CategoryName): boolean {
  return !category?.trim();
}

/**
 * The one definition of a row that needs review: it isn't hidden, and it has no
 * type or is spending with no category. Budget's count and Transactions both
 * use it, so they can't disagree.
 */
export function needsReview({ hidden, type, category }: ReviewFacts): boolean {
  if (hidden) return false;
  return type === null || (type === "spending" && hasNoCategory(category));
}
