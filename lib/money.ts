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

// Every ISO 4217 currency whose exponent isn't 2.
const EXPONENTS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4,
};

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency] ?? DEFAULT_EXPONENT;
}

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
  // A bank can print 5.000,00 for a currency with no minor unit.
  const hasOnlyZeroDecimals = exponent === 0 && /^0*$/.test(fraction);
  if (fraction.length > exponent && !hasOnlyZeroDecimals) {
    throw new MoneyError("too-many-decimals");
  }

  const minorDigits = fraction.padEnd(exponent, "0").slice(0, exponent);
  const digits = whole.split(group).join("") + minorDigits;
  const magnitude = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(magnitude)) throw new MoneyError("out-of-range");

  return { minor: negative && magnitude !== 0 ? -magnitude : magnitude, currency };
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", JPY: "¥" };

/** Splits the digits as text, so a stored value never passes through a float. */
function splitDigits({ minor, currency }: Money): {
  whole: string;
  fraction: string;
} {
  if (!Number.isInteger(minor)) throw new MoneyError("malformed");
  if (!Number.isSafeInteger(minor)) throw new MoneyError("out-of-range");

  const exponent = currencyExponent(currency);
  const digits = String(Math.abs(minor)).padStart(exponent + 1, "0");
  const wholeLength = digits.length - exponent;
  return {
    whole: digits.slice(0, wholeLength),
    fraction: digits.slice(wholeLength),
  };
}

function joinDigits(whole: string, fraction: string): string {
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/** Formats minor units for display, such as $1,234.56 or -€5.00. */
export function formatMoney(money: Money): string {
  const { whole, fraction } = splitDigits(money);
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, ",");
  const prefix = SYMBOLS[money.currency] ?? `${money.currency} `;
  const sign = money.minor < 0 ? "-" : "";
  return `${sign}${prefix}${joinDigits(grouped, fraction)}`;
}

/** Formats an amount for a text field, in a form parseMoney reads back. */
export function formatPlainAmount(money: Money): string {
  const { whole, fraction } = splitDigits(money);
  return `${money.minor < 0 ? "-" : ""}${joinDigits(whole, fraction)}`;
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
