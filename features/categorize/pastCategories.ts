import { REDACTED } from "@/features/import/redact";
import type { Transaction } from "@/features/import/types";
import { hasText, ignoreCase, withoutRedacted } from "./text";

export type CategorySource = "manual" | "rule" | "history" | "bank-type";

/** A row and the category it holds. Only a `manual` source counts as confirmed. */
export type CategorizedRow = {
  transaction: Transaction;
  category?: string | null;
  source?: CategorySource;
};

/** Plain data: one category per merchant, under the key from `merchantKey`. */
export type PastCategories = Readonly<Record<string, string>>;

const REDACTED_PREFIX = "redacted:";

/**
 * Each part has its own prefix, so an ID never meets a description with the
 * same text. A redacted description is keyed on the text left around the
 * placeholder, under its own prefix, because the placeholder may hide two
 * payees: its past category only suggests (see `isRedactedKey`). A row with no
 * letter or digit left, or a blank description, has no key.
 */
export function merchantKey(
  transaction: Pick<Transaction, "ppdId" | "orderingPartyId" | "description">,
): string | undefined {
  const { ppdId, orderingPartyId, description } = transaction;
  if (hasText(ppdId)) return `ppdId:${ppdId}`;
  if (hasText(orderingPartyId)) return `orderingPartyId:${orderingPartyId}`;
  if (!hasText(description)) return undefined;
  if (!description.includes(REDACTED)) {
    return `description:${ignoreCase(description)}`;
  }
  const rest = withoutRedacted(description);
  return NAMES_SOMETHING.test(rest)
    ? `${REDACTED_PREFIX}${ignoreCase(rest)}`
    : undefined;
}

/**
 * A letter or digit. Text that redaction left as only punctuation, such as the
 * "/" between two numbers, names no merchant, so it would group any payees.
 */
const NAMES_SOMETHING = /[\p{L}\p{N}]/u;

/** A key from redacted text, whose past category may suggest but never decide. */
export function isRedactedKey(key: string | undefined): boolean {
  return key?.startsWith(REDACTED_PREFIX) ?? false;
}

function confirmedCategories(
  rows: readonly CategorizedRow[],
): Map<string, Set<string>> {
  const confirmed = new Map<string, Set<string>>();
  for (const { transaction, category, source } of rows) {
    const key = merchantKey(transaction);
    if (source !== "manual" || !hasText(category) || key === undefined) continue;
    confirmed.set(key, (confirmed.get(key) ?? new Set()).add(category));
  }
  return confirmed;
}

/** A merchant with more than one confirmed category gets no entry. */
export function pastCategories(rows: readonly CategorizedRow[]): PastCategories {
  const entries = [...confirmedCategories(rows)]
    .filter(([, categories]) => categories.size === 1)
    .map(([key, [category]]): [string, string] => [key, category]);
  return Object.fromEntries(entries);
}

/**
 * The merchants with more than one confirmed category, by `merchantKey`. A
 * missing lookup entry can't tell one of these from a merchant never seen.
 */
export function mixedMerchants(rows: readonly CategorizedRow[]): string[] {
  return [...confirmedCategories(rows)]
    .filter(([, categories]) => categories.size > 1)
    .map(([key]) => key);
}
