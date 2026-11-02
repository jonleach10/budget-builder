import type { Transaction } from "@/features/import/types";
import { firstMatchingRule, type RuleCondition } from "./matchRule";
import { hasText } from "./text";

/** Plain data, so a rule can be saved as JSON. */
export type CategoryRule = RuleCondition & {
  category: string | null;
};

/**
 * Gives undefined when no rule matches. Gives null when the first match has no
 * category, which means the row goes to review and nothing lower can decide it.
 */
export function findCategory(
  transaction: Transaction,
  rules: readonly CategoryRule[],
): string | null | undefined {
  const rule = firstMatchingRule(transaction, rules);
  if (rule === undefined) return undefined;
  return hasText(rule.category) ? rule.category : null;
}
