import type { Country } from "@/features/budget/budget";
import { BudgetError } from "@/features/budget/errors";
import { monthName, shortMonthName } from "@/features/budget/months";
import {
  toLedger,
  type CategoryRow,
  type LedgerRow,
  type TransactionRow,
} from "@/features/budget/rows";
import {
  currencyNote,
  reviewHref,
  reviewText,
} from "@/features/budget/screenText";
import { needsReview } from "@/features/categorize/needsReview";
import { merchantKey } from "@/features/categorize/pastCategories";
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

/** A row with the stored fields its merchant key is worked out from. */
export type AccountTransactionRow = TransactionRow & {
  ppd_id: string | null;
  ordering_party_id: string | null;
};

export type AccountSource = {
  accounts: readonly AccountRecord[];
  /** The account asked for, if any: from the address, else the last one viewed. */
  accountId: string | null;
  /** The chosen account's rows, hidden ones too. */
  rows: readonly AccountTransactionRow[];
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
  /** Null when there's no Spending, and noSpending or allNeedReview says why. */
  chart: SpendingChart | null;
  noSpending: NoSpendingLine | null;
  /**
   * In place of the donut and the list when the period has rows and every one
   * needs review, so there's nothing decided to show yet.
   */
  allNeedReview: AllNeedReviewPanel | null;
  /** The slices' rows, Other last among them, then the muted rows. */
  categories: CategoryLine[];
  /** Every listed row, muted ones too, so it can differ from the middle figure. */
  total: TotalLine;
  /** The period's Personal rows, less refunds. Never in a category or the donut. */
  personal: string;
  /** How many of the period's rows need review, linking to the Review inbox if any. */
  review: ReviewLine;
  merchants: MerchantList;
};

export type MerchantLine = {
  /** Unique in the list: the merchant key, or one for No Merchant. */
  key: string;
  rank: string;
  /** The bank text of its latest row in the period, or "No Merchant". */
  name: string;
  /** Rows with no merchant key, muted like a missing value. */
  noMerchant: boolean;
  /** Such as "14", for the Visits column. */
  visits: string;
  /** Such as "14 visits", for a phone. */
  visitsText: string;
  total: string;
};

export type MerchantList = {
  /** How merchants are named, shown with the list. */
  hint: string | null;
  lines: MerchantLine[];
  /** Why there's no list, in its place. */
  empty: string | null;
};

export type ReviewLine = { text: string; href: string | null };

export type AllNeedReviewPanel = { title: string; text: string; href: string };

function allNeedReviewPanel(count: number): AllNeedReviewPanel {
  const rows =
    count === 1
      ? "1 row needs review, so there's no Spending to show yet. It counts here once it's decided."
      : `${count.toLocaleString("en-US")} rows need review, so there's no Spending to show yet. They count here once they're decided.`;
  return {
    title: "Every row in this period needs review",
    text: rows,
    href: "/review",
  };
}

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
  return !waitsForReview(row);
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
    const values = outflows.get(row.category) ?? [];
    values.push(outflow(row, currency));
    outflows.set(row.category, values);
  }
  return new Map(
    [...outflows].map(([category, values]) => [category, sumMinor(values)]),
  );
}

/** Money out of the account as a positive amount, checked against its currency. */
function outflow(row: LedgerRow, currency: string): number {
  if (row.amount.currency !== currency) {
    throw new BudgetError("entry-currency-mismatch");
  }
  return -row.amount.minor;
}

/**
 * Personal rows in the period, less their refunds. The ledger has no hidden rows,
 * and a Personal row never needs review, because it has a type and no category.
 */
function personalTotal(inPeriod: readonly LedgerRow[], currency: string): number {
  return sumMinor(
    inPeriod
      .filter((row) => row.type === "personal")
      .map((row) => outflow(row, currency)),
  );
}

/** The most merchants listed. */
const TOP_MERCHANTS = 10;

const NO_MERCHANT = "No Merchant";

type MerchantGroup = {
  key: string;
  outflows: number[];
  /** The latest row so far, which names the merchant. */
  latest: LedgerRow;
};

function isLater(row: LedgerRow, than: LedgerRow): boolean {
  // The same posted date can hold several rows, so the ID keeps the choice stable.
  return row.postedOn > than.postedOn || (row.postedOn === than.postedOn && row.id > than.id);
}

/**
 * The period's decided Spending grouped by merchant key, which is worked out from
 * the stored fields and never stored. Each row is a visit, refunds too, and rows
 * with no key are grouped as No Merchant, which ranks like any merchant. Only a
 * merchant with Spending above zero is listed, as only those get a slice.
 */
function topMerchants(
  spending: readonly LedgerRow[],
  keysById: ReadonlyMap<string, string | undefined>,
  money: (minor: number) => string,
  currency: string,
): MerchantList {
  const groups = new Map<string, MerchantGroup>();
  for (const row of spending) {
    const merchant = keysById.get(row.id);
    const key = merchant === undefined ? "no-merchant" : `merchant:${merchant}`;
    const group = groups.get(key) ?? { key, outflows: [], latest: row };
    group.outflows.push(outflow(row, currency));
    if (isLater(row, group.latest)) group.latest = row;
    groups.set(key, group);
  }

  const ranked = [...groups.values()]
    .map(({ key, outflows, latest }) => ({
      key,
      noMerchant: key === "no-merchant",
      name: key === "no-merchant" ? NO_MERCHANT : latest.description,
      visits: outflows.length,
      total: sumMinor(outflows),
    }))
    .filter(({ total }) => total > 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.visits - a.visits ||
        a.name.localeCompare(b.name) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, TOP_MERCHANTS);

  if (ranked.length === 0) {
    return {
      hint: null,
      lines: [],
      empty: "No merchants to show, because there's no Spending in this period.",
    };
  }
  return {
    hint: "Each merchant is named by the bank text of its latest row.",
    lines: ranked.map(({ key, noMerchant, name, visits, total }, index) => {
      const count = visits.toLocaleString("en-US");
      return {
        key,
        rank: String(index + 1),
        name,
        noMerchant,
        visits: count,
        visitsText: visits === 1 ? "1 visit" : `${count} visits`,
        total: money(total),
      };
    }),
    empty: null,
  };
}

/** The budget's definition, on the ledger, which has no hidden rows. */
function waitsForReview(row: LedgerRow): boolean {
  return needsReview({ ...row, hidden: false });
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
  const inPeriod = ledger.filter((row) => inRange(row.postedOn, range));
  const waiting = inPeriod.filter(waitsForReview).length;
  // Hidden rows are out of every total, so they don't count as decided here.
  const allWaiting = inPeriod.length > 0 && waiting === inPeriod.length;
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
      slices.length === 0 && !allWaiting
        ? {
            title: `No Spending ${periodText(range, today)}.`,
            text: "Only Spending rows count here, so transfers and income aren't shown.",
          }
        : null,
    allNeedReview: allWaiting ? allNeedReviewPanel(waiting) : null,
    // With every row waiting, nothing's decided, so no category has stopped.
    categories: allWaiting ? [] : [
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
    personal: money(personalTotal(inPeriod, currency)),
    review: {
      text: reviewText(waiting, "these totals"),
      href: reviewHref(waiting),
    },
    merchants: topMerchants(
      inPeriod.filter(countsAsSpending),
      new Map(
        accountRows.map((row) => [
          row.id,
          merchantKey({
            ppdId: row.ppd_id ?? undefined,
            orderingPartyId: row.ordering_party_id ?? undefined,
            description: row.description,
          }),
        ]),
      ),
      money,
      currency,
    ),
  };
}
