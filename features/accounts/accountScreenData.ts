import type { Country } from "@/features/budget/budget";
import { BudgetError } from "@/features/budget/errors";
import {
  toLedger,
  type CategoryRow,
  type LedgerRow,
  type TransactionRow,
} from "@/features/budget/rows";
import { currencyNote } from "@/features/budget/screenText";
import { needsReview } from "@/features/categorize/needsReview";
import { countsAgainstBudget } from "@/features/categorize/transactionType";
import { formatMoney, sumMinor } from "@/lib/money";
import { inRange, periodRange, rangeText, type AccountPeriod } from "./period";

/** An account as the Account page reads it. */
export type AccountRecord = {
  id: string;
  name: string;
  last_four: string;
  country: Country;
  currency: string;
};

export type AccountSource = {
  accounts: readonly AccountRecord[];
  /** The account asked for, if any. */
  accountId: string | null;
  /** The chosen account's rows, hidden ones too. */
  rows: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  period: AccountPeriod;
  /** Today, as YYYY-MM-DD, passed in so nothing here reads the clock. */
  today: string;
};

export type AccountPicker = {
  selected: string;
  options: { id: string; label: string }[];
};

export type CategoryLine = { name: string; amount: string; share: string };

export type ReadyAccount = {
  status: "ready";
  picker: AccountPicker;
  subtitle: string;
  categories: CategoryLine[];
  total: { amount: string; share: string };
};

type EmptyAccount = {
  status: "empty";
  picker: AccountPicker;
  subtitle: string;
  title: string;
  text: string;
};

type NoAccounts = {
  status: "no-accounts";
  picker: null;
  subtitle: string;
  title: string;
  text: string;
};

export type AccountScreenData = ReadyAccount | EmptyAccount | NoAccounts;

function byName(a: AccountRecord, b: AccountRecord): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * The account asked for, else the first by name. The loader reads only this
 * account's rows, so it uses this too.
 */
export function chooseAccount(
  accounts: readonly AccountRecord[],
  accountId: string | null,
): AccountRecord | null {
  const sorted = [...accounts].sort(byName);
  return sorted.find(({ id }) => id === accountId) ?? sorted[0] ?? null;
}

function pickerFor(
  accounts: readonly AccountRecord[],
  selected: AccountRecord,
): AccountPicker {
  return {
    selected: selected.id,
    options: [...accounts].sort(byName).map(({ id, name, last_four }) => ({
      id,
      label: `${name} · Ending ${last_four}`,
    })),
  };
}

/** A share for display only, worked out from minor units and never fed back. */
function percent(part: number, whole: number): string {
  return `${whole <= 0 ? 0 : Math.round((part / whole) * 100)}%`;
}

/**
 * The budget's rules: only Spending counts, and a row that needs review stays out
 * until it's decided. The ledger has no hidden rows, because toLedger left them out.
 */
function countsAsSpending(row: LedgerRow): row is LedgerRow & { category: string } {
  if (row.type === null || !countsAgainstBudget(row.type)) return false;
  return !needsReview({ ...row, hidden: false });
}

/** In the account's own currency, so a row in any other is a mistake, not a figure. */
function spendingByCategory(
  ledger: readonly LedgerRow[],
  currency: string,
): Map<string, number> {
  const outflows = new Map<string, number[]>();
  for (const row of ledger) {
    if (!countsAsSpending(row)) continue;
    if (row.amount.currency !== currency) {
      throw new BudgetError("entry-currency-mismatch");
    }
    const values = outflows.get(row.category) ?? [];
    values.push(-row.amount.minor);
    outflows.set(row.category, values);
  }
  return new Map(
    [...outflows].map(([category, values]) => [category, sumMinor(values)]),
  );
}

export function buildAccountScreen({
  accounts,
  accountId,
  rows,
  categories,
  period,
  today,
}: AccountSource): AccountScreenData {
  const account = chooseAccount(accounts, accountId);
  if (account === null) {
    return {
      status: "no-accounts",
      picker: null,
      subtitle: "",
      title: "No accounts yet",
      text: "Each bank account shows here once it's added.",
    };
  }

  const { currency } = account;
  const picker = pickerFor(accounts, account);
  // Hidden rows still count as rows here: the account has had an import.
  const accountRows = rows.filter((row) => row.account_id === account.id);
  if (accountRows.length === 0) {
    return {
      status: "empty",
      picker,
      subtitle: currencyNote(currency),
      title: `No rows in ${account.name}`,
      text: "Import a statement for this account to see its spending.",
    };
  }

  const range = periodRange(period, today);
  const ledger = toLedger(accountRows, accounts, categories).filter((row) =>
    inRange(row.postedOn, range),
  );

  const positions = new Map(categories.map((row) => [row.name, row.position]));
  const position = (name: string) => positions.get(name) ?? Infinity;
  const totals = [...spendingByCategory(ledger, currency)].sort(
    ([nameA, a], [nameB, b]) =>
      b - a || position(nameA) - position(nameB) || nameA.localeCompare(nameB),
  );
  const total = sumMinor(totals.map(([, amount]) => amount));
  const money = (minor: number) => formatMoney({ minor, currency });

  return {
    status: "ready",
    picker,
    subtitle: `Amounts are in ${currency}, ${rangeText(range)}.`,
    categories: totals.map(([name, amount]) => ({
      name,
      amount: money(amount),
      share: percent(amount, total),
    })),
    // With no Spending there's nothing for the total to be all of.
    total: { amount: money(total), share: total === 0 ? "0%" : "100%" },
  };
}
