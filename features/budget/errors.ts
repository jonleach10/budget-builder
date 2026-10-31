export type BudgetErrorCode = "invalid-month" | "invalid-amount";

const MESSAGES: Record<BudgetErrorCode, string> = {
  "invalid-month":
    "The budget month isn't a real month. Use the format YYYY-MM.",
  "invalid-amount":
    "A budget amount isn't a whole number of cents. Check the budget's amounts, then try again.",
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
