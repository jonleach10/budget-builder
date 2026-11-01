import type { Transaction } from "@/features/import/types";
import { firstMatchingRule, type RuleCondition } from "./matchRule";
import type { TransactionType } from "./transactionType";

/** Plain data, so a rule can be saved as JSON. */
export type MatchingRule = RuleCondition & {
  type: TransactionType;
};

export function findType(
  transaction: Transaction,
  rules: readonly MatchingRule[],
): TransactionType | undefined {
  return firstMatchingRule(transaction, rules)?.type;
}
