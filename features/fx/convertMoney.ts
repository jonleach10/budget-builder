import { currencyExponent, type Money, MoneyError } from "@/lib/money";
import { FxError } from "./errors";

// tsconfig targets ES2017, which rules out BigInt literals such as 10n.
const TEN = BigInt(10);
const TWO = BigInt(2);
const MAX_SIZE = BigInt(Number.MAX_SAFE_INTEGER);

function assertCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) throw new MoneyError("bad-currency");
}

// BigInt's own errors print the value, so a bad value stops here first.
function assertMinor(minor: number): void {
  if (!Number.isInteger(minor)) throw new MoneyError("malformed");
  if (!Number.isSafeInteger(minor)) throw new MoneyError("out-of-range");
}

/** Reads the rate as text, so it never passes through a float. */
function parseRate(rate: string): { digits: bigint; scale: number } {
  if (typeof rate !== "string" || !/^\d+(?:\.\d+)?$/.test(rate)) {
    throw new FxError("bad-rate");
  }

  const [whole, fraction = ""] = rate.split(".");
  const digits = BigInt(whole + fraction);
  if (digits === BigInt(0)) throw new FxError("bad-rate");

  return { digits, scale: fraction.length };
}

/** Converts at a decimal rate holding target units per one source unit. */
export function convertMoney(
  money: Money,
  rate: string,
  targetCurrency: string,
): Money {
  assertCurrency(money.currency);
  assertCurrency(targetCurrency);
  assertMinor(money.minor);
  const { digits, scale } = parseRate(rate);

  const negative = money.minor < 0;
  const size = BigInt(Math.abs(money.minor));

  const numerator =
    size * digits * TEN ** BigInt(currencyExponent(targetCurrency));
  const denominator = TEN ** BigInt(scale + currencyExponent(money.currency));

  // Rounds half up on the size, then puts the sign back, so -0.005 and 0.005
  // both move away from zero. BigInt has no negative zero, so neither does the
  // result.
  const rounded = (numerator * TWO + denominator) / (denominator * TWO);
  if (rounded > MAX_SIZE) throw new MoneyError("out-of-range");

  return {
    minor: Number(negative ? -rounded : rounded),
    currency: targetCurrency,
  };
}
