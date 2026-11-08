import {
  firstMatchingRule,
  matchesRule,
  type RuleCondition,
  type RuleTarget,
} from "@/features/categorize/matchRule";
import {
  isRedactedKey,
  merchantKey,
  mixedMerchants,
} from "@/features/categorize/pastCategories";
import { forTextMatch, hasText } from "@/features/categorize/text";
import type { TransactionType } from "@/features/categorize/transactionType";
import { positionFor } from "@/features/rules/ruleChanges";
import {
  isIdRule,
  isTransactionType,
  TYPE_OPTIONS,
  type RuleForm,
  type RuleRow,
  type ValidRule,
} from "@/features/rules/rules";
import type { Country } from "@/features/budget/budget";
import { REDACTED } from "@/features/import/redact";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import type { RowEdit } from "@/features/transactions/rowEdits";
import { inPositionOrder } from "@/lib/ordering";
import { buildReviewInbox, type ReviewSource } from "./reviewInbox";

/**
 * A rule the inbox offers after a whole merchant group is accepted. The form
 * is filled in from the stored row, so its value matches that row.
 */
export type RuleOffer = {
  form: RuleForm;
  /** The offer came from a code in the text, so the value should be shortened. */
  codeInText: boolean;
};

/** A digit, `*` or `#`: card text that often changes with each purchase. */
const CODE = /[0-9*#]/;

/** The outcome a group's accept gave, or null for anything a rule can't give. */
function outcomeOf(
  edit: RowEdit,
): { type: TransactionType; categoryId: string } | null {
  if (typeof edit.categoryId === "string" && edit.categoryId !== "") {
    return { type: "spending", categoryId: edit.categoryId };
  }
  if (isTransactionType(edit.type) && edit.type !== "spending") {
    return { type: edit.type, categoryId: "" };
  }
  return null;
}

/** An ID rule when the row has an ID, as `merchantKey` prefers one. */
function conditionOf(
  row: RuleTarget,
): Pick<RuleForm, "matchOn" | "value"> {
  if (hasText(row.ppdId)) return { matchOn: "ppdId", value: row.ppdId };
  if (hasText(row.orderingPartyId)) {
    return { matchOn: "orderingPartyId", value: row.orderingPartyId };
  }
  return { matchOn: "descriptionStartsWith", value: row.description };
}

/**
 * Offers a rule only when it does something past categories can't: give a type,
 * or match text with a code that changes with each purchase. A category on an
 * ID group is already covered by past categories, which key on the ID. A
 * redacted group's category only ever suggests (ADR 0010), and a rule on a
 * mixed merchant would hide the mix, so neither gets an offer.
 *
 * A type on a merchant the owner has confirmed categories for gets no offer
 * either: the rule would send that merchant's future rows away from them.
 *
 * `mixed` is `mixedMerchants` worked out after the accept saved, and
 * `confirmed` the merchants with any category the owner confirmed.
 */
export function ruleOffer(
  source: RuleTarget,
  edit: RowEdit,
  mixed: readonly string[],
  confirmed: readonly string[] = [],
): RuleOffer | null {
  const outcome = outcomeOf(edit);
  const key = merchantKey(source);
  if (outcome === null || key === undefined) return null;
  if (isRedactedKey(key) || mixed.includes(key)) return null;

  const keyedOnText = key.startsWith("description:");
  const codeInText = keyedOnText && CODE.test(source.description);
  const givesType = outcome.categoryId === "";
  if (givesType && confirmed.includes(key)) return null;
  if (!givesType && !codeInText) return null;

  return { form: { ...conditionOf(source), ...outcome }, codeInText };
}

/** Stands in for a rule that isn't stored yet. A stored ID is a UUID. */
export const NEW_RULE_ID = "new-rule";

type RuleWithId = RuleCondition & { id: string };

/** The rules as the import tries them, with the new one last in its group. */
function rulesInOrder(
  rule: ValidRule & { id?: string },
  rules: readonly RuleRow[],
): { id: string; ordered: RuleWithId[] } {
  const stored = rule.id !== undefined && rules.some(({ id }) => id === rule.id);
  const all: RuleRow[] = stored
    ? [...rules]
    : [...rules, { ...rule, id: NEW_RULE_ID, position: positionFor(rules, rule) }];
  return {
    id: stored ? (rule.id as string) : NEW_RULE_ID,
    ordered: inPositionOrder(all).map(({ id, match_on, value }) => ({
      id,
      matchOn: match_on,
      value,
    })),
  };
}

/** Compared as `validateRule` stores a value and a text rule matches it. */
function sameRule(a: ValidRule, b: ValidRule): boolean {
  const sameValue = isIdRule(a)
    ? a.value === b.value
    : forTextMatch(a.value) === forTextMatch(b.value);
  return (
    a.match_on === b.match_on &&
    sameValue &&
    a.type === b.type &&
    a.category_id === b.category_id
  );
}

export type RuleConflict = { kind: "exists" | "earlier"; rule: RuleRow };

/**
 * Why a new rule shouldn't be added: the same rule is stored, or a stored rule
 * would decide its source row first, so the new one would never run there. A
 * rule that doesn't match its source row at all has no conflict to name.
 */
export function ruleConflict(
  rule: ValidRule,
  rules: readonly RuleRow[],
  source: RuleTarget,
): RuleConflict | null {
  const same = rules.find((stored) => sameRule(stored, rule));
  if (same !== undefined) return { kind: "exists", rule: same };

  const condition = { matchOn: rule.match_on, value: rule.value };
  if (!matchesRule(condition, source)) return null;

  const { id, ordered } = rulesInOrder(rule, rules);
  const winner = firstMatchingRule(source, ordered);
  const earlier = rules.find((stored) => stored.id === winner?.id);
  return winner?.id === id || earlier === undefined
    ? null
    : { kind: "earlier", rule: earlier };
}

/** Starts the `merchant` of a row with no key, which the inbox lists under No Merchant. */
const NO_MERCHANT = "row:";

/** Whether the inbox lists the row under No Merchant, not in a merchant group. */
export function isNoMerchant({ merchant }: Pick<SortCandidate, "merchant">): boolean {
  return merchant.startsWith(NO_MERCHANT);
}

/**
 * A row the inbox lists under Merchants or No Merchant, with what a rule reads
 * and what the dialog shows. A label never reaches a rule, so it isn't here.
 */
export type SortCandidate = RuleTarget & {
  id: string;
  transferNumber?: string;
  /** No type, or Spending with no category: the two kinds of row in review. */
  type: TransactionType | null;
  redacted: boolean;
  /** The `merchantKey`, or the row's own ID when it has none. */
  merchant: string;
  country: Country;
  date: string;
  account: string;
  amount: string;
};

/**
 * The rows a rule would sort now, worked out the same way in the dialog and on
 * the server. A row is sorted only when the rule is the one that would win for
 * it with every stored rule in place, so a stored rule that matches first keeps
 * deciding it. Redacted rows stay for the owner (ADR 0010). A row with a
 * transfer number may still pair, so only a Transfer rule takes it. A type rule
 * takes rows with no type; a category rule also takes Spending rows.
 *
 * `rule` with an `id` that's in `rules` is a stored rule. Otherwise it's a new
 * rule, tried last in its group as `addRule` stores it.
 */
export function rowsRuleWouldSort(
  rule: ValidRule & { id?: string },
  rules: readonly RuleRow[],
  candidates: readonly SortCandidate[],
): SortCandidate[] {
  const givesCategory = rule.category_id !== null;
  if (!givesCategory && (rule.type === null || rule.type === "spending")) {
    return [];
  }
  const { id, ordered } = rulesInOrder(rule, rules);

  return candidates.filter(
    (row) =>
      !row.redacted &&
      (!hasText(row.transferNumber) || rule.type === "transfer") &&
      (row.type === null || (givesCategory && row.type === "spending")) &&
      firstMatchingRule(row, ordered)?.id === id,
  );
}

/**
 * The rows a rule may sort: `buildReviewInbox`'s merchant groups and No
 * Merchant list, worked out from stored rows. Rows in a possible transfer are
 * left out, as the inbox leaves them out of groups. A possible duplicate in
 * review stays, as accepting its group includes it.
 */
export function sortCandidates(source: ReviewSource): SortCandidate[] {
  const inbox = buildReviewInbox(source);
  const byId = new Map(source.rows.map((stored) => [stored.id, stored]));
  const countryOf = new Map(source.accounts.map(({ id, country }) => [id, country]));
  const lines = [
    ...inbox.groups.flatMap(({ rows }) => rows),
    ...inbox.noMerchant.map(({ line }) => line),
  ];

  // Newest first across groups, so Show Rows starts with the latest rows.
  const ordered = lines
    .flatMap((line) => {
      const stored = byId.get(line.id);
      return stored === undefined ? [] : [{ line, stored }];
    })
    .sort((a, b) => byNewest(a.stored, b.stored));

  return ordered.flatMap(({ line, stored }): SortCandidate[] => {
    const country = countryOf.get(line.accountId);
    if (country === undefined) return [];
    return [
      {
        id: stored.id,
        description: stored.description,
        ...(stored.ppdId === undefined ? {} : { ppdId: stored.ppdId }),
        ...(stored.orderingPartyId === undefined
          ? {}
          : { orderingPartyId: stored.orderingPartyId }),
        ...(stored.transferNumber === undefined
          ? {}
          : { transferNumber: stored.transferNumber }),
        type: stored.type,
        redacted: stored.description.includes(REDACTED),
        merchant: merchantKey(stored) ?? `${NO_MERCHANT}${stored.id}`,
        country,
        date: line.date,
        account: line.account,
        amount: line.amount,
      },
    ];
  });
}

/** Everything the Add Rule dialog needs, so its count updates as the value does. */
export type InboxRuleOffer = RuleOffer & {
  sourceId: string;
  /** What the rule matches on the source row, to check for an earlier rule. */
  source: RuleTarget;
  /** The source row's bank text, as the group showed it. */
  name: string;
  /** The rows the accept saved. */
  count: number;
  gives: { typeLabel: string; category: string | null };
  rules: RuleRow[];
  candidates: SortCandidate[];
};

function byNewest(a: StoredTransaction, b: StoredTransaction): number {
  return b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id);
}

