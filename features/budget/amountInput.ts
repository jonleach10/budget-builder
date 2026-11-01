import { MoneyError, parseMoney } from "@/lib/money";

export type AmountCheck =
  | { ok: true; minor: number | null }
  | { ok: false; message: string };

/**
 * Reads what was typed in a budget field. Blank means no amount. Both countries
 * use the US style, because that's how the screen shows amounts, EUR included.
 * The server action runs this again, so the screen's check is only a courtesy.
 */
export function checkAmount(text: string, currency: string): AmountCheck {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, minor: null };
  if (trimmed.startsWith("-")) {
    return { ok: false, message: "Enter an amount of 0.00 or more." };
  }

  try {
    return { ok: true, minor: parseMoney(trimmed, currency, "us").minor };
  } catch (error) {
    if (!(error instanceof MoneyError)) throw error;
    return { ok: false, message: "Enter an amount such as 450.00." };
  }
}
