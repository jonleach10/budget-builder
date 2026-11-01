import type { TransactionType } from "./transactionType";

/** Bank text on the left, category on the right. Plain data, keyed exactly. */
export type BankMap = Readonly<Record<string, string>>;

export const bankTypeMap: BankMap = {
  FEE_TRANSACTION: "Fees",
  Fee: "Fees",
};

/** Bank categories only feed suggestions, because they're sometimes wrong. */
export const bankCategoryMap: BankMap = {};

/** Bank text on the left, type on the right. Plain data, keyed exactly. */
export const bankDefaultTypeMap: Readonly<Record<string, TransactionType>> = {
  DEBIT_CARD: "spending",
  FEE_TRANSACTION: "spending",
  Fee: "spending",
  Return: "spending",
  Sale: "spending",
};

/** Own keys only, so bank text like "constructor" stays an unknown value. */
export function lookUp<Value extends string>(
  map: Readonly<Record<string, Value>>,
  key: string | undefined,
): Value | undefined {
  return key !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
}
