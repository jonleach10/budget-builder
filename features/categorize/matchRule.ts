import type { Transaction } from "@/features/import/types";
import { hasText, ignoreCase } from "./text";

export type MatchOn =
  | "ppdId"
  | "orderingPartyId"
  | "descriptionStartsWith"
  | "descriptionContains";

/** What a rule looks for, whatever it gives when it matches. */
export type RuleCondition = {
  matchOn: MatchOn;
  value: string;
};

function matches(rule: RuleCondition, transaction: Transaction): boolean {
  // A blank value would be inside every description and match everything.
  if (!hasText(rule.value)) return false;

  switch (rule.matchOn) {
    case "ppdId":
      return transaction.ppdId === rule.value;
    case "orderingPartyId":
      return transaction.orderingPartyId === rule.value;
    case "descriptionStartsWith":
      return ignoreCase(transaction.description).startsWith(
        ignoreCase(rule.value),
      );
    case "descriptionContains":
      return ignoreCase(transaction.description).includes(
        ignoreCase(rule.value),
      );
  }
}

function isIdRule(rule: RuleCondition): boolean {
  return rule.matchOn === "ppdId" || rule.matchOn === "orderingPartyId";
}

/** Tries every ID rule before any text rule. List order decides within each. */
export function firstMatchingRule<Rule extends RuleCondition>(
  transaction: Transaction,
  rules: readonly Rule[],
): Rule | undefined {
  const idRules = rules.filter(isIdRule);
  const textRules = rules.filter((rule) => !isIdRule(rule));
  return [...idRules, ...textRules].find((rule) =>
    matches(rule, transaction),
  );
}
