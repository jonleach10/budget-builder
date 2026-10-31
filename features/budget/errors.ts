export type BudgetErrorCode =
  | "invalid-month"
  | "invalid-amount"
  | "entry-currency-mismatch"
  | "invalid-date";

const MESSAGES: Record<BudgetErrorCode, string> = {
  "invalid-month":
    "The budget month isn't a real month. Use the format YYYY-MM.",
  "invalid-amount":
    "A budget amount isn't a whole number of cents. Check the budget's amounts, then try again.",
  "entry-currency-mismatch":
    "An entry isn't in the budget's currency. Compare each country's entries with that country's budget.",
  "invalid-date":
    "An entry has a date Budget Builder can't read. Use the format YYYY-MM-DD.",
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
