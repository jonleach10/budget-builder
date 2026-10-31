import type { StatementRow } from "./types";

export const REDACTED = "[REDACTED]";

const IBAN_MIN_LENGTH = 15;
const CARD_MIN_LENGTH = 12;

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

// Spaces are optional, because bank text wraps at arbitrary points. A match is
// its first word, extended to the word holding its last digit, which leaves the
// capitalized words after an IBAN out of it. There's no upper limit, because a
// limit can end a match inside an IBAN that starts later in the run and leave
// its tail in the text.
const IBAN_CANDIDATE =
  /[A-Z]{2}\d{2}[A-Z0-9]*(?:(?: ?[A-Z0-9])* ?\d[A-Z0-9]*)?/g;

// A word of five or more letters can't be part of a spaced IBAN, so it divides
// the text into separate runs. The capture keeps the word when splitting.
const NON_IBAN_WORD = /(?<![A-Z0-9])([A-Z]{5,})(?![A-Z0-9])/;

// Groups need a separator between them, which keeps this linear on long runs.
// Each group has at least two characters so "100 x 200" stays text.
const CARD_CANDIDATE = /[0-9Xx*]{2,}(?:[ -][0-9Xx*]{2,})*/g;

// A SEPA creditor ID is shaped like an IBAN, but it identifies a merchant and
// not anyone's account. Its creditor business code is three characters, usually
// ZZZ. Other codes must be three letters then a digit, because many IBANs have
// four letters there.
const SEPA_CREDITOR_ID = /^[A-Z]{2}\d{2}(?:ZZZ[A-Z0-9]+|[A-Z]{3}\d[A-Z0-9]*)$/;

function withoutSpaces(text: string): string {
  return text.replace(/ /g, "");
}

export function isIbanShaped(text: string): boolean {
  return IBAN_SHAPE.test(withoutSpaces(text.trim()));
}

function redactIbanCandidates(text: string): string {
  return text.replace(IBAN_CANDIDATE, (match) =>
    withoutSpaces(match).length >= IBAN_MIN_LENGTH ? REDACTED : match,
  );
}

function redactIbans(text: string): string {
  return text.split(NON_IBAN_WORD).map(redactIbanCandidates).join("");
}

function redactCardNumbers(text: string): string {
  return text.replace(CARD_CANDIDATE, (match) => {
    const length = match.replace(/[ -]/g, "").length;
    return length >= CARD_MIN_LENGTH && /\d/.test(match) ? REDACTED : match;
  });
}

/** Cleans text a bank wrote: removes account and card numbers, tidies spacing. */
export function redactText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return redactCardNumbers(redactIbans(collapsed));
}

/**
 * Cleans a reference value. A value that is itself an account or card number
 * is dropped, because a field holding only a placeholder says nothing.
 */
export function redactIdentifier(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  if (SEPA_CREDITOR_ID.test(id)) return id;
  const cleaned = redactText(id);
  return cleaned === "" || cleaned.includes(REDACTED) ? undefined : cleaned;
}

function redactOptional(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return redactText(text) || undefined;
}

function withoutUnset<T extends object>(value: T): T {
  const entries = Object.entries(value);
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as T;
}

/** Cleans every text field a row keeps, and removes the fields left empty. */
export function redactRow(row: StatementRow): StatementRow {
  return withoutUnset({
    ...row,
    description: redactText(row.description),
    purpose: redactOptional(row.purpose),
    bankType: redactOptional(row.bankType),
    bankCategory: redactOptional(row.bankCategory),
    ppdId: redactIdentifier(row.ppdId),
    orderingPartyId: redactIdentifier(row.orderingPartyId),
    transferNumber: redactIdentifier(row.transferNumber),
  });
}
