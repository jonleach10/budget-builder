export type StatementErrorCode =
  | "unknown-format"
  | "unknown-account"
  | "account-format-mismatch"
  | "mixed-accounts"
  | "malformed-row"
  | "invalid-date"
  | "invalid-amount"
  | "currency-mismatch"
  | "balance-mismatch";

const EXPORT_AGAIN =
  "Export the statement from the bank again, then import the new file.";

function messageFor(code: StatementErrorCode, line?: number): string {
  const where = line === undefined ? "This file" : `Line ${line}`;

  switch (code) {
    case "unknown-format":
      return "Budget Builder doesn't recognize this file. Export a CSV statement from Chase or Commerzbank, then import that file.";
    case "unknown-account":
      return "Budget Builder can't match this file to one account. Check that the account exists with the right last four digits, then import the file again. Chase files also need the file name they were downloaded with.";
    case "account-format-mismatch":
      return "The account for this file is set up for a different statement format. Change the account's format, or import a statement for that account.";
    case "mixed-accounts":
      return "This file has rows from more than one account. Export each account to its own file, then import them one at a time.";
    case "malformed-row":
      return `${where} doesn't have the expected columns. ${EXPORT_AGAIN}`;
    case "invalid-date":
      return `${where} has a date Budget Builder can't read. ${EXPORT_AGAIN}`;
    case "invalid-amount":
      return `${where} has an amount Budget Builder can't read. ${EXPORT_AGAIN}`;
    case "currency-mismatch":
      return `${where} isn't in the account's currency. Check the account's currency, then import the file again.`;
    case "balance-mismatch":
      return `${where} has a balance that doesn't follow from the row above it. ${EXPORT_AGAIN}`;
  }
}

/**
 * Takes a code and a line number only, so an error can't carry row contents.
 * Any bad row fails the whole file.
 */
export class StatementError extends Error {
  readonly code: StatementErrorCode;
  readonly line?: number;

  constructor(code: StatementErrorCode, line?: number) {
    super(messageFor(code, line));
    this.name = "StatementError";
    this.code = code;
    this.line = line;
  }
}
