import type { Country } from "@/features/budget/budget";
import { BudgetError } from "@/features/budget/errors";
import { monthName, shortMonthName } from "@/features/budget/months";
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
import { accountHref } from "./accountParams";
import { layoutDonut, type DonutLayout, type SliceColor } from "./donutLayout";
import {
  comparisonRange,
  comparisonText,
  inRange,
  monthsBetween,
  periodText,
  shortcutPeriod,
  SHORTCUT_LABELS,
  SHORTCUTS,
  type MonthRange,
  type PeriodChoice,
  type Shortcut,
} from "./period";

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
  /** The account asked for, if any: from the address, else the last one viewed. */
  accountId: string | null;
  /** The chosen account's rows, hidden ones too. */
  rows: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  period: PeriodChoice;
  /** Today, as YYYY-MM-DD, passed in so nothing here reads the clock. */
  today: string;
};

export type AccountPicker = {
  selected: string;
  options: { id: string; label: string; href: string }[];
};

export type ShortcutLink = { label: string; href: string; lit: boolean };

export type MonthOption = {
  month: string;
  label: string;
  /** Such as "Sep 2026", for a phone. */
  shortLabel: string;
  href: string;
};

export type MonthSelect = { selected: string; options: MonthOption[] };

export type PeriodControl = {
  shortcuts: ShortcutLink[];
  from: MonthSelect;
  to: MonthSelect;
};

/** A category grouped into Other, listed under it. */
export type MemberLine = {
  name: string;
  amount: string;
  /** Of the donut, like every share. */
  share: string;
  /** Against the period before, or null for All Months, which has none. */
  change: string | null;
};

export type CategoryLine = MemberLine & {
  /** Unique in the list, even if a category is called Other. */
  key: string;
  /**
   * Spending of $0 or below in the period, as when Spending stopped or a purchase
   * was refunded: listed muted, after the slices, and never a slice.
   */
  dropped: boolean;
  /** Its slice's colour, or null for a muted row, which has no slice. */
  swatch: SliceColor | null;
  /** Other's categories; empty on every other row. */
  members: MemberLine[];
};

export type TotalLine = { amount: string; share: string; change: string | null };

/** The donut, and its accessible name, which carries the middle figure. */
export type SpendingChart = { layout: DonutLayout; label: string };

/** In the donut's place when no category has Spending above zero. */
export type NoSpendingLine = { title: string; text: string };

