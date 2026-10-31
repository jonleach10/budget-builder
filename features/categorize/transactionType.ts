export type TransactionType =
  | "spending"
  | "income"
  | "transfer"
  | "saved"
  | "personal";

export function countsAgainstBudget(type: TransactionType): boolean {
  return type === "spending";
}
