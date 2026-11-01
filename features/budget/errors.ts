export type BudgetErrorCode =
  | "invalid-month"
  | "invalid-amount"
  | "entry-currency-mismatch"
  | "invalid-date"
  | "comparison-mismatch"
  | "conversion-currency-mismatch"
  | "unknown-account";

const MESSAGES: Record<BudgetErrorCode, string> = {
  "invalid-month":
    "The budget month isn't a real month. Use the format YYYY-MM.",
  "invalid-amount":
    "A budget amount isn't a whole number of cents. Check the budget's amounts, then try again.",
  "entry-currency-mismatch":
    "An entry isn't in the budget's currency. Compare each country's entries with that country's budget.",
  "invalid-date":
    "An entry has a date Budget Builder can't read. Use the format YYYY-MM-DD.",
  "comparison-mismatch":
    "These comparisons can't be combined. Use a US and a Germany comparison for the same month.",
  "conversion-currency-mismatch":
    "The currency conversion didn't return USD. Check the conversion, then try again.",
  "unknown-account":
    "A transaction's account can't be found. Reload the page, then try again.",
};

/** Takes a code only, so an error can't carry entry data. */
export class BudgetError extends Error {
  readonly code: BudgetErrorCode;

  constructor(code: BudgetErrorCode) {
    super(MESSAGES[code]);
    this.name = "BudgetError";
    this.code = code;
  }
}
