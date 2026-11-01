import { convertMoney } from "@/features/fx/convertMoney";
import { addDays } from "@/features/fx/dates";
import { FxError } from "@/features/fx/errors";
import { fetchRates } from "@/features/fx/fetchRates";
import { findRate, type RatesByDate } from "@/features/fx/findRate";
import type { Money } from "@/lib/money";
import type { ParsedStatement, Transaction } from "./types";

// The combined view is USD only, and `base_amount_minor` is locked at import.
const BASE_CURRENCY = "USD";
const RATED_CURRENCY = "EUR";
const SAME_CURRENCY_RATE = "1";

// Matches `findRate`'s lookback, so a rate for the first of a month can be found.
const LOOKBACK_DAYS = 7;

const SUNDAY = 0;
const SATURDAY = 6;

/** The columns `import_transactions` reads, keyed by name. */
export type ImportRow = {
  account_id: string;
  fingerprint: string;
  posted_on: string;
  purchased_on?: string;
  amount_minor: number;
  currency: string;
  description: string;
  purpose?: string;
  original_amount_minor?: number;
  original_currency?: string;
  original_rate?: string;
  bank_type?: string;
  bank_category?: string;
  ppd_id?: string;
  ordering_party_id?: string;
  transfer_number?: string;
  balance_minor?: number;
  base_amount_minor: number;
  base_currency: string;
  base_rate: string;
  possible_duplicate: boolean;
  /** Filled by the caller from rules, pairing and categories. */
  type?: string;
  category_id?: string;
  category_source?: string;
  suggested_category_id?: string;
};

export type ImportRate = {
  rate_date: string;
  base: string;
  quote: string;
  rate: string;
};

export type PrepareImportInput = {
  statements: readonly ParsedStatement[];
  /** Saved rates from `from` to `to`, inclusive, in USD per EUR. */
  readSavedRates: (from: string, to: string) => Promise<RatesByDate>;
  fetch: typeof globalThis.fetch;
  /** The current date, as YYYY-MM-DD. Rows dated after it aren't stored yet. */
  today: string;
};

export type PreparedImport = {
  rows: ImportRow[];
  /** Rates that aren't saved yet. */
  rates: ImportRate[];
  /** Pending rows in the files, plus rows dated after today. */
  ignoredPendingCount: number;
};

/** What `import_transactions` returns. */
export type StoredCounts = {
  new: number;
  skipped: number;
  possible_duplicates: number;
};

/** Counts only, so it can reach logs and metrics with no financial values. */
export type ImportSummary = {
  newRows: number;
  skippedRows: number;
  possibleDuplicates: number;
  ignoredPending: number;
};

function rateRange(rows: readonly Transaction[]): { from: string; to: string } {
  const dates = rows.map((row) => row.postedOn).sort();
  const firstOfMonth = `${dates[0].slice(0, 7)}-01`;
  return {
    from: addDays(firstOfMonth, -LOOKBACK_DAYS),
    to: dates[dates.length - 1],
  };
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== SUNDAY && day !== SATURDAY;
}

/**
 * Weekdays with no saved rate. `findRate` alone can't show this, because it
 * would answer from an older rate, and rows lock the rate they get. A holiday
 * has no rate, so it counts as missing, which costs one small request.
 */
function missingWeekdays(saved: RatesByDate, from: string, to: string): string[] {
  const missing: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isWeekday(date) && saved[date] === undefined) missing.push(date);
  }
  return missing;
}

async function fetchMissingRates(
  saved: RatesByDate,
  { from, to }: { from: string; to: string },
  fetch: typeof globalThis.fetch,
): Promise<RatesByDate> {
  const missing = missingWeekdays(saved, from, to);
  if (missing.length === 0) return {};

  return fetchRates({
    from: missing[0],
    to: missing[missing.length - 1],
    base: RATED_CURRENCY,
    target: BASE_CURRENCY,
    fetch,
  });
}

function toBaseAmount(
  amount: Money,
  postedOn: string,
  rates: RatesByDate,
): { base: Money; rate: string } {
  if (amount.currency === BASE_CURRENCY) {
    return { base: amount, rate: SAME_CURRENCY_RATE };
  }

  const rate =
    amount.currency === RATED_CURRENCY ? findRate(rates, postedOn) : undefined;
  if (rate === undefined) throw new FxError("no-rate");

  return { base: convertMoney(amount, rate, BASE_CURRENCY), rate };
}

function toImportRow(row: Transaction, rates: RatesByDate): ImportRow {
  const { base, rate } = toBaseAmount(row.amount, row.postedOn, rates);

  return {
    account_id: row.accountId,
    fingerprint: row.fingerprint,
    posted_on: row.postedOn,
    purchased_on: row.purchasedOn,
    amount_minor: row.amount.minor,
    currency: row.amount.currency,
    description: row.description,
    purpose: row.purpose,
    original_amount_minor: row.original?.amount.minor,
    original_currency: row.original?.amount.currency,
    original_rate: row.original?.rate,
    bank_type: row.bankType,
    bank_category: row.bankCategory,
    ppd_id: row.ppdId,
    ordering_party_id: row.orderingPartyId,
    transfer_number: row.transferNumber,
    balance_minor: row.balance?.minor,
    base_amount_minor: base.minor,
    base_currency: base.currency,
    base_rate: rate,
    possible_duplicate: (row.repeatIndex ?? 0) > 0,
  };
}

function toImportRate([rate_date, rate]: [string, string]): ImportRate {
  return { rate_date, base: RATED_CURRENCY, quote: BASE_CURRENCY, rate };
}

/**
 * Turns parsed statements into what `import_transactions` stores: rows with
 * their base amounts, and the rates that aren't saved yet. A saved rate wins over
 * a fetched one, because rows already locked to it have to stay explainable.
 *
 * A row dated after today waits, because no rate exists for its date yet and a
 * stored row locks the rate it gets. A later import stores it once the date comes.
 *
 * Any failure throws before anything is stored. Errors are `FxError` or
 * `MoneyError`, and carry a reason only.
 */
export async function prepareImport({
  statements,
  readSavedRates,
  fetch,
  today,
}: PrepareImportInput): Promise<PreparedImport> {
  const parsed = statements.flatMap((statement) => statement.transactions);
  const transactions = parsed.filter((row) => row.postedOn <= today);
  const ratedRows = transactions.filter(
    (row) => row.amount.currency === RATED_CURRENCY,
  );

  let rates: RatesByDate = {};
  let newRates: RatesByDate = {};
  if (ratedRows.length > 0) {
    const range = rateRange(ratedRows);
    const saved = await readSavedRates(range.from, range.to);
    const fetched = await fetchMissingRates(saved, range, fetch);
    newRates = Object.fromEntries(
      Object.entries(fetched).filter(([date]) => saved[date] === undefined),
    );
    rates = { ...newRates, ...saved };
  }

  return {
    rows: transactions.map((row) => toImportRow(row, rates)),
    rates: Object.entries(newRates).map(toImportRate),
    ignoredPendingCount: statements.reduce(
      (total, statement) => total + statement.ignoredPendingCount,
      parsed.length - transactions.length,
    ),
  };
}

export function summarizeImport(
  stored: StoredCounts,
  ignoredPending: number,
): ImportSummary {
  return {
    newRows: stored.new,
    skippedRows: stored.skipped,
    possibleDuplicates: stored.possible_duplicates,
    ignoredPending,
  };
}
