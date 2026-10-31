import type { Transaction } from "@/features/import/types";
import { firstMatchingRule, type RuleCondition } from "./matchRule";
import { hasText } from "./text";

/** Plain data, so a rule can be saved as JSON. */
export type CategoryRule = RuleCondition & {
  category: string;
};

/** A rule with a blank category counts as no match, so a later rule can win. */
export function findCategory(
  transaction: Transaction,
  rules: readonly CategoryRule[],
): string | undefined {
  const usable = rules.filter((rule) => hasText(rule.category));
  return firstMatchingRule(transaction, usable)?.category;
}
