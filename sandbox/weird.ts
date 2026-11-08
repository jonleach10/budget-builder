import {
  type BankRow,
  type CardRow,
  chaseBankFile,
  chaseCardFile,
  commerzbankFile,
  type GermanRow,
  type SandboxFile,
} from "./generate.ts";

/**
 * Statements for the odd cases real banks and real use produce, written in the
 * banks' formats so they go through the real import on purpose. They're extra
 * files for the sandbox's accounts, never part of the normal seed, and every
 * name, number and text in them is made up. The same day gives the same files.
 */

export const WEIRD_STATEMENTS = [
  "leap-day",
  "rows-today",
  "long-transfer-number",
  "zero-rate",
  "semicolon-purpose",
  "decomposed-unicode",
  "empty-month",
] as const;

export type WeirdStatement = (typeof WEIRD_STATEMENTS)[number];

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function addDays(date: string, days: number): string {
  const moved = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return moved.toISOString().slice(0, 10);
}

/** Never after today, so no row dated here waits for a later import. */
function firstOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The newest 29 February whose next day, when a card row posts, isn't after today. */
function lastLeapDay(today: string): string {
  let year = yearOf(today);
  while (!isLeapYear(year) || `${year}-03-01` > today) year -= 1;
  return `${year}-02-29`;
}

function fileName(lastFour: string, name: WeirdStatement): string {
  return lastFour === "3333"
    ? `DE3333_EUR_${name}.csv`
    : `Chase${lastFour}_Activity_${name}.csv`;
}

function checkingFile(name: WeirdStatement, rows: BankRow[]): SandboxFile {
  return { name: fileName("1111", name), text: chaseBankFile(rows) };
}

function savingsFile(name: WeirdStatement, rows: BankRow[]): SandboxFile {
  return { name: fileName("4444", name), text: chaseBankFile(rows) };
}

function cardFile(name: WeirdStatement, rows: CardRow[]): SandboxFile {
  return { name: fileName("2222", name), text: chaseCardFile(rows) };
}

function germanFile(name: WeirdStatement, rows: GermanRow[]): SandboxFile {
  return { name: fileName("3333", name), text: commerzbankFile(rows) };
}

function cardSale(
  date: string,
  postDate: string,
  description: string,
  minor: number,
): CardRow {
  return {
    date,
    postDate,
    description,
    category: "Shopping",
    type: "Sale",
    minor,
    memo: "",
  };
}

function germanDebit(date: string, recipient: string, minor: number): GermanRow {
  return {
    date,
    type: "Debit",
    bookingText: recipient,
    minor,
    category: "Shopping",
    sender: "",
    recipient,
    purpose: "",
  };
}

function rowsToday(today: string): SandboxFile[] {
  return [
    checkingFile("rows-today", [
      { date: today, description: "SAMPLE TODAY DELI", minor: -1475, type: "DEBIT_CARD" },
    ]),
    savingsFile("rows-today", [
      { date: today, description: "SAMPLE TODAY DEPOSIT", minor: 5000, type: "MISC_CREDIT" },
    ]),
    cardFile("rows-today", [
      cardSale(addDays(today, -1), today, "SAMPLE TODAY HARDWARE", -3325),
      cardSale(today, today, "SAMPLE TODAY COFFEE", -575),
    ]),
    germanFile("rows-today", [germanDebit(today, "Muster Heute Kiosk", -380)]),
  ];
}

/**
 * Chase's transfer numbers have grown longer over the years. Twelve digits is
 * where card-number redaction starts, so these sit at it and past it.
 */
function longTransferNumber(today: string): SandboxFile[] {
  const date = firstOfMonth(today);
  const stamp = date.replaceAll("-", "");
  const moves = [
    { number: `${stamp}0007`, minor: 31_200 },
    { number: `${stamp}000042`, minor: 47_500 },
  ];
  const monthDay = `${date.slice(5, 7)}/${date.slice(8, 10)}`;

  return [
    checkingFile(
      "long-transfer-number",
      moves.map(({ number, minor }) => ({
        date,
        description: `Online Transfer to  SAV ...4444 transaction#: ${number} ${monthDay}`,
        minor: -minor,
        type: "ACCT_XFER",
      })),
    ),
    savingsFile(
      "long-transfer-number",
      moves.map(({ number, minor }) => ({
        date,
        description: `Online Transfer from  CHK ...1111 transaction#: ${number}`,
        minor,
        type: "ACCT_XFER",
      })),
    ),
  ];
}

