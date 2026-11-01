import type { TransactionType } from "@/features/categorize/transactionType";
import type { Money } from "@/lib/money";
import { createBudget, type Budget, type Country } from "./budget";
import type { BudgetEntry } from "./compareBudget";
import { BudgetError } from "./errors";

/** A row of the transactions table, with only the columns the screens read. */
export type TransactionRow = {
  id: string;
  account_id: string;
  posted_on: string;
  amount_minor: number;
  currency: string;
  description: string;
  base_amount_minor: number;
  base_currency: string;
  type: string | null;
  category_id: string | null;
  hidden: boolean;
};

export type AccountRow = { id: string; name: string; country: Country };

export type CategoryRow = { id: string; name: string; position: number };

export type BudgetAmountRow = {
  month: string;
  country: Country;
  category_id: string;
  amount_minor: number;
};

/** A transaction as the screens use it. Negative means money out. */
export type LedgerRow = {
  id: string;
  postedOn: string;
  country: Country;
  account: string;
  description: string;
  amount: Money;
  /** The USD amount locked at import, which Combined uses. */
  base: Money;
  type: TransactionType | null;
  category: string | null;
};

/** Leaves hidden rows out here, so they can't reach any figure. */
export function toLedger(
  rows: readonly TransactionRow[],
  accounts: readonly AccountRow[],
  categories: readonly CategoryRow[],
): LedgerRow[] {
  const accountsById = new Map(accounts.map((row) => [row.id, row]));
  const namesById = new Map(categories.map((row) => [row.id, row.name]));

  return rows
    .filter((row) => !row.hidden)
    .map((row) => {
      const account = accountsById.get(row.account_id);
      if (account === undefined) throw new BudgetError("unknown-account");

      return {
        id: row.id,
        postedOn: row.posted_on,
        country: account.country,
        account: account.name,
        description: row.description,
        amount: { minor: row.amount_minor, currency: row.currency },
        base: { minor: row.base_amount_minor, currency: row.base_currency },
        type: row.type as TransactionType | null,
        category:
          row.category_id === null
            ? null
            : (namesById.get(row.category_id) ?? null),
      };
    });
}

/** A row with no type has no category, so compareBudget counts it for review. */
export function toBudgetEntries(
  ledger: readonly LedgerRow[],
  country: Country,
): BudgetEntry[] {
  return ledger
    .filter(
      (row) =>
        row.country === country &&
        (row.type === "spending" || row.type === null),
    )
    .map((row) => ({
      postedOn: row.postedOn,
      category: row.type === null ? null : row.category,
      amount: row.amount,
    }));
}

export function toBudget(
  rows: readonly BudgetAmountRow[],
  month: string,
  country: Country,
  categories: readonly CategoryRow[],
): Budget {
  const namesById = new Map(categories.map((row) => [row.id, row.name]));
  const amounts = rows.flatMap((row) => {
    const name = namesById.get(row.category_id);
    return row.month === month && row.country === country && name !== undefined
      ? [[name, row.amount_minor] as const]
      : [];
  });

  return createBudget(month, country, Object.fromEntries(amounts));
}
