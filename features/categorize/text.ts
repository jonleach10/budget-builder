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
 * text copied from a bank file matches the row cleaned from that text.
 */
export function forTextMatch(text: string): string {
  return ignoreCase(text).replace(/\s+/g, " ");
}

export function hasText(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}
