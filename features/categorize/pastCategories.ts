import { REDACTED } from "@/features/import/redact";
import type { Transaction } from "@/features/import/types";
import { hasText, ignoreCase } from "./text";

export type CategorySource = "manual" | "rule" | "history" | "bank-type";

/** A row and the category it holds. Only a `manual` source counts as confirmed. */
export type CategorizedRow = {
  transaction: Transaction;
  category?: string | null;
  source?: CategorySource;
};

/** Plain data: one category per merchant, under the key from `merchantKey`. */
export type PastCategories = Readonly<Record<string, string>>;

/**
 * Each part has its own prefix, so an ID never meets a description with the
 * same text. A row with nothing to identify it has no key, because rows with
 * a blank or redacted description aren't one merchant: the placeholder hides
 * whatever told them apart.
 */
export function merchantKey(transaction: Transaction): string | undefined {
  const { ppdId, orderingPartyId, description } = transaction;
  if (hasText(ppdId)) return `ppdId:${ppdId}`;
  if (hasText(orderingPartyId)) return `orderingPartyId:${orderingPartyId}`;
  if (!hasText(description) || description.includes(REDACTED)) return undefined;
  return `description:${ignoreCase(description)}`;
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
