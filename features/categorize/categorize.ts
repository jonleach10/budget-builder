import type { Transaction } from "@/features/import/types";
import { lookUp, type BankMap } from "./bankMaps";
import { findCategory, type CategoryRule } from "./findCategory";
import {
  merchantKey,
  type CategorySource,
  type PastCategories,
} from "./pastCategories";
import { hasText } from "./text";
import { countsAgainstBudget, type TransactionType } from "./transactionType";

export type CategoryContext = {
  manualCategory?: string | null;
  categoryRules: readonly CategoryRule[];
  pastCategories: PastCategories;
  mixedMerchants: readonly string[];
  bankTypeMap: BankMap;
  bankCategoryMap: BankMap;
};

export type CategoryResult =
  | { status: "categorized"; category: string; source: CategorySource }
  | { status: "no-category" }
  | { status: "needs-review"; suggestedCategory?: string };

/**
 * The type comes first, so a spending row is the only kind that reaches the
 * steps. A blank category at any step counts as no match. A mixed merchant
 * skips the bank type map, so its rows go to review unless JL's own category
 * or rule decides them.
 */
export function categorize(
  transaction: Transaction,
  type: TransactionType | undefined,
  context: CategoryContext,
): CategoryResult {
  if (type === undefined) return { status: "needs-review" };
  if (!countsAgainstBudget(type)) return { status: "no-category" };

  const key = merchantKey(transaction);
  const isMixed = key !== undefined && context.mixedMerchants.includes(key);

  const steps: [CategorySource, string | null | undefined][] = [
    ["manual", context.manualCategory],
    ["rule", findCategory(transaction, context.categoryRules)],
    ["history", lookUp(context.pastCategories, key)],
    [
      "bank-type",
      isMixed ? undefined : lookUp(context.bankTypeMap, transaction.bankType),
    ],
  ];

  for (const [source, category] of steps) {
    if (hasText(category)) return { status: "categorized", category, source };
  }

  const suggestedCategory = lookUp(
    context.bankCategoryMap,
    transaction.bankCategory,
  );
  return hasText(suggestedCategory)
    ? { status: "needs-review", suggestedCategory }
    : { status: "needs-review" };
}
