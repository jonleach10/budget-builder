export type FxErrorReason =
  | "bad-rate"
  | "bad-request"
  | "request-failed"
  | "unexpected-response";

const MESSAGES: Record<FxErrorReason, string> = {
  "bad-rate": "The exchange rate isn't a positive decimal number.",
  "bad-request":
    "The exchange rate request needs ISO dates and three-letter currency codes.",
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
