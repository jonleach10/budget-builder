export type FxErrorReason =
  | "bad-rate"
  | "bad-request"
  | "no-rate"
  | "request-failed"
  | "unexpected-response";

const MESSAGES: Record<FxErrorReason, string> = {
  "bad-rate": "The exchange rate isn't a positive decimal number.",
  "bad-request":
    "The exchange rate request needs ISO dates and three-letter currency codes.",
  "no-rate":
    "Budget Builder has no exchange rate for a date in this import. Try again later.",
  "request-failed": "The exchange rate request failed. Try again later.",
  "unexpected-response":
    "Budget Builder can't read the exchange rate response. Try again later.",
};

/** Carries a reason only, so a caller can't leak the input through a message. */
export class FxError extends Error {
  readonly reason: FxErrorReason;

  constructor(reason: FxErrorReason) {
    super(MESSAGES[reason]);
    this.name = "FxError";
    this.reason = reason;
  }
}
