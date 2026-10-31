export type Money = { minor: number; currency: string };

export type DecimalStyle = "us" | "german";

export type MoneyErrorReason =
  | "malformed"
  | "too-many-decimals"
  | "out-of-range"
  | "bad-currency";

const MESSAGES: Record<MoneyErrorReason, string> = {
  malformed: "The amount isn't a number in the expected format.",
  "too-many-decimals": "The amount has too many decimals for its currency.",
  "out-of-range": "The amount is too large to hold exactly.",
  "bad-currency": "The currency isn't a three-letter ISO code.",
};

/** Carries a reason only, so a caller can't leak the input through a message. */
export class MoneyError extends Error {
  readonly reason: MoneyErrorReason;

  constructor(reason: MoneyErrorReason) {
    super(MESSAGES[reason]);
    this.name = "MoneyError";
    this.reason = reason;
  }
}

const DEFAULT_EXPONENT = 2;
const EXPONENTS: Record<string, number> = { JPY: 0, KRW: 0 };

const STYLES: Record<
  DecimalStyle,
  { shape: RegExp; decimal: string; group: string }
> = {
  us: {
    shape: /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/,
    decimal: ".",
    group: ",",
  },
  german: {
    shape: /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/,
    decimal: ",",
    group: ".",
  },
};

export function isDecimalShaped(text: string, style: DecimalStyle): boolean {
  return STYLES[style].shape.test(text.trim());
}

/** Reads a decimal string as text, so no value ever passes through a float. */
export function parseMoney(
  text: string,
  currency: string,
  style: DecimalStyle,
): Money {
  if (!/^[A-Z]{3}$/.test(currency)) throw new MoneyError("bad-currency");

  const trimmed = text.trim();
  if (!isDecimalShaped(trimmed, style)) throw new MoneyError("malformed");

  const { decimal, group } = STYLES[style];
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(decimal);

  const exponent = EXPONENTS[currency] ?? DEFAULT_EXPONENT;
  if (fraction.length > exponent) throw new MoneyError("too-many-decimals");

  const digits = whole.split(group).join("") + fraction.padEnd(exponent, "0");
  const magnitude = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(magnitude)) throw new MoneyError("out-of-range");

  return { minor: negative && magnitude !== 0 ? -magnitude : magnitude, currency };
}

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isInteger(value)) throw new MoneyError("malformed");
    total += value;
    if (!Number.isSafeInteger(total)) throw new MoneyError("out-of-range");
  }
  return total;
}
