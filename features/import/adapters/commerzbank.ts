import { isDecimalShaped } from "@/lib/money";
import { StatementError } from "../errors";
import { isIbanShaped } from "../redact";
import type {
  OriginalAmount,
  StatementAdapter,
  StatementRow,
} from "../types";
import { readAmount, readGermanDate, readOptionalAmount } from "./fields";

const HEADER =
  "Booking date;Value date;Transaction type;Booking text;Amount;Currency;Account IBAN;Category;Sender;Recipient;Transfer purpose";

const FIELD_COUNT = 11;
const BOOKING_TEXT_INDEX = 3;
const FIRST_AMOUNT_INDEX = 4;
const FIELDS_AFTER_IBAN = 4;

// Booking text wraps with stray spaces, even inside words and numbers, so these
// run on the text with all its whitespace removed.
const ORDERING_PARTY_ID =
  /IDOfOrderingParty:([A-Za-z0-9]{1,35})(?=SEPA-|End-To-EndReference:|CustomerReference:|MandateReference:|$)/;
const ORIGINAL_AMOUNT = /Originalbetrag:([\d.,]+)([A-Z]{3})/;
const EXCHANGE_RATE = /Kurs:([\d.,]+)[A-Z]{3}/;

type CommerzbankRow = {
  line: number;
  bookingDate: string;
  valueDate: string;
  transactionType: string;
  bookingText: string;
  amount: string;
  currency: string;
  iban: string;
  category: string;
  sender: string;
  recipient: string;
  purpose: string;
};

function isBlank(text: string): boolean {
  return text.trim() === "";
}

function isPending(row: CommerzbankRow): boolean {
  return isBlank(row.bookingDate) && isBlank(row.valueDate);
}

function findAmountIndex(fields: string[]): number {
  for (let i = FIRST_AMOUNT_INDEX; i + 2 < fields.length; i += 1) {
    if (
      isDecimalShaped(fields[i], "german") &&
      /^[A-Z]{3}$/.test(fields[i + 1]) &&
      isIbanShaped(fields[i + 2])
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Splits a row by hand. Booking text can hold an unquoted semicolon, so the
 * amount, currency and IBAN that follow it are the anchor for everything else.
 * Only booking text gets this rescue: nothing anchors the columns after it.
 */
function readRow(text: string, line: number): CommerzbankRow {
  const fields = text.split(";");
  const amountIndex = findAmountIndex(fields);

  if (
    fields.length < FIELD_COUNT ||
    amountIndex === -1 ||
    fields.length !== amountIndex + 3 + FIELDS_AFTER_IBAN
  ) {
    throw new StatementError("malformed-row", line);
  }

  const [bookingDate, valueDate, transactionType] = fields;
  const [amount, currency, iban, category, sender, recipient, purpose] =
    fields.slice(amountIndex);

  return {
    line,
    bookingDate,
    valueDate,
    transactionType,
    bookingText: fields.slice(BOOKING_TEXT_INDEX, amountIndex).join(";"),
    amount,
    currency,
    iban: iban.replace(/\s/g, ""),
    category,
    sender,
    recipient,
    purpose,
  };
}

function readRows(text: string): CommerzbankRow[] {
  const rows: CommerzbankRow[] = [];
  text.split("\n").forEach((rowText, index) => {
    if (index > 0 && !isBlank(rowText)) rows.push(readRow(rowText, index + 1));
  });
  return rows;
}

function readRate(text: string | undefined): string | undefined {
  if (text === undefined || !isDecimalShaped(text, "german")) return undefined;
  return text.replace(/\./g, "").replace(",", ".");
}

function readOriginal(bookingText: string): OriginalAmount | undefined {
  const match = ORIGINAL_AMOUNT.exec(bookingText);
  if (!match) return undefined;

  const amount = readOptionalAmount(match[1], match[2], "german");
  if (!amount) return undefined;

  const rate = readRate(EXCHANGE_RATE.exec(bookingText)?.[1]);
  return rate === undefined ? { amount } : { amount, rate };
}

function chooseDescription(row: CommerzbankRow, minor: number): string {
  const { sender, recipient, purpose, transactionType } = row;
  const [counterparty, other] =
    minor < 0 ? [recipient, sender] : [sender, recipient];
  const choices = [counterparty, other, purpose, transactionType];
  return choices.find((choice) => !isBlank(choice)) ?? "";
}

function toStatementRow(row: CommerzbankRow, currency: string): StatementRow {
  if (row.currency !== currency) {
    throw new StatementError("currency-mismatch", row.line);
  }

  const amount = readAmount(row.amount, currency, "german", row.line);
  const bookingText = row.bookingText.replace(/\s/g, "");

  return {
    postedOn: readGermanDate(row.bookingDate, row.line),
    amount,
    description: chooseDescription(row, amount.minor),
    purpose: row.purpose,
    original: readOriginal(bookingText),
    bankType: row.transactionType,
    bankCategory: row.category,
    orderingPartyId: ORDERING_PARTY_ID.exec(bookingText)?.[1],
  };
}

export const commerzbank: StatementAdapter = {
  id: "commerzbank",
  detect: (headerRow) => headerRow === HEADER,
  lastFour({ text }) {
    const rows = readRows(text);
    if (rows.length === 0) return null;

    const [{ iban }] = rows;
    const other = rows.find((row) => row.iban !== iban);
    if (other) throw new StatementError("mixed-accounts", other.line);
    return iban.slice(-4);
  },
  parse(text, account) {
    const allRows = readRows(text);
    const booked = allRows.filter((row) => !isPending(row));

    return {
      rows: booked.map((row) => toStatementRow(row, account.currency)),
      ignoredPendingCount: allRows.length - booked.length,
    };
  },
};
