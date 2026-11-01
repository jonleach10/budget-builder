import { convertMoney } from "@/features/fx/convertMoney";
import { findRate, type RatesByDate } from "@/features/fx/findRate";
import type {
  Account,
  StatementFormat,
  Transaction,
} from "@/features/import/types";
import { sumMinor } from "@/lib/money";
import { hasText } from "./text";

const CARD_PAYMENT_MAX_DAYS = 5;
const CROSS_CURRENCY_MAX_DAYS = 5;
const CROSS_CURRENCY_MAX_PERCENT = 5;
const SAME_AMOUNT_MAX_DAYS = 3;

const CARD_PAYMENT_BANK_TYPE = "Payment";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PairingAccount = Pick<Account, "id" | "format">;

export type RowId = Pick<Transaction, "accountId" | "fingerprint">;

export type TransferEvidence =
  | "transfer-number"
  | "card-payment"
  | "cross-currency";

export type TransferPair = {
  evidence: TransferEvidence;
  moneyOut: RowId;
  moneyIn: RowId;
};

export type UncertainReason = TransferEvidence | "no-rate" | "same-amount";

/** Rows that may belong together, for JL to decide. */
export type UncertainMatch = {
  reason: UncertainReason;
  rows: RowId[];
};

export type PairingResult = {
  pairs: TransferPair[];
  uncertain: UncertainMatch[];
  unpairedCardPayments: RowId[];
};

type OpenRow = Transaction & { format: StatementFormat; day: number };

/** Two rows that may be one transfer. With no rate, the link can't be judged. */
type Link = { rows: [OpenRow, OpenRow]; noRate?: boolean };

