import { StatementError } from "../errors";
import type { StatementAdapter, StatementRow } from "../types";
import { chaseLastFour, readCsvRows } from "./chaseCsv";
import { readAmount, readUsDate } from "./fields";

const HEADER = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
const FIELD_COUNT = 7;

export const chaseCard: StatementAdapter = {
  id: "chase-card",
  detect: (headerRow) => headerRow === HEADER,
  lastFour: chaseLastFour,
  parse(text, account) {
    const rows = readCsvRows(text).map(({ line, fields }): StatementRow => {
      if (fields.length !== FIELD_COUNT) {
        throw new StatementError("malformed-row", line);
      }
      const [transactionDate, postDate, description, category, type, amount, memo] =
        fields;

      return {
        postedOn: readUsDate(postDate, line),
        purchasedOn: readUsDate(transactionDate, line),
        amount: readAmount(amount, account.currency, "us", line),
        description,
        purpose: memo,
        bankType: type,
        bankCategory: category,
      };
    });

    return { rows, ignoredPendingCount: 0 };
  },
};
