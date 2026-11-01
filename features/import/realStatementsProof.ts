import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { parseMoney, sumMinor } from "@/lib/money";
import { StatementError } from "./errors";
import { sha256Hex } from "./fingerprint";
import { parseStatement } from "./parseStatement";
import { redactIdentifier } from "./redact";
import type {
  Account,
  StatementFormat,
  StatementSource,
  Transaction,
} from "./types";

/*
 * Checks for realStatements.test.ts. Everything a check returns is a count, a
 * boolean, or an error code and line, so a failed run prints no statement data.
 * The raw readers here share no code with the adapters.
 */

export type StatementCheck = {
  failure: { code: string; line?: number } | null;
  countsMatch: boolean;
  sumsMatch: boolean;
  ibanShapedFieldCount: number;
  missedFieldCount: number;
};

export type RawAmounts = { dataRowCount: number; bookedSum: number };

export type ExportComparison = {
  sharedRowCount: number;
  matchedRowCount: number;
};

const COMMERZBANK_FIELDS_FROM_AMOUNT = 7;
const IBAN_CANDIDATE = /[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}/g;
const IBAN_MIN_DIGITS = 10;
const SEPA_CREDITOR_ID = /^[A-Z]{2}\d{2}(?:ZZZ|[A-Z]{3}\d)/;
// Reads a line that countMissedFields has already lowered and stripped of spaces.
const ORDERING_PARTY_VALUE =
  /idoforderingparty:([a-z0-9]{1,35})(?=sepa-|end-to-endreference:|customerreference:|mandatereference:|;|"|$)/;

const TEXT_FIELDS = [
  "description",
  "purpose",
  "bankType",
  "bankCategory",
  "ppdId",
  "orderingPartyId",
  "transferNumber",
] as const;

export function readStatementFiles(dir: string): StatementSource[] {
  return readdirSync(dir)
    .filter((name) => /\.csv$/i.test(name))
    .sort()
    .map((fileName) => ({
      fileName,
      text: readFileSync(join(dir, fileName), "utf8"),
    }));
}

function accountShapeOf({
  fileName,
  text,
}: StatementSource): Omit<Account, "id"> | null {
  const chase = /Chase(\d{4})_/.exec(fileName);
  if (chase) {
    const [header] = text.split("\n");
    const format = header.includes("Posting Date") ? "chase-bank" : "chase-card";
    return { lastFour: chase[1], format, currency: "USD" };
  }

  const euro = /DE(\d{4})_EUR/.exec(fileName);
  if (euro) {
    return { lastFour: euro[1], format: "commerzbank", currency: "EUR" };
  }

  return null;
}

/** Builds accounts at runtime, so no account number is ever committed. */
export function buildAccounts(files: readonly StatementSource[]): Account[] {
  const accounts: Account[] = [];
  for (const file of files) {
    const shape = accountShapeOf(file);
    const known = accounts.some(
      (account) =>
        account.lastFour === shape?.lastFour &&
        account.format === shape?.format,
    );
    if (shape && !known) {
      accounts.push({ ...shape, id: `account-${accounts.length + 1}` });
    }
  }
  return accounts;
}

function readRawChase(text: string, currency: string): RawAmounts {
  const { data } = Papa.parse<string[]>(text, {
    delimiter: ",",
    newline: "\n",
    skipEmptyLines: true,
  });
  const [header, ...rows] = data;
  const amountIndex = header.indexOf("Amount");

  return {
    dataRowCount: rows.length,
    bookedSum: sumMinor(
      rows.map((row) => parseMoney(row[amountIndex], currency, "us").minor),
    ),
  };
}

function readRawCommerzbank(text: string, currency: string): RawAmounts {
  const rows = text
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(";"));
  const booked = rows.filter(([bookingDate]) => bookingDate.trim() !== "");

  return {
    dataRowCount: rows.length,
    bookedSum: sumMinor(
      booked.map((fields) => {
        const amount = fields[fields.length - COMMERZBANK_FIELDS_FROM_AMOUNT];
        return parseMoney(amount, currency, "german").minor;
      }),
    ),
  };
}

export function readRawAmounts(
  text: string,
  format: StatementFormat,
  currency: string,
): RawAmounts {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  return format === "commerzbank"
    ? readRawCommerzbank(normalized, currency)
    : readRawChase(normalized, currency);
}

function hasIbanShape(text: string): boolean {
  const candidates = text.match(IBAN_CANDIDATE) ?? [];
  return candidates.some(
    (candidate) =>
      candidate.replace(/\D/g, "").length >= IBAN_MIN_DIGITS,
  );
}

export function countIbanShapedFields(
  transactions: readonly Transaction[],
): number {
  let count = 0;
  for (const transaction of transactions) {
    for (const field of TEXT_FIELDS) {
      const value = transaction[field];
      if (value === undefined || !hasIbanShape(value)) continue;
      const allowed =
        field === "orderingPartyId" && SEPA_CREDITOR_ID.test(value);
      if (!allowed) count += 1;
    }
  }
  return count;
}