function rowId({ accountId, fingerprint }: RowId): RowId {
  return { accountId, fingerprint };
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareRowIds(a: RowId, b: RowId): number {
  return (
    compareText(a.accountId, b.accountId) ||
    compareText(a.fingerprint, b.fingerprint)
  );
}

function isCardRow(row: OpenRow): boolean {
  return row.format === "chase-card";
}

/**
 * The rows any evidence can judge. A zero amount moved no money, a card row
 * other than a payment can't be half of a transfer, and an unlisted account has
 * no known format.
 */
function openRows(
  rows: readonly Transaction[],
  accounts: readonly PairingAccount[],
): OpenRow[] {
  const formats = new Map(accounts.map(({ id, format }) => [id, format]));
  return rows.flatMap((row) => {
    const format = formats.get(row.accountId);
    if (format === undefined || row.amount.minor === 0) return [];
    const open = {
      ...row,
      format,
      // A date alone parses as UTC, so a clock change can't skip or repeat a day.
      day: Date.parse(row.postedOn) / MS_PER_DAY,
    };
    return isCardRow(open) && row.bankType !== CARD_PAYMENT_BANK_TYPE
      ? []
      : [open];
  });
}

function isOpposite(a: OpenRow, b: OpenRow): boolean {
  return (
    a.amount.currency === b.amount.currency &&
    a.amount.minor === -b.amount.minor
  );
}

function canPair(a: OpenRow, b: OpenRow): boolean {
  return a.accountId !== b.accountId && isOpposite(a, b);
}

function isWithinDays(a: OpenRow, b: OpenRow, days: number): boolean {
  return Math.abs(a.day - b.day) <= days;
}

function isMoneyOut(row: OpenRow): boolean {
  return row.amount.minor < 0;
}

function moneyOutFirst(a: OpenRow, b: OpenRow): [OpenRow, OpenRow] {
  return isMoneyOut(a) ? [a, b] : [b, a];
}

function toPair(
  a: OpenRow,
  b: OpenRow,
  evidence: TransferEvidence,
): TransferPair {
  const [moneyOut, moneyIn] = moneyOutFirst(a, b);
  return { evidence, moneyOut: rowId(moneyOut), moneyIn: rowId(moneyIn) };
}

function toUncertain(
  rows: readonly OpenRow[],
  reason: UncertainReason,
): UncertainMatch {
  return { reason, rows: rows.map(rowId).sort(compareRowIds) };
}

function groupByNumber(rows: readonly OpenRow[]): OpenRow[][] {
  const groups = new Map<string, OpenRow[]>();
  for (const row of rows) {
    const number = row.transferNumber;
    if (!hasText(number)) continue;
    groups.set(number, [...(groups.get(number) ?? []), row]);
  }
  return [...groups.values()];
}

function linksBetween(
  rows: readonly OpenRow[],
  others: readonly OpenRow[],
  isCandidate: (row: OpenRow, other: OpenRow) => boolean,
): Link[] {
  return rows.flatMap((row) =>
    others
      .filter((other) => isCandidate(row, other))
      .map((other): Link => ({ rows: [row, other] })),
  );
}

function sharesRow(a: Link, b: Link): boolean {
  return a.rows.some((row) => b.rows.includes(row));
}

/** Splits links into groups, where linked rows always share a group. */
function linkGroups(links: readonly Link[]): Link[][] {
  let groups: Link[][] = [];
  for (const link of links) {
    const touching = groups.filter((group) =>
      group.some((other) => sharesRow(other, link)),
    );
    const others = groups.filter((group) => !touching.includes(group));
    groups = [...others, [...touching.flat(), link]];
  }
  return groups;
}

function rowsIn(links: readonly Link[]): Set<OpenRow> {
  return new Set(links.flatMap((link) => link.rows));
}

/** A group of one link means each row has exactly one candidate: the other. */
function settle(
  links: readonly Link[],
  evidence: TransferEvidence,
  result: PairingResult,
): void {
  for (const group of linkGroups(links)) {
    const noRate = group.some((link) => link.noRate);
    if (group.length === 1 && !noRate) {
      result.pairs.push(toPair(...group[0].rows, evidence));
    } else {
      result.uncertain.push(
        toUncertain([...rowsIn(group)], noRate ? "no-rate" : evidence),
      );
    }
  }
}

function judgeNumbers(rows: readonly OpenRow[], result: PairingResult): void {
  for (const group of groupByNumber(rows)) {
    if (group.length < 2) continue;
    const [a, b] = group;
    if (group.length === 2 && canPair(a, b)) {
      result.pairs.push(toPair(a, b, "transfer-number"));
    } else {
      result.uncertain.push(toUncertain(group, "transfer-number"));
    }
  }
}

function isCardPaymentCandidate(payment: OpenRow, bankRow: OpenRow): boolean {
  return (
    canPair(payment, bankRow) &&
    isWithinDays(payment, bankRow, CARD_PAYMENT_MAX_DAYS)
  );
}

/**
 * Cross-multiplied, so no value becomes a float. `sumMinor` refuses a bad value
 * first, because BigInt's own errors print it.
 */
function isWithinPercent(size: number, base: number, percent: number): boolean {
  const difference = BigInt(Math.abs(sumMinor([size, -base])));
  return difference * BigInt(100) <= BigInt(base) * BigInt(percent);
}

function isCurrency(row: OpenRow, currency: string): boolean {
  return row.amount.currency === currency;
}

function canCrossCurrencies(eurRow: OpenRow, usdRow: OpenRow): boolean {
  return (
    eurRow.accountId !== usdRow.accountId &&
    isMoneyOut(eurRow) !== isMoneyOut(usdRow) &&
    isWithinDays(eurRow, usdRow, CROSS_CURRENCY_MAX_DAYS)
  );
}

function crossCurrencyLinks(
  rows: readonly OpenRow[],
  rates: RatesByDate,
): Link[] {
  const eurRows = rows.filter((row) => isCurrency(row, "EUR"));
  const usdRows = rows.filter((row) => isCurrency(row, "USD"));

  return linksBetween(eurRows, usdRows, canCrossCurrencies).flatMap((link) => {
    const [eurRow, usdRow] = link.rows;
    const [moneyOut] = moneyOutFirst(eurRow, usdRow);
    const rate = findRate(rates, moneyOut.postedOn);
    if (rate === undefined) return [{ ...link, noRate: true }];

    const { minor } = convertMoney(eurRow.amount, rate, "USD");
    return isWithinPercent(
      Math.abs(usdRow.amount.minor),
      Math.abs(minor),
      CROSS_CURRENCY_MAX_PERCENT,
    )
      ? [link]
      : [];
  });
}

function isSameAmountCandidate(moneyOut: OpenRow, moneyIn: OpenRow): boolean {
  return (
    canPair(moneyOut, moneyIn) &&
    isWithinDays(moneyOut, moneyIn, SAME_AMOUNT_MAX_DAYS)
  );
}

/** Opposite amounts alone are too common to prove a transfer, so none pair. */
function flagSameAmounts(rows: readonly OpenRow[], result: PairingResult): void {
  const moneyOut = rows.filter(isMoneyOut);
  const moneyIn = rows.filter((row) => !isMoneyOut(row));
  const links = linksBetween(moneyOut, moneyIn, isSameAmountCandidate);
  for (const group of linkGroups(links)) {
    result.uncertain.push(toUncertain([...rowsIn(group)], "same-amount"));
  }
}

function inStableOrder(result: PairingResult): PairingResult {
  const firstRow = (match: UncertainMatch) => match.rows[0];
  return {
    pairs: [...result.pairs].sort((a, b) =>
      compareRowIds(a.moneyOut, b.moneyOut),
    ),
    uncertain: [...result.uncertain].sort((a, b) =>
      compareRowIds(firstRow(a), firstRow(b)),
    ),
    unpairedCardPayments: [...result.unpairedCardPayments].sort(compareRowIds),
  };
}

/**
 * Finds the transfers among the rows open to pairing. `rates` holds USD per EUR.
 *
 * Evidence goes strongest first: transfer number, card payment, cross-currency,
 * then the same amount alone, which is never enough to pair. Each kind judges
 * all its rows at once, so the result doesn't depend on input order. A row that
 * evidence pairs or calls uncertain takes no part in anything weaker, so it
 * lands in one result at most. A row with a transfer number is only ever judged
 * by that number, because its other side would carry the same one.
 *
 * Errors come from `convertMoney` and `sumMinor`, and carry a reason only.
 */
export function pairTransfers(
  rows: readonly Transaction[],
  accounts: readonly PairingAccount[],
  rates: RatesByDate,
): PairingResult {
  const open = openRows(rows, accounts);
  const result: PairingResult = {
    pairs: [],
    uncertain: [],
    unpairedCardPayments: [],
  };

  judgeNumbers(open, result);

  const unnumbered = open.filter((row) => !hasText(row.transferNumber));
  const cardPayments = unnumbered.filter(isCardRow);
  const bankRows = unnumbered.filter((row) => !isCardRow(row));

  const cardLinks = linksBetween(
    cardPayments,
    bankRows,
    isCardPaymentCandidate,
  );
  settle(cardLinks, "card-payment", result);
  const judgedByCard = rowsIn(cardLinks);
  result.unpairedCardPayments = cardPayments
    .filter((row) => !judgedByCard.has(row))
    .map(rowId);

  const afterCards = bankRows.filter((row) => !judgedByCard.has(row));
  const crossLinks = crossCurrencyLinks(afterCards, rates);
  settle(crossLinks, "cross-currency", result);
  const judgedAcrossCurrencies = rowsIn(crossLinks);

  flagSameAmounts(
    afterCards.filter((row) => !judgedAcrossCurrencies.has(row)),
    result,
  );

  return inStableOrder(result);
}
