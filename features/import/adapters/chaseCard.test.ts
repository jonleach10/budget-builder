import { describe, expect, it } from "vitest";
import {
  accounts,
  chaseCardFileName,
  loadFixture,
  passThroughHash,
} from "../__fixtures__/load";
import { StatementError } from "../errors";
import { parseStatement } from "../parseStatement";

const header = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo";

function parse(text: string) {
  return parseStatement({
    fileName: chaseCardFileName,
    text,
    accounts,
    hash: passThroughHash,
  });
}

describe("chase-card statements", () => {
  it("reads every row with its bank's fields", async () => {
    const statement = await parse(loadFixture("chaseCard.csv"));

    expect(statement.accountId).toBe("card-1");
    expect(statement.format).toBe("chase-card");
    expect(statement.ignoredPendingCount).toBe(0);
    expect(statement.transactions).toHaveLength(8);
    expect(statement.transactions[0]).toEqual({
      accountId: "card-1",
      postedOn: "2026-10-07",
      purchasedOn: "2026-10-06",
      amount: { minor: -4217, currency: "USD" },
      description: "EXAMPLE MARKET #1234",
      bankType: "Sale",
      bankCategory: "Groceries",
      fingerprint: expect.any(String),
    });
  });

  it("reads a quoted description and tidies its spacing", async () => {
    const { transactions } = await parse(loadFixture("chaseCard.csv"));
    expect(transactions[1].description).toBe("SHOP *EXAMPLE.COM, INC");
    expect(transactions[1].amount.minor).toBe(-350);
  });

  it("keeps the memo as the purpose when it isn't empty", async () => {
    const { transactions } = await parse(loadFixture("chaseCard.csv"));
    expect(transactions[2].purpose).toBe("Family plan");
    expect(transactions[0]).not.toHaveProperty("purpose");
  });

  it("keeps the sign, so payments and returns stay positive", async () => {
    const { transactions } = await parse(loadFixture("chaseCard.csv"));
    const types = transactions.map((t) => [t.bankType, t.amount.minor > 0]);
    expect(types).toEqual([
      ["Sale", false],
      ["Sale", false],
      ["Sale", false],
      ["Sale", false],
      ["Payment", true],
      ["Return", true],
      ["Fee", false],
      ["Adjustment", true],
    ]);
  });

  it("leaves an empty category unset on payments", async () => {
    const { transactions } = await parse(loadFixture("chaseCard.csv"));
    expect(transactions[4]).not.toHaveProperty("bankCategory");
  });

  it("gives exact identical rows different fingerprints", async () => {
    const { transactions } = await parse(loadFixture("chaseCard.csv"));
    expect(transactions[2].fingerprint).not.toBe(transactions[3].fingerprint);
  });

  it("accepts an export with no rows", async () => {
    const { transactions } = await parse(`${header}\n`);
    expect(transactions).toEqual([]);
  });

  it.each([
    ["too few fields", "10/06/2026,10/07/2026,SHOP,Shopping,Sale,-1.00", "malformed-row"],
    ["too many fields", "10/06/2026,10/07/2026,SHOP,Shopping,Sale,-1.00,,extra", "malformed-row"],
    ["a bad date", "10/32/2026,10/07/2026,SHOP,Shopping,Sale,-1.00,", "invalid-date"],
    ["a bad amount", "10/06/2026,10/07/2026,SHOP,Shopping,Sale,12.3.4,", "invalid-amount"],
  ])("fails the whole file on %s, naming the line", async (_label, row, code) => {
    const good = "10/06/2026,10/07/2026,GOOD,Shopping,Sale,-1.00,";
    const error = await parse(`${header}\n${good}\n\n${row}\n`).catch((e) => e);

    expect(error).toBeInstanceOf(StatementError);
    expect(error.code).toBe(code);
    expect(error.line).toBe(4);
    expect(error.message).toContain("Line 4");
    expect(error.message).not.toContain("SHOP");
  });

  it("fails on an unterminated quote", async () => {
    const error = await parse(
      `${header}\n10/06/2026,10/07/2026,"SHOP,Shopping,Sale,-1.00,\n`,
    ).catch((e) => e);
    expect(error.code).toBe("malformed-row");
    expect(error.message).not.toContain("SHOP");
  });
});