export type ReadyAccount = {
  status: "ready";
  picker: AccountPicker;
  subtitle: string;
  period: PeriodControl;
  /** The card's hint: what Change is against, or why there's none. */
  hint: string;
  showChange: boolean;
  /** Null when there's no Spending, and noSpending says so instead. */
  chart: SpendingChart | null;
  noSpending: NoSpendingLine | null;
  /** The slices' rows, Other last among them, then the muted rows. */
  categories: CategoryLine[];
  /** Every listed row, muted ones too, so it can differ from the middle figure. */
  total: TotalLine;
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

/** Each account links to its page for the same period. */
function pickerFor(
  accounts: readonly AccountRecord[],
  selected: AccountRecord,
  period: PeriodChoice,
): AccountPicker {
  return {
    selected: selected.id,
    options: [...accounts].sort(byName).map(({ id, name, last_four }) => ({
      id,
      label: `${name} · Ending ${last_four}`,
      href: accountHref(id, period),
    })),
  };
}

/** The most slices the donut has: with more categories, the 7th is Other. */
const SLICES = 7;
const SLOTS: readonly SliceColor[] = [1, 2, 3, 4, 5, 6, 7];

/** A share for display only, worked out from minor units and never fed back. */
function percent(part: number, whole: number): string {
  return `${whole <= 0 ? 0 : Math.round((part / whole) * 100)}%`;
}

/**
 * A change for display only: "+18%", "-12%" with an ASCII hyphen, or "New" when
 * there was no Spending before. Never coloured: more spending isn't over budget.
 * Never below -100%: Spending that falls to zero or to a net refund has stopped.
 */
function change(now: number, before: number): string {
  if (before <= 0) return now === 0 ? "0%" : "New";
  if (now <= 0) return "-100%";
  const value = Math.round(((now - before) / before) * 100);
  if (value === 0) return "0%";
  return value > 0 ? `+${value}%` : `${value}%`;
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
  range: MonthRange,
  currency: string,
): Map<string, number> {
  const outflows = new Map<string, number[]>();
  for (const row of ledger) {
    if (!inRange(row.postedOn, range) || !countsAsSpending(row)) continue;
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

/** The first and last months the account has rows in, hidden rows too. */
function rowSpan(rows: readonly TransactionRow[]): MonthRange {
  const months = rows.map((row) => row.posted_on.slice(0, 7)).sort();
  return { from: months[0], to: months[months.length - 1] };
}

function sameRange(a: MonthRange, b: PeriodChoice): boolean {
  return b.kind === "range" && a.from === b.from && a.to === b.to;
}

/**
 * The shortcut whose months the range matches, if any. A dated shortcut wins over
 * All Months when both match, since only one can be lit.
 */
function litShortcut(
  range: MonthRange,
  span: MonthRange,
  period: PeriodChoice,
  today: string,
): Shortcut | null {
  if (period.kind === "all") return "all-months";
  const dated = SHORTCUTS.find(
    (shortcut) =>
      shortcut !== "all-months" &&
      sameRange(range, shortcutPeriod(shortcut, today)),
  );
  if (dated) return dated;
  return range.from === span.from && range.to === span.to ? "all-months" : null;
}

/**
 * From and To offer every month from the account's first with rows to this month,
 * plus the months asked for if they're outside that. Choosing a From after To moves
 * To up to it, and a To before From moves From back, so a range is never reversed.
 */
function periodControl(
  accountId: string,
  range: MonthRange,
  span: MonthRange,
  lit: Shortcut | null,
  today: string,
): PeriodControl {
  const thisMonth = today.slice(0, 7);
  const months = [
    ...new Set([
      ...monthsBetween({
        from: span.from,
        to: span.to > thisMonth ? span.to : thisMonth,
      }),
      range.from,
      range.to,
    ]),
  ].sort();
  const option = (month: string, to: MonthRange): MonthOption => ({
    month,
    label: monthName(month),
    shortLabel: `${shortMonthName(month)} ${month.slice(0, 4)}`,
    href: accountHref(accountId, { kind: "range", ...to }),
  });

  return {
    shortcuts: SHORTCUTS.map((shortcut) => ({
      label: SHORTCUT_LABELS[shortcut],
      href: accountHref(accountId, shortcutPeriod(shortcut, today)),
      lit: shortcut === lit,
    })),
    from: {
      selected: range.from,
      options: months.map((month) =>
        option(month, { from: month, to: month > range.to ? month : range.to }),
      ),
    },
    to: {
      selected: range.to,
      options: months.map((month) =>
        option(month, { from: month < range.from ? month : range.from, to: month }),
      ),
    },
  };
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
  const picker = pickerFor(accounts, account, period);
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

  const span = rowSpan(accountRows);
  const range: MonthRange = period.kind === "all" ? span : period;
  const lit = litShortcut(range, span, period, today);
  const showChange = lit !== "all-months";

  const ledger = toLedger(accountRows, accounts, categories);
  const now = spendingByCategory(ledger, range, currency);
  const before = showChange
    ? spendingByCategory(ledger, comparisonRange(range), currency)
    : new Map<string, number>();

  const positions = new Map(categories.map((row) => [row.name, row.position]));
  const position = (name: string) => positions.get(name) ?? Infinity;
  const largestFirst = (
    [nameA, a]: [string, number],
    [nameB, b]: [string, number],
  ) => b - a || position(nameA) - position(nameB) || nameA.localeCompare(nameB);

  // Only Spending above zero makes a slice. A category at $0 or below, because its
  // Spending stopped or refunds outweighed it, is listed muted after the slices.
  const sliced = [...now].filter(([, amount]) => amount > 0).sort(largestFirst);
  const muted = [...new Set([...now.keys(), ...before.keys()])]
    .filter((name) => {
      const amount = now.get(name);
      return amount === undefined ? (before.get(name) ?? 0) > 0 : amount <= 0;
    })
    .map((name): [string, number] => [name, before.get(name) ?? 0])
    .sort(largestFirst);

  // The top 6 get a slice each and the rest are Other, unless 7 fit without it.
  const own = sliced.length > SLICES ? sliced.slice(0, SLICES - 1) : sliced;
  const grouped = sliced.slice(own.length);

  // A share is of the donut, the sum of the slices, worked out in minor units.
  const sliceSum = sumMinor(sliced.map(([, amount]) => amount));
  // Every listed row, muted ones too, so the Amount column adds up to it.
  const total = sumMinor([...now.values()]);
  const totalBefore = sumMinor([...before.values()]);
  const money = (minor: number) => formatMoney({ minor, currency });
  const changeOf = (amount: number, name: string) =>
    showChange ? change(amount, before.get(name) ?? 0) : null;
  const member = ([name, amount]: [string, number]): MemberLine => ({
    name,
    amount: money(amount),
    share: percent(amount, sliceSum),
    change: changeOf(amount, name),
  });

  const slices = own.map(([name, amount], index) => ({
    key: `category:${name}`,
    minor: amount,
    line: member([name, amount]),
    color: SLOTS[index],
    members: [] as MemberLine[],
  }));
  if (grouped.length > 0) {
    const amount = sumMinor(grouped.map(([, minor]) => minor));
    const amountBefore = sumMinor(grouped.map(([name]) => before.get(name) ?? 0));
    slices.push({
      key: "other",
      minor: amount,
      line: {
        name: "Other",
        amount: money(amount),
        share: percent(amount, sliceSum),
        change: showChange ? change(amount, amountBefore) : null,
      },
      color: "other",
      members: grouped.map(member),
    });
  }
  const middle = money(sliceSum);

  return {
    status: "ready",
    picker,
    subtitle: `Amounts are in ${currency}, ${periodText(range, today)}.`,
    period: periodControl(account.id, range, span, lit, today),
    hint: showChange
      ? comparisonText(range)
      : "All Months has no earlier period to compare with, so there's no Change column.",
    showChange,
    chart:
      slices.length === 0
        ? null
        : {
            layout: layoutDonut({
              slices: slices.map(({ key, minor, line, color }) => ({
                key,
                minor,
                share: line.share,
                color,
              })),
              total: middle,
            }),
            label: `Spending by category, ${middle} in all. The list shows every figure.`,
          },
    noSpending:
      slices.length === 0
        ? {
            title: `No Spending ${periodText(range, today)}.`,
            text: "Only Spending rows count here, so transfers and income aren't shown.",
          }
        : null,
    categories: [
      ...slices.map(({ key, line, color, members }) => ({
        ...line,
        key,
        dropped: false,
        swatch: color,
        members,
      })),
      ...muted.map(([name]) => {
        const amount = now.get(name) ?? 0;
        return {
          key: `category:${name}`,
          name,
          amount: money(amount),
          share: "0%",
          change: changeOf(amount, name),
          dropped: true,
          swatch: null,
          members: [],
        };
      }),
    ],
    total: {
      amount: money(total),
      // With no Spending, or a net refund, there's nothing for it to be all of.
      share: total <= 0 ? "0%" : "100%",
      change: showChange ? change(total, totalBefore) : null,
    },
  };
}
