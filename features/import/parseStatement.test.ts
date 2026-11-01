import { describe, expect, it } from "vitest";
import {
  accounts,
  chaseCardFileName,
  loadFixture,
  passThroughHash,
} from "./__fixtures__/load";
import { StatementError } from "./errors";
import { parseStatement } from "./parseStatement";
import type { Account } from "./types";

const cardText = loadFixture(chaseCardFileName);

function parseCard(fileName: string, cardAccounts: Account[] = accounts) {
  return parseStatement({
    fileName,
    text: cardText,
    accounts: cardAccounts,
    hash: passThroughHash,
  });
}

describe("reading the file", () => {
  it("handles a byte order mark and CRLF line ends", async () => {
    const text = `﻿${cardText.replace(/\n/g, "\r\n")}`;
    const statement = await parseStatement({
      fileName: chaseCardFileName,
      text,
      accounts,
      hash: passThroughHash,
    });
    expect(statement.transactions).toHaveLength(8);
    expect(statement.transactions[0].purpose).toBeUndefined();
  });

  it.each([
    ["an empty file", ""],
    ["an unknown header", "Date,Text,Amount\n01/01/2026,SHOP,-1.00\n"],
    ["a header with a changed column", cardText.replace("Memo", "Note")],
    [
      "the German Commerzbank header",
      "Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Waehrung;IBAN Kontoinhaber;Kategorie\n",
    ],
  ])("rejects %s as an unknown format", async (_label, text) => {
    const error = await parseStatement({
      fileName: chaseCardFileName,
      text,
      accounts,
      hash: passThroughHash,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(StatementError);
    expect(error.code).toBe("unknown-format");
    expect(error.line).toBeUndefined();
  });

  it("awaits an async hash", async () => {
    const statement = await parseStatement({
      fileName: chaseCardFileName,
      text: cardText,
      accounts,
      hash: async (input) => `hashed:${input.length}`,
    });
    expect(statement.transactions[0].fingerprint).toMatch(/^v1:hashed:\d+$/);
  });
});

describe("finding the Chase account", () => {
  it.each([
    ["Chase2222_Activity_20261031.csv"],
    ["Chase2222_Activity_20261031.CSV"],
    ["Chase2222_Activity_20261001_20261031_20261101.Csv"],
    ["Chase2222_Activity20261001_20261031_20261101.CSV"],
  ])("reads the last four from %s", async (fileName) => {
    const statement = await parseCard(fileName);
    expect(statement.accountId).toBe("card-1");
  });

  it.each([
    ["no last four", "statement.csv"],
    ["a different prefix", "Bank2222_Activity_20261031.csv"],
    ["no account digits", "Chase_Activity20261031.csv"],
    ["another extension", "Chase2222_Activity_20261031.txt"],
    ["last four nobody registered", "Chase9999_Activity_20261031.csv"],
  ])("fails on %s", async (_label, fileName) => {
    const error = await parseCard(fileName).catch((e) => e);
    expect(error).toBeInstanceOf(StatementError);
    expect(error.code).toBe("unknown-account");
    expect(error.message).toMatch(/Check that the account exists/);
  });

  it("fails when the account is set up for another format", async () => {
    const error = await parseCard("Chase1111_Activity_20261031.csv").catch(
      (e) => e,
    );
    expect(error.code).toBe("account-format-mismatch");
    expect(error.message).toMatch(/Change the account's format/);
  });

  it("picks the account of the right format when last fours collide", async () => {
    const statement = await parseCard("Chase7777_Activity_20261031.csv", [
      { id: "bank", lastFour: "7777", format: "chase-bank", currency: "USD" },
      { id: "card", lastFour: "7777", format: "chase-card", currency: "USD" },
    ]);
    expect(statement.accountId).toBe("card");
  });

  it("doesn't guess between two accounts of one format", async () => {
    const error = await parseCard("Chase7777_Activity_20261031.csv", [
      { id: "a", lastFour: "7777", format: "chase-card", currency: "USD" },
      { id: "b", lastFour: "7777", format: "chase-card", currency: "USD" },
    ]).catch((e) => e);
    expect(error.code).toBe("unknown-account");
  });
});

describe("what leaves the parser", () => {
  it("redacts every text field a row keeps", async () => {
    const header =
      "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
    const row =
      "10/06/2026,10/07/2026,PAY DE00123456789012345678,X 1111222233334444,T 1111 2222 3333 4444,-1.00,card 5232 XXXX XXXX 1234";
    const { transactions } = await parseStatement({
      fileName: chaseCardFileName,
      text: `${header}\n${row}\n`,
      accounts,
      hash: passThroughHash,
    });

    expect(transactions[0]).toMatchObject({
      description: "PAY [REDACTED]",
      bankCategory: "X [REDACTED]",
      bankType: "T [REDACTED]",
      purpose: "card [REDACTED]",
    });
  });

  it("hashes the redacted description", async () => {
    const header =
      "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
    const inputs: string[] = [];
    await parseStatement({
      fileName: chaseCardFileName,
      text: `${header}\n10/06/2026,10/07/2026,PAY   DE00123456789012345678,,Sale,-1.00,\n`,
      accounts,
      hash: (input) => {
        inputs.push(input);
        return input;
      },
    });

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("PAY [REDACTED]");
    expect(inputs[0]).not.toContain("DE00123456789012345678");
  });

  it("gives shared rows the same fingerprint across overlapping exports", async () => {
    const header =
      "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";
    const sharedA = "10/05/2026,10/06/2026,EXAMPLE MARKET,Groceries,Sale,-4.00,";
    const sharedB = "10/07/2026,10/08/2026,STREAMFLIX,Entertainment,Sale,-9.00,";
    const onlyOlder = "09/20/2026,09/21/2026,OLDER SHOP,Shopping,Sale,-1.00,";
    const onlyNewer = "10/20/2026,10/21/2026,NEWER SHOP,Shopping,Sale,-2.00,";

    const parse = (rows: string[]) =>
      parseStatement({
        fileName: chaseCardFileName,
        text: [header, ...rows].join("\n"),
        accounts,
        hash: passThroughHash,
      });
    const older = await parse([sharedB, sharedA, onlyOlder]);
    const newer = await parse([onlyNewer, sharedA, sharedB]);

    const fingerprintOf = (
      statement: typeof older,
      description: string,
    ): string | undefined =>
      statement.transactions.find((t) => t.description === description)
        ?.fingerprint;

    expect(fingerprintOf(older, "EXAMPLE MARKET")).toBe(
      fingerprintOf(newer, "EXAMPLE MARKET"),
    );
    expect(fingerprintOf(older, "STREAMFLIX")).toBe(
      fingerprintOf(newer, "STREAMFLIX"),
    );
  });
});
