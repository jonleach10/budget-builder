import { describe, expect, it } from "vitest";
import { addFingerprints } from "./fingerprint";
import type { StatementRow } from "./types";

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  return {
    postedOn: "2026-10-05",
    amount: { minor: -1199, currency: "USD" },
    description: "STREAMFLIX A1B2C3",
    ...overrides,
  };
}

const passThrough = (input: string) => input;

async function fingerprints(rows: StatementRow[], accountId = "acct-1") {
  const transactions = await addFingerprints(rows, accountId, passThrough);
  return transactions.map((transaction) => transaction.fingerprint);
}

describe("addFingerprints", () => {
  it("gives identical rows in one file different fingerprints", async () => {
    const [first, second] = await fingerprints([row(), row()]);
    expect(first).not.toBe(second);
  });

  it("gives the same fingerprints wherever the identical rows sit", async () => {
    const other = row({ description: "EXAMPLE MARKET" });
    const a = await fingerprints([row(), other, row()]);
    const b = await fingerprints([other, row(), row()]);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it.each<[string, Partial<StatementRow>]>([
    ["posted date", { postedOn: "2026-10-06" }],
    ["amount", { amount: { minor: -1200, currency: "USD" } }],
    ["currency", { amount: { minor: -1199, currency: "EUR" } }],
    ["description", { description: "OTHER SHOP" }],
  ])("changes with the %s", async (_label, change) => {
    const [base] = await fingerprints([row()]);
    const [changed] = await fingerprints([row(change)]);
    expect(changed).not.toBe(base);
  });

  it("changes with the account", async () => {
    const [a] = await fingerprints([row()], "acct-1");
    const [b] = await fingerprints([row()], "acct-2");
    expect(a).not.toBe(b);
  });

  it("ignores fields outside the stable parts", async () => {
    const [base] = await fingerprints([row()]);
    const [other] = await fingerprints([
      row({ purpose: "Memo", purchasedOn: "2026-10-01", bankType: "Sale" }),
    ]);
    expect(other).toBe(base);
  });

  it("waits for an async hash and keeps row order", async () => {
    const asyncHash = async (input: string) => `hashed:${input}`;
    const rows = [row(), row({ description: "OTHER SHOP" })];
    const transactions = await addFingerprints(rows, "acct-1", asyncHash);
    expect(transactions[0].description).toBe("STREAMFLIX A1B2C3");
    expect(transactions[1].description).toBe("OTHER SHOP");
    expect(transactions[0].fingerprint).toMatch(/^hashed:/);
  });

  it("adds the account id to each transaction", async () => {
    const [transaction] = await addFingerprints([row()], "acct-1", passThrough);
    expect(transaction.accountId).toBe("acct-1");
  });
});
