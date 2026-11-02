/**
 * Upper case, because that folds "ß" to "SS" and lower case leaves it alone.
 * Upper case leaves the capital "ẞ" alone, so that one is folded by hand.
 */
export function ignoreCase(text: string): string {
  return text.toUpperCase().replaceAll("ẞ", "SS");
}

/**
 * For comparing a text rule with a row. Only rules read this: merchant keys use
 * `ignoreCase`, so two descriptions that differ by spaces stay two merchants.
 */
export function forTextMatch(text: string): string {
  return ignoreCase(text).replace(/ +/g, " ");
}

export function hasText(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}
