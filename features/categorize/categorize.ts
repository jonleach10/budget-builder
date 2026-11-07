import type { Transaction } from "@/features/import/types";
import { lookUp, type BankMap } from "./bankMaps";
import { findCategory, type CategoryRule } from "./findCategory";
import {
  isRedactedKey,
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
 * steps. A blank category counts as no match, except from a rule: a first match
 * with no category ends the chain, because JL chose to review those rows. A
 * mixed merchant skips the bank type map, so its rows go to review unless JL's
 * own category or rule decides them. A redacted merchant's past category is
 * only ever a suggestion, ahead of the bank category's, because the removed
 * number may have told two payees apart.
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
  const ruleCategory = findCategory(transaction, context.categoryRules);
  const ruleSaysReview = ruleCategory === null;
  const pastCategory = lookUp(context.pastCategories, key);
  const pastOnlySuggests = isRedactedKey(key);

  const steps: [CategorySource, string | null | undefined][] = [
    ["manual", context.manualCategory],
    ["rule", ruleCategory],
    ["history", ruleSaysReview || pastOnlySuggests ? undefined : pastCategory],
    [
      "bank-type",
      ruleSaysReview || isMixed
        ? undefined
        : lookUp(context.bankTypeMap, transaction.bankType),
    ],
  ];

  for (const [source, category] of steps) {
    if (hasText(category)) return { status: "categorized", category, source };
  }

  const suggestedCategory =
    (pastOnlySuggests ? pastCategory : undefined) ??
    lookUp(context.bankCategoryMap, transaction.bankCategory);
  return hasText(suggestedCategory)
    ? { status: "needs-review", suggestedCategory }
    : { status: "needs-review" };
}
