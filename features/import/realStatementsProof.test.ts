import { describe, expect, it } from "vitest";
import {
  chaseBankFileName,
  chaseCardFileName,
  commerzbankFileName,
  loadFixture,
  statementsDir,
} from "./__fixtures__/load";
import {
  buildAccounts,
  checkStatement,
  countBalanceMismatches,
  countIbanShapedFields,
  readRawAmounts,
  readStatementFiles,
} from "./realStatementsProof";
import type { Transaction } from "./types";

const files = readStatementFiles(statementsDir);
const accounts = buildAccounts(files);

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    accountId: "acct-1",
    fingerprint: "AB12345678901234567890",
    postedOn: "2026-10-05",
    amount: { minor: 0, currency: "USD" },
    description: "SHOP",
    ...overrides,
  };
}

describe("readStatementFiles", () => {
  it("reads every csv in the folder", () => {
    expect(files.map((file) => file.fileName)).toEqual([
      chaseBankFileName,
      chaseCardFileName,
      commerzbankFileName,
    ]);
  });
});

describe("buildAccounts", () => {
  it("builds accounts from the file names and headers", () => {
    expect(
      accounts.map(({ lastFour, format, currency }) => ({
        lastFour,
        format,
        currency,
      })),
    ).toEqual([
      { lastFour: "1111", format: "chase-bank", currency: "USD" },
      { lastFour: "2222", format: "chase-card", currency: "USD" },
      { lastFour: "3333", format: "commerzbank", currency: "EUR" },
    ]);
  });

  it("gives accounts neutral ids", () => {
    expect(accounts.map((account) => account.id)).toEqual([
      "account-1",
      "account-2",
      "account-3",
    ]);
  });

  it("builds one account from two exports of it", () => {
    const [bank] = files;
    expect(buildAccounts([bank, bank])).toHaveLength(1);
  });
});

describe("readRawAmounts", () => {
  it.each([
    [chaseBankFileName, "chase-bank", 10, 235551],
    [chaseCardFileName, "chase-card", 8, 16000],
    [commerzbankFileName, "commerzbank", 8, 149812],
  ] as const)(
    "counts rows and sums amounts by hand for %s",
    (fileName, format, dataRowCount, sum) => {
      const currency = format === "commerzbank" ? "EUR" : "USD";
      const raw = readRawAmounts(loadFixture(fileName), format, currency);
      expect(raw.dataRowCount).toBe(dataRowCount);
      expect(raw.bookedSum).toBe(sum);
    },
  );

  it("handles a byte order mark and CRLF", () => {
    const text = `﻿${loadFixture(commerzbankFileName).replace(/\n/g, "\r\n")}`;
    const raw = readRawAmounts(text, "commerzbank", "EUR");
    expect(raw.dataRowCount).toBe(8);
    expect(raw.bookedSum).toBe(149812);
  });
});

describe("countBalanceMismatches", () => {
  const row = (minor: number, balance?: number) =>
    transaction({
      amount: { minor, currency: "USD" },
      balance:
        balance === undefined ? undefined : { minor: balance, currency: "USD" },
    });

  it("accepts a chain that reconciles, newest first", () => {
    expect(countBalanceMismatches([row(-100, 900), row(500, 1000), row(0, 500)])).toBe(0);
  });

  it("counts a broken link", () => {
    expect(countBalanceMismatches([row(-100, 900), row(500, 999)])).toBe(1);
  });

  it("counts a missing balance", () => {
    expect(countBalanceMismatches([row(-100, 900), row(500)])).toBe(1);
  });
});

describe("countIbanShapedFields", () => {
  it("finds an IBAN in any text field", () => {
    expect(
      countIbanShapedFields([
        transaction({ description: "PAY DE00123456789012345678" }),
        transaction({ purpose: "DE00 1234 5678 9012 3456 78" }),
        transaction({ transferNumber: "DE00123456789012345678" }),
      ]),
    ).toBe(3);
  });

  it("allows a word that only starts like an IBAN", () => {
    expect(
      countIbanShapedFields([
        transaction({ description: "AB12 CAFE CENTRAL BERLIN" }),
      ]),
    ).toBe(0);
  });

  it("allows a SEPA creditor ID in the ordering party field only", () => {
    const creditorId = "DE00ZZZ00001234567";
    expect(
      countIbanShapedFields([transaction({ orderingPartyId: creditorId })]),
    ).toBe(0);
    expect(
      countIbanShapedFields([transaction({ description: creditorId })]),
    ).toBe(1);
  });

  it("doesn't read the fingerprint or the account id", () => {
    expect(countIbanShapedFields([transaction({})])).toBe(0);
  });
});

describe("checkStatement", () => {
  it.each(files.map((file, index) => [index + 1, file] as const))(
    "passes synthetic statement %i",
    async (_index, file) => {
      expect(await checkStatement(file, accounts)).toEqual({
        failure: null,
        countsMatch: true,
        sumsMatch: true,
        balanceMismatchCount: 0,
        ibanShapedFieldCount: 0,
      });
    },
  );

  it("reports a broken balance chain", async () => {
    const text = loadFixture(chaseBankFileName).replace("3483.16", "3483.17");
    const check = await checkStatement(
      { fileName: chaseBankFileName, text },
      accounts,
    );
    expect(check.balanceMismatchCount).toBe(2);
  });

  it("reports a failure by code and line, with no row text", async () => {
    const text = loadFixture(chaseCardFileName).replace("-42.17", "EXAMPLE");
    const check = await checkStatement(
      { fileName: chaseCardFileName, text },
      accounts,
    );
    expect(check.failure).toEqual({ code: "invalid-amount", line: 2 });
    expect(check.sumsMatch).toBe(false);
    expect(JSON.stringify(check)).not.toContain("EXAMPLE");
  });

  it("reports a file with no matching account", async () => {
    const check = await checkStatement(
      { fileName: "statement.csv", text: loadFixture(chaseCardFileName) },
      accounts,
    );
    expect(check.failure?.code).toBe("unknown-account");
  });
});
