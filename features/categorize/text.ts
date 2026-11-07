import { REDACTED } from "@/features/import/redact";

/**
 * Upper case, because that folds "ß" to "SS" and lower case leaves it alone.
 * Upper case leaves the capital "ẞ" alone, so that one is folded by hand.
 */
export function ignoreCase(text: string): string {
  return text.toUpperCase().replaceAll("ẞ", "SS");
}

/**
 * For comparing typed text with a row, in a text rule or a Transactions search.
 * Merchant keys don't read this: they use `ignoreCase`, so two descriptions that
 * differ by spaces stay two merchants. Collapses what `redactText` collapses, so
 * spacing in text copied from a bank file doesn't stop it matching. Pasted text
 * can still miss its row for other reasons, such as a redacted IBAN.
 */
export function forTextMatch(text: string): string {
  return ignoreCase(text).replace(/\s+/g, " ");
}

/**
 * The text with every redaction placeholder taken out, for keying and matching
 * only. Stored text keeps its placeholders.
 */
export function withoutRedacted(text: string): string {
  return text.replaceAll(REDACTED, " ").replace(/\s+/g, " ").trim();
}

export function hasText(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}