/**
 * The offer after a whole group saved, worked out from the stored rows as they
 * are now, so "mixed after this accept" counts the categories just confirmed.
 * The source row is the group's newest, whose text the group showed.
 */
export function inboxRuleOffer(
  source: ReviewSource,
  rules: readonly RuleRow[],
  acceptedIds: readonly string[],
  edit: RowEdit,
): InboxRuleOffer | null {
  const ids = new Set(acceptedIds);
  const [newest] = source.rows.filter(({ id }) => ids.has(id)).sort(byNewest);
  if (newest === undefined) return null;

  const names = new Map(source.categories.map(({ id, name }) => [id, name]));
  const mixed = mixedMerchants(
    source.rows.map((stored) => ({
      transaction: stored,
      category: names.get(stored.categoryId ?? ""),
      source: stored.categorySource ?? undefined,
    })),
  );
  const confirmed = source.rows.flatMap((stored) => {
    const key = merchantKey(stored);
    return stored.categorySource === "manual" &&
      stored.categoryId !== null &&
      key !== undefined
      ? [key]
      : [];
  });
  const offer = ruleOffer(newest, edit, mixed, confirmed);
  if (offer === null) return null;

  const { ppdId, orderingPartyId, description } = newest;
  const type = offer.form.type;
  return {
    ...offer,
    sourceId: newest.id,
    source: {
      description,
      ...(ppdId === undefined ? {} : { ppdId }),
      ...(orderingPartyId === undefined ? {} : { orderingPartyId }),
    },
    name: description,
    count: ids.size,
    gives: {
      typeLabel: TYPE_OPTIONS.find(({ value }) => value === type)?.label ?? type,
      category: names.get(offer.form.categoryId) ?? null,
    },
    rules: [...rules],
    candidates: sortCandidates(source),
  };
}
