import { describe, expect, it } from "vitest";
import {
  accounts,
  commerzbankFileName,
  loadFixture,
  passThroughHash,
} from "../__fixtures__/load";
import { StatementError } from "../errors";
import { parseStatement } from "../parseStatement";
import type { Transaction } from "../types";

const header =
  "Booking date;Value date;Transaction type;Booking text;Amount;Currency;Account IBAN;Category;Sender;Recipient;Transfer purpose";
const iban = "DE00123456789012343333";

function parse(text: string, parseAccounts = accounts) {
  return parseStatement({
    fileName: commerzbankFileName,
    text,
    accounts: parseAccounts,
    hash: passThroughHash,
  });
}

function asExported(text: string): string {
  return `﻿${text.replace(/\n/g, "\r\n")}`;
}

async function parseOne(row: string): Promise<Transaction> {
  const { transactions } = await parse(`${header}\n${row}\n`);
  return transactions[0];
}

function fail(rows: string[]) {
  return parse([header, ...rows].join("\n")).catch((e) => e);
}

describe("commerzbank statements", () => {
  it("reads a file with a byte order mark, CRLF and semicolons", async () => {
    const statement = await parse(asExported(loadFixture("commerzbank.csv")));

    expect(statement.accountId).toBe("euro-1");
    expect(statement.format).toBe("commerzbank");
    expect(statement.transactions).toHaveLength(6);
    expect(statement.transactions[1]).toEqual({
      accountId: "euro-1",
      postedOn: "2026-10-15",
      amount: { minor: -4250, currency: "EUR" },
      description: "Example Insurance",
      purpose: "Policy 88",
      bankType: "Direct debit",
      bankCategory: "Insurance",
      orderingPartyId: "DE00ZZZ00001234567",
      fingerprint: expect.any(String),
    });
  });

  it("ignores pending rows and counts them", async () => {
    const statement = await parse(loadFixture("commerzbank.csv"));
    expect(statement.ignoredPendingCount).toBe(2);
    expect(statement.transactions.map((t) => t.description)).not.toContain(
      "Example Kiosk",
    );
  });

  it("keeps a row dated in the future", async () => {
    const { transactions } = await parse(loadFixture("commerzbank.csv"));
    expect(transactions[0].postedOn).toBe("2030-11-05");
  });

  it("reads amounts with dropped zeros and German grouping", async () => {
    const { transactions } = await parse(loadFixture("commerzbank.csv"));
    expect(transactions.map((t) => t.amount.minor)).toEqual([
      -90000, -4250, -4638, 250000, -950, -350,
    ]);
  });

  it("takes the foreign amount from the booking text and keeps the charged amount", async () => {
    const { transactions } = await parse(loadFixture("commerzbank.csv"));
    expect(transactions[2]).toMatchObject({
      amount: { minor: -4638, currency: "EUR" },
      original: {
        amount: { minor: 5075, currency: "USD" },
        rate: "1.1102",
      },
      bankCategory: "Foreign currencies & precious metals",
    });
  });

  it("reads a rate with German thousands grouping", async () => {
    const row = `12.10.2026;12.10.2026;Card;Originalbetrag: 1.000,00 USD Kurs: 1.612,34 KRW /EUR;-1,00;EUR;${iban};;;Shop;`;
    const transaction = await parseOne(row);
    expect(transaction.original).toEqual({
      amount: { minor: 100000, currency: "USD" },
      rate: "1612.34",
    });
  });

  it("leaves original unset when the booking text's amount can't be read", async () => {
    const row = `12.10.2026;12.10.2026;Card;Originalbetrag: 1.5 USD Kurs: 1,1 USD /EUR;-1,00;EUR;${iban};;;Shop;`;
    expect(await parseOne(row)).not.toHaveProperty("original");
  });

  it("reads the ordering party ID despite stray spaces", async () => {
    const row = `12.10.2026;12.10.2026;Debit;I D Of Order ing Par ty:  DE00ZZZ000 01234567;-1,00;EUR;${iban};;;Shop;`;
    expect((await parseOne(row)).orderingPartyId).toBe("DE00ZZZ00001234567");
  });

  it("drops an ordering party value that isn't an ID", async () => {
    const row = `12.10.2026;12.10.2026;Debit;ID Of Ordering Party: not an / id;-1,00;EUR;${iban};;;Shop;`;
    expect(await parseOne(row)).not.toHaveProperty("orderingPartyId");
  });

  it("drops an ordering party value that is an IBAN", async () => {
    const row = `12.10.2026;12.10.2026;Debit;ID Of Ordering Party: DE00123456789012345678;-1,00;EUR;${iban};;;Shop;`;
    expect(await parseOne(row)).not.toHaveProperty("orderingPartyId");
  });

  describe("descriptions", () => {
    const row = (
      amount: string,
      sender: string,
      recipient: string,
      purpose: string,
    ) =>
      `12.10.2026;12.10.2026;Transfer;Booking;${amount};EUR;${iban};Other;${sender};${recipient};${purpose}`;

    it.each([
      ["the recipient for money out", row("-1,00", "Me", "Shop", "For"), "Shop"],
      ["the sender for money in", row("1,00", "Payer", "Me", "For"), "Payer"],
      ["the sender for money out with no recipient", row("-1,00", "Me", "", "For"), "Me"],
      ["the recipient for money in with no sender", row("1,00", "", "Me", "For"), "Me"],
      ["the purpose when both are empty", row("1,00", "", "", "For"), "For"],
      ["the type when everything is empty", row("1,00", "", "", ""), "Transfer"],
      ["the sender for a zero amount", row("0,00", "Payer", "Me", ""), "Payer"],
      ["the next choice when a name is only spaces", row("-1,00", "Me", "   ", ""), "Me"],
    ])("uses %s", async (_label, text, description) => {
      expect((await parseOne(text)).description).toBe(description);
    });
  });

  it("redacts the kept purpose", async () => {
    const row = `12.10.2026;12.10.2026;Transfer;Booking;-1,00;EUR;${iban};Other;;Shop;Refund to DE00123456789012345678`;
    expect((await parseOne(row)).purpose).toBe("Refund to [REDACTED]");
  });

  it("keeps booking text out of the output and the hash", async () => {
    const inputs: string[] = [];
    const { transactions } = await parseStatement({
      fileName: commerzbankFileName,
      text: loadFixture("commerzbank.csv"),
      accounts,
      hash: (input) => {
        inputs.push(input);
        return input;
      },
    });

    const output = JSON.stringify([transactions, inputs]);
    expect(output).not.toMatch(
      /End-To-End|Customer Reference|Mandate Reference|Originalbetrag|Entgelt|Text part one|Ordering Party/,
    );
    expect(output).not.toContain(iban);
  });

  describe("an unquoted semicolon", () => {
    it("rejoins booking text split by one", async () => {
      const row = `01.02.2026;01.02.2026;Type;Text part one;;9,5;EUR;${iban};Other;Name;;`;
      expect(await parseOne(row)).toMatchObject({
        amount: { minor: 950 },
        description: "Name",
        bankCategory: "Other",
      });
    });

    it("reads an ID that sits after the split", async () => {
      const row = `01.02.2026;01.02.2026;Type;Part one;ID Of Ordering Party: DE00ZZZ00001234567;9,5;EUR;${iban};Other;Name;;`;
      expect((await parseOne(row)).orderingPartyId).toBe("DE00ZZZ00001234567");
    });

    it("isn't fooled by a number before the real amount", async () => {
      const row = `01.02.2026;01.02.2026;Type;Text;5;EUR;more text;9,5;EUR;${iban};Other;Name;;`;
      expect((await parseOne(row)).amount.minor).toBe(950);
    });

    it("keeps a pending row countable", async () => {
      const row = `;;Type;Text part one;;-9,5;EUR;${iban};Other;;Name;`;
      const statement = await parse(`${header}\n${row}\n`);
      expect(statement.ignoredPendingCount).toBe(1);
    });

    it("fails when the extra semicolon is in the transfer purpose", async () => {
      const row = `01.02.2026;01.02.2026;Type;Text;9,5;EUR;${iban};Other;Name;;Purpose;more`;
      const error = await fail([row]);
      expect(error.code).toBe("malformed-row");
      expect(error.line).toBe(2);
    });
  });

  it.each([
    ["too few fields", `01.02.2026;01.02.2026;Type;Text;9,5;EUR;${iban};Other;Name;`, "malformed-row"],
    ["no amount anchor", `01.02.2026;01.02.2026;Type;Text;abc;EUR;${iban};Other;Name;;`, "malformed-row"],
    ["no currency anchor", `01.02.2026;01.02.2026;Type;Text;9,5;euro;${iban};Other;Name;;`, "malformed-row"],
    ["no IBAN anchor", `01.02.2026;01.02.2026;Type;Text;9,5;EUR;NOPE;Other;Name;;`, "malformed-row"],
    ["a bad booking date", `2026-02-01;01.02.2026;Type;Text;9,5;EUR;${iban};Other;Name;;`, "invalid-date"],
    ["a blank booking date on a row with a value date", `;01.02.2026;Type;Text;9,5;EUR;${iban};Other;Name;;`, "invalid-date"],
    ["too many decimals", `01.02.2026;01.02.2026;Type;Text;9,555;EUR;${iban};Other;Name;;`, "invalid-amount"],
    ["another currency", `01.02.2026;01.02.2026;Type;Text;9,5;USD;${iban};Other;Name;;`, "currency-mismatch"],
  ])("fails the whole file on %s", async (_label, row, code) => {
    const good = `01.02.2026;01.02.2026;Type;Text;1,00;EUR;${iban};Other;Good;;`;
    const error = await fail([good, "", row]);
    expect(error).toBeInstanceOf(StatementError);
    expect(error.code).toBe(code);
    expect(error.line).toBe(4);
    expect(error.message).toContain("Line 4");
    expect(error.message).not.toMatch(/Text|Name|DE00/);
  });

  describe("finding the account", () => {
    const booked = (accountIban: string) =>
      `01.02.2026;01.02.2026;Type;Text;9,5;EUR;${accountIban};Other;Name;;`;
    const pending = (accountIban: string) =>
      `;;Type;Text;9,5;EUR;${accountIban};Other;Name;;`;

    it("reads a spaced IBAN", async () => {
      const statement = await parse(
        `${header}\n${booked("DE00 1234 5678 9012 3433 33")}\n`,
      );
      expect(statement.accountId).toBe("euro-1");
    });

    it("fails on rows from two accounts", async () => {
      const error = await fail([booked(iban), booked("DE00123456789012344444")]);
      expect(error.code).toBe("mixed-accounts");
      expect(error.message).toMatch(/Export each account/);
    });

    it("fails when only a pending row is from another account", async () => {
      const error = await fail([booked(iban), pending("DE00123456789012344444")]);
      expect(error.code).toBe("mixed-accounts");
    });

    it("fails on two IBANs that end the same", async () => {
      const error = await fail([booked(iban), booked("DE00999999999999993333")]);
      expect(error.code).toBe("mixed-accounts");
    });

    it("fails with no rows to read an IBAN from", async () => {
      const error = await parse(`${header}\n`).catch((e) => e);
      expect(error.code).toBe("unknown-account");
    });

    it("fails on an account nobody registered", async () => {
      const error = await fail([booked("DE00123456789012349999")]);
      expect(error.code).toBe("unknown-account");
    });

    it("fails when the account is set up for another format", async () => {
      const error = await fail([booked("DE00123456789012342222")]);
      expect(error.code).toBe("account-format-mismatch");
    });
  });
});
