import type { Transaction } from "@/features/import/types";
import { bankDefaultTypeMap, lookUp } from "./bankMaps";
import type { TransactionType } from "./transactionType";

/**
 * The last step in choosing a row's type. Callers go in this order: `findType`
 * rules, then `pairTransfers`, then this. A row in a pair and an unpaired card
 * payment are `transfer`, and a row with no type by the end goes to review.
 */
export function defaultType(
  transaction: Transaction,
): TransactionType | undefined {
  return lookUp(bankDefaultTypeMap, transaction.bankType);
}
