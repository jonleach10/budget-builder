import type { StatementFormat } from "@/features/import/types";

/**
 * Made-up statements in the banks' real file formats, so they reach the app
 * through the real import. Everything here is invented, and nothing reads a real
 * statement. The same day always gives the same files.
 */

export type SandboxAccount = {
  name: string;
  lastFour: string;
  format: StatementFormat;
  currency: string;
  country: "US" | "DE";
  isSavings: boolean;
};

export type SandboxFile = { name: string; text: string };

export const SANDBOX_ACCOUNTS: readonly SandboxAccount[] = [
  account("Sandbox Checking", "1111", "chase-bank", false),
  account("Sandbox Savings", "4444", "chase-bank", true),
  account("Sandbox Card", "2222", "chase-card", false),
  {
    name: "Sandbox Girokonto",
    lastFour: "3333",
    format: "commerzbank",
    currency: "EUR",
    country: "DE",
    isSavings: false,
  },
];

function account(
  name: string,
  lastFour: string,
  format: StatementFormat,
  isSavings: boolean,
): SandboxAccount {
  return { name, lastFour, format, currency: "USD", country: "US", isSavings };
}

/**
 * How much data to make. "default" is the sandbox's normal seed. The others are
 * for speed runs: about the owner's real row count, then 5 and 15 times it.
 */
export type DataSize = "default" | "small" | "medium" | "large";

export type GenerateOptions = { size?: DataSize };

/** How many months a size covers, and the random rows in each full month. */
type SizeProfile = {
  monthCount: number;
  cardRows: number;
  debitRows: number;
  germanRows: number;
};

/**
 * The bigger sizes add months, as years of statements would, and keep each
 * month's mix of rows. A full month holds about 126 rows.
 */
const SIZES: Record<DataSize, SizeProfile> = {
  // Three fewer card rows than before the PARCELPOINT rows, so the total stays near 400.
  default: { monthCount: 5, cardRows: 43, debitRows: 20, germanRows: 34 },
  small: { monthCount: 14, cardRows: 43, debitRows: 20, germanRows: 34 },
  medium: { monthCount: 65, cardRows: 43, debitRows: 20, germanRows: 34 },
  large: { monthCount: 192, cardRows: 43, debitRows: 20, germanRows: 34 },
};

const EMPTY_MONTH_INDEX = 1;
const LAST_ROW_DAY = 27;
const OPENING_BALANCE = 500_000;

// Check digits of 00 are never valid, so neither of these can be a real account.
const IBAN = "DE00123456789012343333";
const MADE_UP_IBAN = "DE00123456789012345678";

const LONG_NAME =
  "SAMPLE EXTREMELY LONG MERCHANT NAME THAT KEEPS GOING SO THE TABLE HAS TO WRAP IT ACROSS SEVERAL LINES LLC";

const SAVINGS_TRANSFER = 25_000;
/** The same on both sides with no transfer number, so it needs a person's call. */
const NEAR_MATCH = 75_000;
/** Paid on the card once, with two checking rows that could each be the other side. */
const SECOND_CARD_PAYMENT = 64_000;

const CHASE_BANK_HEADER =
  "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #";
const CHASE_CARD_HEADER =
  "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
const COMMERZBANK_HEADER =
  "Booking date;Value date;Transaction type;Booking text;Amount;Currency;Account IBAN;Category;Sender;Recipient;Transfer purpose";

type Merchant = { name: string; category: string; typical: number };

const CARD_MERCHANTS: readonly Merchant[] = [
  { name: "SAMPLE GROCER #1042", category: "Groceries", typical: 6400 },
  { name: "SAMPLE MARKET #2210", category: "Groceries", typical: 3200 },
  { name: "SAMPLE COFFEE 118", category: "Food & Drink", typical: 650 },
  { name: "SAMPLE TAQUERIA", category: "Food & Drink", typical: 2400 },
  { name: "SAMPLE FUEL 0098", category: "Gas", typical: 4100 },
  { name: "SAMPLE PHARMACY", category: "Health & Wellness", typical: 1800 },
  { name: "SAMPLE BOOKS", category: "Shopping", typical: 2600 },
  { name: "SAMPLE HARDWARE", category: "Home", typical: 3900 },
];

const DEBIT_MERCHANTS: readonly string[] = [
  "SAMPLE DELI",
  "SAMPLE LAUNDRY",
  "SAMPLE TRANSIT",
  "SAMPLE PARKING",
];

const GERMAN_MERCHANTS: readonly string[] = [
  "Muster Markt",
  "Beispiel Bäckerei",
  "Muster Drogerie",
  "Beispiel Apotheke",
  "Muster Tankstelle",
];

