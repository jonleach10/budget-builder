import { FxError } from "@/features/fx/errors";
import type { StatementError } from "./errors";

const NOTHING_STORED = "Nothing was stored.";
const EXPORT_AGAIN = `${NOTHING_STORED} Export the file again, then import it.`;
const NO_RATES = `Exchange rates aren't available right now. ${NOTHING_STORED} Try again in a few minutes.`;

export const NO_FILES = "Choose at least one CSV file.";

/** Doesn't say nothing was stored, because a lost reply can't prove that. */
export const IMPORT_UNFINISHED =
  "The import didn't finish. Try again. Rows already stored are skipped.";

function placeIn(fileName: string, line?: number): string {
  return line === undefined ? fileName : `Line ${line} of ${fileName}`;
}

function fileMessage(fileName: string, { code, line }: StatementError): string {
  switch (code) {
    case "unknown-format":
      return `${fileName} isn't a format Budget Builder can read. ${NOTHING_STORED} Export a CSV from Chase or Commerzbank.`;
    case "unknown-account":
      return `${fileName} is for an account Budget Builder doesn't know. ${NOTHING_STORED} Check the file, then import it again.`;
    case "account-format-mismatch":
      return `${fileName} doesn't match the statement format set for its account. ${NOTHING_STORED} Check the account's format, then import the file again.`;
    case "mixed-accounts":
      return `${fileName} has rows from more than one account. ${NOTHING_STORED} Export each account to its own file, then import them.`;
    case "malformed-row":
    case "invalid-date":
    case "invalid-amount":
      return `${placeIn(fileName, line)} can't be read. ${EXPORT_AGAIN}`;
    case "currency-mismatch":
      return `${placeIn(fileName, line)} isn't in the account's currency. ${NOTHING_STORED} Check the account's currency, then import the file again.`;
    case "balance-mismatch": {
      const where = line === undefined ? "" : ` at line ${line}`;
      return `The running balance in ${fileName} doesn't add up${where}, so rows may be missing. ${EXPORT_AGAIN}`;
    }
  }
}

/**
 * A `StatementError` with the file it came from, because one bad file stops the
 * whole upload and the screen has to say which. The text holds the file's name
 * and a line number, and no row data.
 */
export class FileRefused extends Error {
  constructor(fileName: string, error: StatementError) {
    super(fileMessage(fileName, error));
    this.name = "FileRefused";
  }
}

/**
 * Only known failures get their own text. Anything else gets a fixed message,
 * because a database error can quote the row it failed on.
 */
export function failureMessage(error: unknown): string {
  if (error instanceof FileRefused) return error.message;
  if (error instanceof FxError) return NO_RATES;
  return IMPORT_UNFINISHED;
}
