/** A row of the categories table. */
export type CategoryRow = { id: string; name: string; position: number };

/** Everything stored that a category's deletion would change or remove. */
export type CategoryUsage = {
  transactions: number;
  rules: number;
  budgetAmounts: number;
};

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; message: string };

export const DUPLICATE_NAME =
  "A category with this name already exists. Enter a different name.";

/**
 * The schema only refuses an exact repeat, but two names that differ by case
 * would look like one category. ownId is the category being renamed, which can
 * keep its name or change only its case.
 */
export function validateCategoryName(
  name: string,
  categories: readonly CategoryRow[],
  ownId?: string,
): NameCheck {
  const clean = name.trim();
  if (clean === "") return { ok: false, message: "Enter a category name." };

  const taken = categories.some(
    (category) =>
      category.id !== ownId &&
      category.name.toUpperCase() === clean.toUpperCase(),
  );
  return taken ? { ok: false, message: DUPLICATE_NAME } : { ok: true, name: clean };
}

function counted(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
}

/** Gives the reason a category can't be deleted, or null if it can be. */
export function deleteRefusal(
  name: string,
  { transactions, rules, budgetAmounts }: CategoryUsage,
): string | null {
  if (transactions + rules + budgetAmounts === 0) return null;

  return (
    `${name} can't be deleted because it has ` +
    `${counted(transactions, "transaction")}, ${counted(rules, "rule")} and ` +
    `${counted(budgetAmounts, "budget amount")}. ` +
    "Change those first, then try again."
  );
}