type Month = { year: number; number: number };

export type BankRow = {
  date: string;
  description: string;
  minor: number;
  type: string;
};

export type CardRow = {
  date: string;
  postDate: string;
  description: string;
  category: string;
  type: string;
  minor: number;
  memo: string;
};

export type GermanRow = {
  date: string;
  type: string;
  bookingText: string;
  minor: number;
  category: string;
  sender: string;
  recipient: string;
  purpose: string;
};

function profileFor({ size = "default" }: GenerateOptions): SizeProfile {
  return SIZES[size];
}

/** Each month the sandbox covers, as YYYY-MM, including the empty one. */
export function sandboxMonths(
  today: string,
  options: GenerateOptions = {},
): string[] {
  return monthsUpTo(today, profileFor(options).monthCount).map(
    ({ year, number }) => `${year}-${pad(number)}`,
  );
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function isoDate({ year, number }: Month, day: number): string {
  return `${year}-${pad(number)}-${pad(day)}`;
}

function usDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

function germanDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function decimal(minor: number, separator: string): string {
  const whole = Math.trunc(Math.abs(minor) / 100);
  const sign = minor < 0 ? "-" : "";
  return `${sign}${whole}${separator}${pad(Math.abs(minor) % 100)}`;
}

/** The months up to today's, oldest first. */
function monthsUpTo(today: string, monthCount: number): Month[] {
  const [year, month] = today.split("-").map(Number);

  return Array.from({ length: monthCount }, (_, index) => {
    const start = new Date(
      Date.UTC(year, month - monthCount + index, 1),
    );
    return { year: start.getUTCFullYear(), number: start.getUTCMonth() + 1 };
  });
}

/** Seeded by the month, so a month's rows don't change as the days go by. */
function randomFor({ year, number }: Month): () => number {
  let state = year * 100 + number;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function dayFrom(random: () => number): number {
  return 1 + Math.floor(random() * LAST_ROW_DAY);
}

function around(typical: number, random: () => number): number {
  return Math.round(typical * (0.6 + random() * 0.8));
}

function transferNumber({ year, number }: Month): string {
  return `${year}${pad(number)}00001`;
}

/** Different each month, so a payment can only match its own month's. */
function cardPayment({ number }: Month): number {
  return 120_000 + number * 100;
}

function checkingRows(month: Month, profile: SizeProfile): BankRow[] {
  const random = randomFor(month);
  const rows: BankRow[] = [
    {
      date: isoDate(month, 1),
      description:
        "SAMPLE PAYROLL   DIRECT DEP                    PPD ID: 1234567891",
      minor: 410_000,
      type: "ACH_CREDIT",
    },
    {
      date: isoDate(month, 3),
      description:
        "SAMPLE LANDLORD   WEB PMTS                    PPD ID: 1234567892",
      minor: -185_000,
      type: "ACH_DEBIT",
    },
    {
      date: isoDate(month, 5),
      description: `Online Transfer to  SAV ...4444 transaction#: ${transferNumber(month)} ${pad(month.number)}/05`,
      minor: -SAVINGS_TRANSFER,
      type: "ACCT_XFER",
    },
    {
      date: isoDate(month, 8),
      description:
        "SAMPLE CARD AUTOPAY   WEB PMTS                 PPD ID: 1234567893",
      minor: -cardPayment(month),
      type: "ACH_DEBIT",
    },
    {
      date: isoDate(month, 12),
      description: `SHOP   *SAMPLE.EU                   ${pad(month.number)}/11 Euro       11.90 X 1.121008 (EXCHG RTE)`,
      minor: -1334,
      type: "DEBIT_CARD",
    },
    {
      date: isoDate(month, 12),
      description: `FOREIGN EXCH RATE ADJ FEE         ${pad(month.number)}/11SHOP   *T`,
      minor: -40,
      type: "FEE_TRANSACTION",
    },
    {
      date: isoDate(month, 20),
      description: "SAMPLE WIRE OUT",
      minor: -NEAR_MATCH,
      type: "MISC_DEBIT",
    },
    // Two rows that could each be the second card payment's other side.
    {
      date: isoDate(month, 21),
      description: "SAMPLE CARD PAYMENT",
      minor: -SECOND_CARD_PAYMENT,
      type: "ACH_DEBIT",
    },
    {
      date: isoDate(month, 24),
      description: "SAMPLE TUITION",
      minor: -SECOND_CARD_PAYMENT,
      type: "ACH_DEBIT",
    },
  ];

  for (let index = 0; index < profile.debitRows; index += 1) {
    rows.push({
      date: isoDate(month, dayFrom(random)),
      description: pick(DEBIT_MERCHANTS, random),
      minor: -around(1500, random),
      type: "DEBIT_CARD",
    });
  }
  return rows;
}

function savingsRows(month: Month): BankRow[] {
  return [
    {
      date: isoDate(month, 5),
      description: `Online Transfer from  CHK ...1111 transaction#: ${transferNumber(month)}`,
      minor: SAVINGS_TRANSFER,
      type: "ACCT_XFER",
    },
    {
      date: isoDate(month, 21),
      description: "SAMPLE DEPOSIT",
      minor: NEAR_MATCH,
      type: "MISC_CREDIT",
    },
    {
      date: isoDate(month, LAST_ROW_DAY),
      description: "INTEREST PAYMENT",
      minor: 312,
      type: "MISC_CREDIT",
    },
  ];
}

function cardRowOn(
  month: Month,
  day: number,
  row: Omit<CardRow, "date" | "postDate">,
): CardRow {
  return { date: isoDate(month, day), postDate: isoDate(month, day + 1), ...row };
}

/**
 * Card text with a code that changes with each purchase, so every row is its
 * own merchant group until a rule with shorter text sorts them.
 */
function parcelRows(month: Month): CardRow[] {
  return ["7L", "2M", "9R"].map((suffix, index) =>
    cardRowOn(month, 9 + index * 6, {
      description: `PARCELPOINT MKTPL*Q${pad(month.number)}${suffix}`,
      category: "Shopping",
      type: "Sale",
      minor: -(1275 + index * 1450),
      memo: "",
    }),
  );
}

function cardEvents(month: Month): CardRow[] {
  const streaming = cardRowOn(month, 16, {
    description: "SAMPLE STREAM A1B2C3",
    category: "Entertainment",
    type: "Sale",
    minor: -1199,
    memo: "Family plan",
  });

  return [
    // A grocery row every month, because the seed labels last month's.
    cardRowOn(month, 3, {
      description: "SAMPLE GROCER #1042",
      category: "Groceries",
      type: "Sale",
      minor: -5875,
      memo: "",
    }),
    cardRowOn(month, 8, {
      description: "Payment Thank You-Mobile",
      category: "",
      type: "Payment",
      minor: cardPayment(month),
      memo: "",
    }),
    cardRowOn(month, 22, {
      description: "Payment Thank You-Web",
      category: "",
      type: "Payment",
      minor: SECOND_CARD_PAYMENT,
      memo: "",
    }),
    cardRowOn(month, 14, {
      description: "SAMPLE BOOKS",
      category: "Shopping",
      type: "Return",
      minor: 1250,
      memo: "",
    }),
    streaming,
    streaming,
    ...parcelRows(month),
    cardRowOn(month, 18, {
      description: LONG_NAME,
      category: "Shopping",
      type: "Sale",
      minor: -8900,
      memo: "",
    }),
  ];
}

function cardRows(month: Month, profile: SizeProfile): CardRow[] {
  const random = randomFor(month);

  const purchases = Array.from({ length: profile.cardRows }, () => {
    const merchant = pick(CARD_MERCHANTS, random);
    return cardRowOn(month, dayFrom(random), {
      description: merchant.name,
      category: merchant.category,
      type: "Sale",
      minor: -around(merchant.typical, random),
      memo: "",
    });
  });
  return [...purchases, ...cardEvents(month)];
}

function germanRowOn(
  month: Month,
  day: number,
  row: Omit<GermanRow, "date">,
): GermanRow {
  return { date: isoDate(month, day), ...row };
}

function germanEvents(month: Month): GermanRow[] {
  const shared = { sender: "", purpose: "" };

  return [
    germanRowOn(month, 2, {
      ...shared,
      type: "Transfer",
      bookingText: "Miete End-To-End Reference: NOTPROVIDED",
      minor: -95_000,
      category: "Housing",
      recipient: "Beispiel Hausverwaltung",
      purpose: "Miete",
    }),
    germanRowOn(month, 4, {
      ...shared,
      type: "Debit",
      bookingText:
        "MUSTER VERSICHERUNG Mandate Reference: M-123 ID Of Orde ring Party: DE00ZZZ000 01234567 End-To-End Reference: X-1",
      minor: -4250,
      category: "Insurance",
      recipient: "Muster Versicherung",
    }),
    germanRowOn(month, 6, {
      ...shared,
      type: "Debit",
      bookingText: `${germanDate(isoDate(month, 6))} 14:30 Originalbetrag: 50,75 USD Kurs: 1,1102 USD               /EUR Entgelt Auslandseinsatz: 0,68 EUR`,
      minor: -4638,
      category: "Foreign currencies & precious metals",
      recipient: "Sample Shop",
    }),
    germanRowOn(month, 15, {
      ...shared,
      type: "Transfer",
      bookingText: "Erstattung",
      minor: -1500,
      category: "Other",
      recipient: `Erstattung ${MADE_UP_IBAN}`,
    }),
    germanRowOn(month, 17, {
      ...shared,
      type: "Transfer",
      bookingText: "Überweisung",
      minor: -2200,
      category: "Other",
      recipient: MADE_UP_IBAN,
    }),
    germanRowOn(month, 19, {
      ...shared,
      type: "",
      bookingText: "Kartenzahlung",
      minor: -700,
      category: "",
      recipient: "",
    }),
  ];
}

function germanRows(month: Month, profile: SizeProfile): GermanRow[] {
  const random = randomFor(month);
  const rows: GermanRow[] = [
    {
      date: isoDate(month, 1),
      type: "Transfer",
      bookingText: "Salary End-To-End Reference: NOTPROVIDED",
      minor: 320_000,
      category: "Income",
      sender: "Muster Arbeitgeber",
      recipient: "",
      purpose: "Salary",
    },
    ...germanEvents(month),
  ];

  for (let index = 0; index < profile.germanRows; index += 1) {
    const recipient = pick(GERMAN_MERCHANTS, random);
    rows.push({
      date: isoDate(month, dayFrom(random)),
      type: "Debit",
      bookingText: recipient,
      minor: -around(2800, random),
      category: "Shopping",
      sender: "",
      recipient,
      purpose: "",
    });
  }
  return rows;
}

function byDate<Row extends { date: string }>(a: Row, b: Row): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/** Newest first, with a balance that runs through every row like the bank's. */
export function chaseBankFile(rows: readonly BankRow[]): string {
  let balance = OPENING_BALANCE;

  const lines = [...rows].sort(byDate).map(({ date, description, minor, type }) => {
    balance += minor;
    const detail = minor < 0 ? "DEBIT" : "CREDIT";
    const amount = decimal(minor, ".");
    return `${detail},${usDate(date)},"${description}",${amount},${type},${decimal(balance, ".")},,`;
  });

  return [CHASE_BANK_HEADER, ...lines.reverse()].join("\n");
}

export function chaseCardFile(rows: readonly CardRow[]): string {
  const lines = [...rows]
    .sort(byDate)
    .reverse()
    .map(({ date, postDate, description, category, type, minor, memo }) =>
      [
        usDate(date),
        usDate(postDate),
        `"${description}"`,
        category,
        type,
        decimal(minor, "."),
        memo,
      ].join(","),
    );

  return [CHASE_CARD_HEADER, ...lines].join("\n");
}

export function commerzbankFile(rows: readonly GermanRow[]): string {
  const lines = [...rows]
    .sort(byDate)
    .reverse()
    .map((row) =>
      [
        germanDate(row.date),
        germanDate(row.date),
        row.type,
        row.bookingText,
        decimal(row.minor, ","),
        "EUR",
        IBAN,
        row.category,
        row.sender,
        row.recipient,
        row.purpose,
      ].join(";"),
    );

  return [COMMERZBANK_HEADER, ...lines].join("\n");
}

export function generateStatements(
  today: string,
  options: GenerateOptions = {},
): SandboxFile[] {
  const profile = profileFor(options);
  const months = monthsUpTo(today, profile.monthCount).filter(
    (_, index) => index !== EMPTY_MONTH_INDEX,
  );
  // A card row posts the day after its purchase, and the post date is the one stored.
  const rowsUpToToday = <Row extends { date: string; postDate?: string }>(
    rowsFor: (month: Month, profile: SizeProfile) => Row[],
  ): Row[] =>
    months
      .flatMap((month) => rowsFor(month, profile))
      .filter(({ date, postDate }) => (postDate ?? date) <= today);

  const stamp = today.replaceAll("-", "");
  return [
    {
      name: `Chase1111_Activity_${stamp}.csv`,
      text: chaseBankFile(rowsUpToToday(checkingRows)),
    },
    {
      name: `Chase4444_Activity_${stamp}.csv`,
      text: chaseBankFile(rowsUpToToday(savingsRows)),
    },
    {
      name: `Chase2222_Activity_${stamp}.csv`,
      text: chaseCardFile(rowsUpToToday(cardRows)),
    },
    {
      name: "DE3333_EUR_export.csv",
      text: commerzbankFile(rowsUpToToday(germanRows)),
    },
  ];
}