/**
 * The bank doesn't quote its fields, so a semicolon someone typed into a
 * transfer's purpose becomes one column too many. The import only rescues one
 * in the booking text, before the IBAN.
 */
function semicolonPurpose(today: string): SandboxFile[] {
  return [
    germanFile("semicolon-purpose", [
      {
        date: firstOfMonth(today),
        type: "Transfer",
        bookingText: "Rechnung End-To-End Reference: NOTPROVIDED",
        minor: -6400,
        category: "Other",
        sender: "",
        recipient: "Muster Handwerker",
        purpose: "Rechnung 2611; Danke",
      },
    ]),
  ];
}

/**
 * Accents written as a letter plus a combining mark, as some systems export
 * them. They look the same as the composed letters but aren't the same text,
 * and Beispiel Bäckerei is also in the normal seed, composed.
 */
function decomposedUnicode(today: string): SandboxFile[] {
  const date = firstOfMonth(today);
  const decomposed = (text: string) => text.normalize("NFD");

  return [
    cardFile("decomposed-unicode", [
      cardSale(date, date, decomposed("SAMPLE CAFÉ ÉTOILE"), -1460),
    ]),
    germanFile("decomposed-unicode", [
      germanDebit(date, decomposed("Beispiel Bäckerei"), -845),
      germanDebit(date, decomposed("Muster Süßwaren"), -1230),
    ]),
  ];
}

/**
 * What a bank exports for a month with no activity: the header alone. The
 * normal seed already leaves its second month empty inside its statements.
 */
function emptyMonth(): SandboxFile[] {
  return [
    checkingFile("empty-month", []),
    savingsFile("empty-month", []),
    cardFile("empty-month", []),
    germanFile("empty-month", []),
  ];
}

/** Foreign purchases with a real amount charged, where the bank printed a rate of 0. */
function zeroRate(today: string): SandboxFile[] {
  const date = firstOfMonth(today);
  const [year, month, day] = date.split("-");

  return [
    checkingFile("zero-rate", [
      {
        date,
        description: `SHOP   *SAMPLE.ZERO                 ${month}/${day} Euro       11.90 X 0.000000 (EXCHG RTE)`,
        minor: -1334,
        type: "DEBIT_CARD",
      },
    ]),
    germanFile("zero-rate", [
      {
        ...germanDebit(date, "Sample Zero Shop", -4638),
        bookingText: `${day}.${month}.${year} 14:30 Originalbetrag: 50,75 USD Kurs: 0,0000 USD               /EUR`,
        category: "Foreign currencies & precious metals",
      },
    ]),
  ];
}

function leapDay(today: string): SandboxFile[] {
  const leap = lastLeapDay(today);
  const year = yearOf(leap);
  const before = `${year}-02-28`;
  const after = `${year}-03-01`;

  return [
    checkingFile("leap-day", [
      {
        date: leap,
        description: "SAMPLE LEAP DAY BAKERY",
        minor: -2900,
        type: "DEBIT_CARD",
      },
    ]),
    cardFile("leap-day", [
      cardSale(before, leap, "SAMPLE LEAP DAY CINEMA", -2400),
      cardSale(leap, after, "SAMPLE LEAP DAY BOOKS", -1850),
    ]),
    germanFile("leap-day", [germanDebit(leap, "Muster Schalttag Markt", -1290)]),
  ];
}

const BUILDERS: Record<WeirdStatement, (today: string) => SandboxFile[]> = {
  "leap-day": leapDay,
  "rows-today": rowsToday,
  "long-transfer-number": longTransferNumber,
  "zero-rate": zeroRate,
  "semicolon-purpose": semicolonPurpose,
  "decomposed-unicode": decomposedUnicode,
  "empty-month": emptyMonth,
};

export function weirdStatements(
  today: string,
  names: readonly WeirdStatement[],
): SandboxFile[] {
  return names.flatMap((name) => BUILDERS[name](today));
}
