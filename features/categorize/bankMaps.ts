/** Bank text on the left, category on the right. Plain data, keyed exactly. */
export type BankMap = Readonly<Record<string, string>>;

export const bankTypeMap: BankMap = {
  FEE_TRANSACTION: "Fees",
  Fee: "Fees",
};

/** Bank categories only feed suggestions, because they're sometimes wrong. */
export const bankCategoryMap: BankMap = {};
