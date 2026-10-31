import { type DecimalStyle, type Money, MoneyError, parseMoney } from "@/lib/money";
import { parseGermanDate, parseUsDate } from "../dates";
import { StatementError } from "../errors";

export function readAmount(
  text: string,
  currency: string,
  style: DecimalStyle,
  line: number,
): Money {
  try {
    return parseMoney(text, currency, style);
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new StatementError("invalid-amount", line);
    }
    throw error;
  }
}

export function readUsDate(text: string, line: number): string {
  const date = parseUsDate(text);
  if (date === null) throw new StatementError("invalid-date", line);
  return date;
}

export function readGermanDate(text: string, line: number): string {
  const date = parseGermanDate(text);
  if (date === null) throw new StatementError("invalid-date", line);
  return date;
}

/** Reads an amount that adds detail to a row, so a bad one never fails the file. */
export function readOptionalAmount(
  text: string,
  currency: string,
  style: DecimalStyle,
): Money | undefined {
  try {
    return parseMoney(text, currency, style);
  } catch (error) {
    if (error instanceof MoneyError) return undefined;
    throw error;
  }
}