/** `redactIdentifier` drops an ID shaped like an IBAN, on the private side. */
function isDroppedOrderingPartyId(line: string): boolean {
  const value = ORDERING_PARTY_VALUE.exec(line)?.[1];
  return (
    value !== undefined && redactIdentifier(value.toUpperCase()) === undefined
  );
}

// Each marker in the raw text promises a filled field, so a field that parsing
// silently leaves empty shows up here. Lines are lower case with no spaces. The
// exchange marker names a currency, because an unknown one leaves original unset.
const FIELD_MARKERS: readonly {
  marker: RegExp;
  isFilled: (transaction: Transaction) => boolean;
  isDropped?: (line: string) => boolean;
}[] = [
  {
    marker: /idoforderingparty:/,
    isFilled: (t) => t.orderingPartyId !== undefined,
    isDropped: isDroppedOrderingPartyId,
  },
  { marker: /originalbetrag:/, isFilled: (t) => t.original !== undefined },
  { marker: /euro[\d.]+x[\d.]+\(exchgrte\)/, isFilled: (t) => t.original !== undefined },
  { marker: /ppdid:/, isFilled: (t) => t.ppdId !== undefined },
  { marker: /transaction#:/, isFilled: (t) => t.transferNumber !== undefined },
  {
    marker: /,debit_card,/,
    isFilled: (t) => t.bankType === "DEBIT_CARD" && t.purchasedOn !== undefined,
  },
];

export function countMissedFields(
  text: string,
  transactions: readonly Transaction[],
): number {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(1)
    .filter((line) => !line.startsWith(";;"))
    .map((line) => line.replace(/\s/g, "").toLowerCase());

  let missed = 0;
  for (const { marker, isFilled, isDropped } of FIELD_MARKERS) {
    const marked = lines.filter(
      (line) => marker.test(line) && !isDropped?.(line),
    ).length;
    const filled = transactions.filter(isFilled).length;
    if (marked > filled) missed += marked - filled;
  }
  return missed;
}

/** Parses every file with the production hash. A bad file throws. */
export async function readTransactions(
  files: readonly StatementSource[],
  accounts: readonly Account[],
): Promise<Transaction[]> {
  const statements = await Promise.all(
    files.map((file) => parseStatement({ ...file, accounts, hash: sha256Hex })),
  );
  return statements.flatMap((statement) => statement.transactions);
}

function postedRange(rows: readonly Transaction[]): [string, string] {
  const dates = rows.map((row) => row.postedOn).sort();
  return [dates[0], dates[dates.length - 1]];
}

/**
 * Proves the fingerprint holds across exports: every older row, on a date the
 * newer export also covers, must appear in it with the same fingerprint.
 */
export function compareExports(
  older: readonly Transaction[],
  newer: readonly Transaction[],
): ExportComparison {
  let sharedRowCount = 0;
  let matchedRowCount = 0;

  for (const accountId of new Set(older.map((row) => row.accountId))) {
    const newerRows = newer.filter((row) => row.accountId === accountId);
    if (newerRows.length === 0) continue;

    const olderRows = older.filter((row) => row.accountId === accountId);
    const [firstOlder, lastOlder] = postedRange(olderRows);
    const [firstNewer, lastNewer] = postedRange(newerRows);
    const from = firstOlder > firstNewer ? firstOlder : firstNewer;
    const to = lastOlder < lastNewer ? lastOlder : lastNewer;

    const fingerprints = new Set(newerRows.map((row) => row.fingerprint));
    const shared = olderRows.filter(
      (row) => row.postedOn >= from && row.postedOn <= to,
    );
    sharedRowCount += shared.length;
    matchedRowCount += shared.filter((row) =>
      fingerprints.has(row.fingerprint),
    ).length;
  }

  return { sharedRowCount, matchedRowCount };
}

function failed(failure: StatementCheck["failure"]): StatementCheck {
  return {
    failure,
    countsMatch: false,
    sumsMatch: false,
    ibanShapedFieldCount: 0,
    missedFieldCount: 0,
  };
}

export async function checkStatement(
  file: StatementSource,
  accounts: readonly Account[],
): Promise<StatementCheck> {
  try {
    const statement = await parseStatement({
      ...file,
      accounts,
      hash: sha256Hex,
    });
    const { transactions, format, ignoredPendingCount } = statement;

    const currency = accounts.find((a) => a.id === statement.accountId)?.currency;
    if (currency === undefined) return failed({ code: "unexpected-account" });
    const raw = readRawAmounts(file.text, format, currency);

    const parsedSum = sumMinor(transactions.map((t) => t.amount.minor));

    return {
      failure: null,
      countsMatch:
        transactions.length + ignoredPendingCount === raw.dataRowCount,
      sumsMatch: parsedSum === raw.bookedSum,
      ibanShapedFieldCount: countIbanShapedFields(transactions),
      missedFieldCount: countMissedFields(file.text, transactions),
    };
  } catch (error) {
    if (error instanceof StatementError) {
      return failed({ code: error.code, line: error.line });
    }
    return failed({ code: "unexpected-error" });
  }
}
