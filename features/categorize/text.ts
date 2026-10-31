/** Upper case, because that folds "ß" to "SS" and lower case leaves it alone. */
export function ignoreCase(text: string): string {
  return text.toUpperCase();
}

export function hasText(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}
