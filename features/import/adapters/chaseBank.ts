import { checkBalances } from "../balances";
import { inferPurchaseDate } from "../dates";
import { StatementError } from "../errors";
import type {
  OriginalAmount,
  StatementAdapter,
  StatementRow,
} from "../types";
import { chaseLastFour, readCsvRows } from "./chaseCsv";
import { readAmount, readOptionalAmount, readUsDate } from "./fields";

const HEADER =
  "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #";

// Data rows carry one empty field more than the header has columns.
const MIN_FIELD_COUNT = 7;
const MAX_FIELD_COUNT = 8;

// Only Euro has been seen in a real file. The other names are a best guess at
// Chase's wording, and a wrong guess only leaves original unset on that row.
const CURRENCY_BY_NAME: Record<string, string> = {
  euro: "EUR",
  "british pound": "GBP",
  "pound sterling": "GBP",
  "swiss franc": "CHF",
  "japanese yen": "JPY",
  "south korean won": "KRW",
  "canadian dollar": "CAD",
  "australian dollar": "AUD",
  "mexican peso": "MXN",
  "danish krone": "DKK",
  "swedish krona": "SEK",
  "norwegian krone": "NOK",
};

// The merchant text is greedy because it can hold its own NN/NN, as in
// STATION 24/24. The purchase date is the one right before the currency name.
const FOREIGN_PURCHASE =
  /^(.*)\s+(\d{2}\/\d{2})\s+(\S.*?)\s+([\d,]+(?:\.\d+)?)\s+X\s+(\d+\.\d+)\s+\(EXCHG RTE\)\s*$/;
const FOREIGN_FEE = /^(FOREIGN EXCH RATE ADJ FEE)\s+(\d{2}\/\d{2})\s*(.*)$/;
const ONLINE_TRANSFER =
  /^(.*?)\s+transaction#:\s*(\d+)(?:\s+(\d{2}\/\d{2}))?\s*$/i;
const ACH = /^(.*?)\s*PPD ID:\s*(\S+)\s*$/;
const TRAILING_DATE = /^(.*\S)\s+(\d{2}\/\d{2})\s*$/;

type DescriptionParts = Pick<
  StatementRow,
  "description" | "purchasedOn" | "original" | "ppdId" | "transferNumber"
>;

function readOriginal(
  currencyName: string,
  amount: string,
  rate: string,
): OriginalAmount | undefined {
  const currency = CURRENCY_BY_NAME[currencyName.trim().toLowerCase()];
  if (currency === undefined) return undefined;
  const money = readOptionalAmount(amount, currency, "us");
  return money && { amount: money, rate };
}

function splitDescription(text: string, postedOn: string): DescriptionParts {
  const foreign = FOREIGN_PURCHASE.exec(text);
  if (foreign) {
    const [, description, monthDay, currencyName, amount, rate] = foreign;
    return {
      description,
      purchasedOn: inferPurchaseDate(monthDay, postedOn),
      original: readOriginal(currencyName, amount, rate),
    };
  }

  const fee = FOREIGN_FEE.exec(text);
  if (fee) {
    const [, label, monthDay, reference] = fee;
    return {
      description: `${label} ${reference}`,
      purchasedOn: inferPurchaseDate(monthDay, postedOn),
    };
  }

  const transfer = ONLINE_TRANSFER.exec(text);
  if (transfer) {
    const [, description, transferNumber, monthDay] = transfer;
    return {
      description,
      transferNumber,
      purchasedOn: monthDay ? inferPurchaseDate(monthDay, postedOn) : undefined,
    };
  }

  const ach = ACH.exec(text);
  if (ach) {
    const [, description, ppdId] = ach;
    return { description, ppdId };
  }

  const dated = TRAILING_DATE.exec(text);
  const purchasedOn = dated ? inferPurchaseDate(dated[2], postedOn) : undefined;
  if (dated && purchasedOn) return { description: dated[1], purchasedOn };

  return { description: text };
}

export const chaseBank: StatementAdapter = {
  id: "chase-bank",
  detect: (headerRow) => headerRow === HEADER,
  lastFour: chaseLastFour,
  parse(text, account) {
    const { currency } = account;
    const csvRows = readCsvRows(text);

    const rows = csvRows.map(({ line, fields }): StatementRow => {
      const extra = fields[MIN_FIELD_COUNT] ?? "";
      if (
        fields.length < MIN_FIELD_COUNT ||
        fields.length > MAX_FIELD_COUNT ||
        extra.trim() !== ""
      ) {
        throw new StatementError("malformed-row", line);
      }
      const [, postingDate, rawDescription, amount, type, balance] = fields;

      const postedOn = readUsDate(postingDate, line);

      return {
        ...splitDescription(rawDescription, postedOn),
        postedOn,
        amount: readAmount(amount, currency, "us", line),
        bankType: type,
        balance:
          balance.trim() === ""
            ? undefined
            : readAmount(balance, currency, "us", line),
      };
    });

    checkBalances(
      rows.map((row, index) => ({ ...row, line: csvRows[index].line })),
    );

    return { rows, ignoredPendingCount: 0 };
  },
};
