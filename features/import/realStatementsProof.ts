import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { parseMoney, sumMinor } from "@/lib/money";
import { StatementError } from "./errors";
import { parseStatement } from "./parseStatement";
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
  balanceMismatchCount: number;
  ibanShapedFieldCount: number;
};

export type RawAmounts = { dataRowCount: number; bookedSum: number };

const COMMERZBANK_FIELDS_FROM_AMOUNT = 7;
const IBAN_CANDIDATE = /[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}/g;
const IBAN_MIN_DIGITS = 10;
const SEPA_CREDITOR_ID = /^[A-Z]{2}\d{2}ZZZ/;

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

/** Rows run newest first, so each balance less its amount is the next balance. */
export function countBalanceMismatches(
  transactions: readonly Transaction[],
): number {
  let mismatches = 0;
  for (let i = 0; i + 1 < transactions.length; i += 1) {
    const { amount, balance } = transactions[i];
    const next = transactions[i + 1].balance;
    if (!balance || !next || balance.minor - amount.minor !== next.minor) {
      mismatches += 1;
    }
  }
  return mismatches;
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

function failed(failure: StatementCheck["failure"]): StatementCheck {
  return {
    failure,
    countsMatch: false,
    sumsMatch: false,
    balanceMismatchCount: 0,
    ibanShapedFieldCount: 0,
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
      hash: (input) => createHash("sha256").update(input).digest("hex"),
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
      balanceMismatchCount:
        format === "chase-bank" ? countBalanceMismatches(transactions) : 0,
      ibanShapedFieldCount: countIbanShapedFields(transactions),
    };
  } catch (error) {
    if (error instanceof StatementError) {
      return failed({ code: error.code, line: error.line });
    }
    return failed({ code: "unexpected-error" });
  }
}
