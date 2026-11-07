import type { Transaction } from "@/features/import/types";
import { forTextMatch, hasText, withoutRedacted } from "./text";

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

/**
 * Text as a text rule compares it, without redaction placeholders. Both the row
 * and the rule's value go through it: a short value such as "RED" can't match
 * every redacted row, and a value copied from the screen, placeholder and all,
 * still matches the row it came from.
 */
function forRuleMatch(text: string): string {
  return forTextMatch(withoutRedacted(text));
}

function matches(rule: RuleCondition, transaction: Transaction): boolean {
  switch (rule.matchOn) {
    case "ppdId":
      return hasText(rule.value) && transaction.ppdId === rule.value;
    case "orderingPartyId":
      return hasText(rule.value) && transaction.orderingPartyId === rule.value;
    case "descriptionStartsWith":
    case "descriptionContains": {
      // A blank value, or one that was only placeholders, would be inside
      // every description and match everything.
      const value = forRuleMatch(rule.value);
      if (!hasText(value)) return false;
      const description = forRuleMatch(transaction.description);
      return rule.matchOn === "descriptionStartsWith"
        ? description.startsWith(value)
        : description.includes(value);
    }
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
