import { describe, expect, it } from "vitest";
import {
  accounts,
  chaseBankFileName,
  loadFixture,
  passThroughHash,
} from "../__fixtures__/load";
import { StatementError } from "../errors";
import { parseStatement } from "../parseStatement";

const header =
  "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #";

function parse(text: string) {
  return parseStatement({
    fileName: chaseBankFileName,
    text,
    accounts,
    hash: passThroughHash,
  });
}

async function parseDescription(description: string, postedOn = "10/06/2026") {
  const row = `DEBIT,${postedOn},"${description}",-1.00,DEBIT_CARD,100.00,,`;
  const { transactions } = await parse(`${header}\n${row}\n`);
  return transactions[0];
}

describe("chase-bank statements", () => {
  it("reads every row in file order", async () => {
    const statement = await parse(loadFixture("chaseBank.csv"));

    expect(statement.accountId).toBe("bank-1");
    expect(statement.format).toBe("chase-bank");
    expect(statement.ignoredPendingCount).toBe(0);
    expect(statement.transactions.map((t) => t.postedOn)).toEqual([
      "2026-10-12",
      "2026-10-11",
      "2026-10-10",
      "2026-10-09",
      "2026-10-08",
      "2026-10-07",
      "2026-10-06",
      "2026-10-06",
      "2026-10-02",
      "2026-10-01",
    ]);
  });

  it("keeps amount, type and balance as minor units", async () => {
    const { transactions } = await parse(loadFixture("chaseBank.csv"));
    expect(transactions[8]).toMatchObject({
      amount: { minor: -350, currency: "USD" },
      bankType: "DEBIT_CARD",
      balance: { minor: 349650, currency: "USD" },
    });
  });

  it("has balances that reconcile from row to row", async () => {
    const { transactions } = await parse(loadFixture("chaseBank.csv"));
    for (let i = 0; i + 1 < transactions.length; i += 1) {
      const { balance, amount } = transactions[i];
      expect(balance!.minor - amount.minor).toBe(
        transactions[i + 1].balance!.minor,
      );
    }
  });

  it("keeps unknown bank types as they are", async () => {
    const row = `DEBIT,10/06/2026,"SOMETHING",-1.00,NEW_TYPE,100.00,,`;
    const { transactions } = await parse(`${header}\n${row}\n`);
    expect(transactions[0].bankType).toBe("NEW_TYPE");
  });

  it("leaves a blank balance unset", async () => {
    const row = `DEBIT,10/06/2026,"SOMETHING",-1.00,DEBIT_CARD, ,,`;
    const { transactions } = await parse(`${header}\n${row}\n`);
    expect(transactions[0]).not.toHaveProperty("balance");
  });

  describe("descriptions", () => {
    it("takes the purchase date off a card row", async () => {
      const row = await parseDescription(
        "SHOP   *EXAMPLE.COM CA                10/05",
      );
      expect(row.description).toBe("SHOP *EXAMPLE.COM CA");
      expect(row.purchasedOn).toBe("2026-10-05");
    });

    it("puts a December purchase posted in January in the previous year", async () => {
      const row = await parseDescription(
        "EXAMPLE MARKET NY          12/30",
        "01/02/2026",
      );
      expect(row.purchasedOn).toBe("2025-12-30");
    });

    it("keeps the posting year for a purchase dated after it posted", async () => {
      const row = await parseDescription(
        "EXAMPLE MARKET NY          01/03",
        "01/02/2026",
      );
      expect(row.purchasedOn).toBe("2026-01-03");
    });

    it("keeps a trailing number that isn't a date as text", async () => {
      const row = await parseDescription("EXAMPLE MARKET NY 13/45");
      expect(row.description).toBe("EXAMPLE MARKET NY 13/45");
      expect(row).not.toHaveProperty("purchasedOn");
    });

    it("reads a foreign purchase", async () => {
      const row = await parseDescription(
        "SHOP   *EXAMPLE.COM                   10/05 Euro       11.90 X 1.121008 (EXCHG RTE)",
      );
      expect(row).toMatchObject({
        description: "SHOP *EXAMPLE.COM",
        purchasedOn: "2026-10-05",
        original: {
          amount: { minor: 1190, currency: "EUR" },
          rate: "1.121008",
        },
      });
    });

    it("reads a foreign purchase over a thousand", async () => {
      const row = await parseDescription(
        "SHOP 10/05 Euro       1,011.90 X 1.121008 (EXCHG RTE)",
      );
      expect(row.original?.amount.minor).toBe(101190);
    });

    it("drops the suffix but keeps going on an unknown currency name", async () => {
      const row = await parseDescription(
        "SHOP   *EXAMPLE.COM                   10/10 Galleons       4.50 X 1.111111 (EXCHG RTE)",
      );
      expect(row.description).toBe("SHOP *EXAMPLE.COM");
      expect(row.purchasedOn).toBe("2026-10-10");
      expect(row).not.toHaveProperty("original");
    });

    it("keeps the reference glued to a foreign fee's date", async () => {
      const row = await parseDescription(
        "FOREIGN EXCH RATE ADJ FEE         10/05SHOP   *T",
      );
      expect(row.description).toBe("FOREIGN EXCH RATE ADJ FEE SHOP *T");
      expect(row.purchasedOn).toBe("2026-10-05");
    });

    it("reads a foreign fee with no reference", async () => {
      const row = await parseDescription(
        "FOREIGN EXCH RATE ADJ FEE         10/05",
      );
      expect(row.description).toBe("FOREIGN EXCH RATE ADJ FEE");
      expect(row.purchasedOn).toBe("2026-10-05");
    });

    it("takes the PPD ID off an ACH row", async () => {
      const row = await parseDescription(
        "EXAMPLE PAYROLL   DIRECT DEP                    PPD ID: 1234567890",
      );
      expect(row.description).toBe("EXAMPLE PAYROLL DIRECT DEP");
      expect(row.ppdId).toBe("1234567890");
    });

    it.each([
      [
        "with a trailing date",
        "Online Transfer to  CHK ...1111 transaction#: 12345678901 10/05",
        "Online Transfer to CHK ...1111",
        "2026-10-05",
      ],
      [
        "with no trailing date",
        "Online Transfer from  SAV ...4444 transaction#: 12345678901",
        "Online Transfer from SAV ...4444",
        undefined,
      ],
      [
        "with one space",
        "Online Transfer to CHK ...1111 transaction#: 12345678901",
        "Online Transfer to CHK ...1111",
        undefined,
      ],
    ])("reads an online transfer %s", async (_label, text, description, purchasedOn) => {
      const row = await parseDescription(text);
      expect(row.description).toBe(description);
      expect(row.transferNumber).toBe("12345678901");
      expect(row.purchasedOn).toBe(purchasedOn);
    });

    it("keeps an overdraft transfer as plain text", async () => {
      const row = await parseDescription("ODP TRANSFER TO CHECKING  ...1111");
      expect(row.description).toBe("ODP TRANSFER TO CHECKING ...1111");
    });
  });

  it.each([
    ["a row with no trailing field", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,100.00,`],
    ["a row with the trailing field", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,100.00,,`],
    ["a check number", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,100.00,1234,`],
  ])("accepts %s", async (_label, row) => {
    const { transactions } = await parse(`${header}\n${row}\n`);
    expect(transactions).toHaveLength(1);
  });

  it.each([
    ["too few fields", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,100.00`, "malformed-row"],
    ["too many fields", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,100.00,,,`, "malformed-row"],
    ["text in the extra field", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,100.00,,text`, "malformed-row"],
    ["a bad date", `DEBIT,2026-10-06,"SHOP",-1.00,DEBIT_CARD,100.00,,`, "invalid-date"],
    ["a bad amount", `DEBIT,10/06/2026,"SHOP",abc,DEBIT_CARD,100.00,,`, "invalid-amount"],
    ["a bad balance", `DEBIT,10/06/2026,"SHOP",-1.00,DEBIT_CARD,abc,,`, "invalid-amount"],
  ])("fails the whole file on %s", async (_label, row, code) => {
    const error = await parse(`${header}\n${row}\n`).catch((e) => e);
    expect(error).toBeInstanceOf(StatementError);
    expect(error.code).toBe(code);
    expect(error.line).toBe(2);
    expect(error.message).not.toContain("SHOP");
  });

  it("counts a line break inside a quoted field in the line number", async () => {
    const wrapped = `DEBIT,10/06/2026,"SHOP\nMORE",-1.00,DEBIT_CARD,100.00,,`;
    const bad = `DEBIT,bad,"SHOP",-1.00,DEBIT_CARD,100.00,,`;
    const error = await parse(`${header}\n${wrapped}\n${bad}\n`).catch((e) => e);
    expect(error.line).toBe(4);
  });

  it("never passes the raw description to the hash", async () => {
    const inputs: string[] = [];
    await parseStatement({
      fileName: chaseBankFileName,
      text: loadFixture("chaseBank.csv"),
      accounts,
      hash: (input) => {
        inputs.push(input);
        return input;
      },
    });

    expect(inputs).toHaveLength(10);
    for (const input of inputs) {
      expect(input).not.toMatch(/PPD ID|transaction#|EXCHG RTE|\s{2}/);
    }
  });
});
