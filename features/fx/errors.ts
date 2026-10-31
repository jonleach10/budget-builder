export type FxErrorReason = "bad-rate";

const MESSAGES: Record<FxErrorReason, string> = {
  "bad-rate": "The exchange rate isn't a positive decimal number.",
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
