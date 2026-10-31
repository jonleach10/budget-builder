import { isCurrencyCode } from "./convertMoney";
import { isIsoDate } from "./dates";
import { FxError } from "./errors";
import type { RatesByDate } from "./findRate";

// Frankfurter blends many sources by default, and the product uses the ECB rate.
const ECB_RATES_URL = "https://api.frankfurter.dev/v2/providers/ecb/rates";

export type FetchRatesOptions = {
  from: string;
  to: string;
  base: string;
  target: string;
  fetch: typeof globalThis.fetch;
};

/**
 * Turns a JSON number into text with no arithmetic, using the shortest digits
 * that identify it. String() switches to e-notation for very small or very
 * large numbers, which isn't a decimal string, so that form is spelled out.
 */
function toDecimalString(rate: number): string {
  const text = String(rate);
  const [mantissa, exponentText] = text.split("e");
  if (exponentText === undefined) return text;

  const [whole, fraction = ""] = mantissa.split(".");
  const exponent = Number(exponentText);
  if (exponent < 0) return `0.${"0".repeat(-exponent - 1)}${whole}${fraction}`;
  return (whole + fraction).padEnd(exponent + 1, "0");
}

/**
 * Reads one row of the v2 response, an array of { date, base, quote, rate }.
 * The date isn't held to the requested range: a range that starts on a day with
 * no rate comes back with the last rate before it.
 */
function readRow(
  row: unknown,
  base: string,
  target: string,
): [date: string, rate: string] {
  if (typeof row !== "object" || row === null) {
    throw new FxError("unexpected-response");
  }

  const { date, base: rowBase, quote, rate } = row as Record<string, unknown>;
  if (
    typeof date !== "string" ||
    !isIsoDate(date) ||
    rowBase !== base ||
    quote !== target ||
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    throw new FxError("unexpected-response");
  }

  return [date, toDecimalString(rate)];
}

/** Rate requests carry dates and currency codes, never anything from a row. */
export async function fetchRates({
  from,
  to,
  base,
  target,
  fetch,
}: FetchRatesOptions): Promise<RatesByDate> {
  if (
    !isIsoDate(from) ||
    !isIsoDate(to) ||
    !isCurrencyCode(base) ||
    !isCurrencyCode(target)
  ) {
    throw new FxError("bad-request");
  }

  const query = new URLSearchParams({ from, to, base, quotes: target });

  // Both catches drop the original error, whose message can hold response text.
  let response: Response;
  try {
    response = await fetch(`${ECB_RATES_URL}?${query}`);
  } catch {
    throw new FxError("request-failed");
  }
  if (!response.ok) throw new FxError("request-failed");

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FxError("unexpected-response");
  }
  if (!Array.isArray(body)) throw new FxError("unexpected-response");

  return Object.fromEntries(body.map((row) => readRow(row, base, target)));
}
