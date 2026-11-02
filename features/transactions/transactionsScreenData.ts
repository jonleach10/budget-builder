import { BudgetError } from "@/features/budget/errors";
import { shortDate } from "@/features/budget/months";
import type { AccountRow, CategoryRow } from "@/features/budget/rows";
import { needsReview } from "@/features/categorize/needsReview";
import type { TransactionType } from "@/features/categorize/transactionType";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import { TYPE_OPTIONS } from "@/features/rules/rules";
import { formatMoney } from "@/lib/money";

export type TransactionLine = {
  id: string;
  date: string;
  /** The owner's label if the row has one, otherwise the bank text. */
  title: string;
  /** The bank text, when a label took its place as the title. */
  bankText: string | null;
  purpose: string | null;
  accountId: string;
  account: string;
  type: TransactionType | null;
  typeLabel: string | null;
  categoryId: string | null;
  category: string | null;
  /** The USD amount, which for a foreign row is the base amount from import. */
  amount: string;
  /** The one amount under it: a foreign row's own, or a bank-recorded original. */
  original: string | null;
  needsReview: boolean;
  paired: boolean;
  hidden: boolean;
};

type FilterOption = { id: string; name: string };

export type TransactionsScreenData = {
  /** Every row in the month, hidden ones too. The filters choose what shows. */
  lines: TransactionLine[];
  accounts: FilterOption[];
  categories: FilterOption[];
};

export type TransactionsSource = {
  rows: readonly StoredTransaction[];
  accounts: readonly AccountRow[];
  categories: readonly CategoryRow[];
};

const TYPE_LABELS = new Map(
  TYPE_OPTIONS.map(({ value, label }) => [value, label]),
);

function toOption({ id, name }: FilterOption): FilterOption {
  return { id, name };
}

function byNewest(a: StoredTransaction, b: StoredTransaction): number {
  return b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id);
}

/**
 * Only one amount goes under the first. A foreign row shows what its account
 * holds, as Budget's Combined view does, so a bank-recorded original on that row
 * stays out of the list.
 */
function amountsOf({
  amount,
  base,
  original,
}: StoredTransaction): Pick<TransactionLine, "amount" | "original"> {
  if (amount.currency !== base.currency) {
    return { amount: formatMoney(base), original: formatMoney(amount) };
  }
  return {
    amount: formatMoney(amount),
    original: original ? formatMoney(original.amount) : null,
  };
}

export function buildTransactionsScreen({
  rows,
  accounts,
  categories,
}: TransactionsSource): TransactionsScreenData {
  const accountsById = new Map(accounts.map((row) => [row.id, row]));
  const namesById = new Map(categories.map((row) => [row.id, row.name]));

  function toLine(row: StoredTransaction): TransactionLine {
    const account = accountsById.get(row.accountId);
    if (account === undefined) throw new BudgetError("unknown-account");

    const label = row.note?.trim() || null;
    const category =
      row.categoryId === null ? null : (namesById.get(row.categoryId) ?? null);

    return {
      id: row.id,
      date: shortDate(row.postedOn),
      title: label ?? row.description,
      bankText: label === null ? null : row.description,
      purpose: row.purpose ?? null,
      accountId: row.accountId,
      account: account.name,
      type: row.type,
      typeLabel: row.type === null ? null : (TYPE_LABELS.get(row.type) ?? null),
      categoryId: row.categoryId,
      category,
      ...amountsOf(row),
      needsReview: needsReview({
        hidden: row.hidden,
        type: row.type,
        category,
      }),
      paired: row.transferPairId !== null,
      hidden: row.hidden,
    };
  }

  return {
    lines: [...rows].sort(byNewest).map(toLine),
    accounts: [...accounts]
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map(toOption),
    categories: categories.map(toOption),
  };
}
