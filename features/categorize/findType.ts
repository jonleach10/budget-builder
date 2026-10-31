import type { Transaction } from "@/features/import/types";
import type { TransactionType } from "./transactionType";

export type MatchOn =
  | "ppdId"
  | "orderingPartyId"
  | "descriptionStartsWith"
  | "descriptionContains";

/** Plain data, so a rule can be saved as JSON. */
export type MatchingRule = {
  matchOn: MatchOn;
  value: string;
  type: TransactionType;
};

/** Upper case, because that folds "ß" to "SS" and lower case leaves it alone. */
function ignoreCase(text: string): string {
  return text.toUpperCase();
}

function matches(rule: MatchingRule, transaction: Transaction): boolean {
  // A blank value would be inside every description and match everything.
  if (rule.value.trim() === "") return false;

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

function isIdRule(rule: MatchingRule): boolean {
  return rule.matchOn === "ppdId" || rule.matchOn === "orderingPartyId";
}

/** Tries every ID rule before any text rule. List order decides within each. */
export function findType(
  transaction: Transaction,
  rules: readonly MatchingRule[],
): TransactionType | undefined {
  const idRules = rules.filter(isIdRule);
  const textRules = rules.filter((rule) => !isIdRule(rule));
  const match = [...idRules, ...textRules].find((rule) =>
    matches(rule, transaction),
  );
  return match?.type;
}
