import { describe, expect, it } from "vitest";
import { addFingerprints, sha256Hex } from "./fingerprint";
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
    expect(transactions[0].fingerprint).toMatch(/^v1:hashed:/);
  });

  it("adds the account id to each transaction", async () => {
    const [transaction] = await addFingerprints([row()], "acct-1", passThrough);
    expect(transaction.accountId).toBe("acct-1");
  });

  it("records how many identical rows came before each row", async () => {
    const other = row({ description: "EXAMPLE MARKET" });
    const transactions = await addFingerprints(
      [row(), other, row(), row()],
      "acct-1",
      passThrough,
    );
    expect(transactions.map((t) => t.repeatIndex)).toEqual([0, 0, 1, 2]);
  });

  // Stored rows match on this exact value, so a change here makes every
  // overlapping row look new. The hash was worked out with shasum, outside this
  // code, over ["acct-1","2026-10-05",-1199,"USD","STREAMFLIX A1B2C3",0].
  it("keeps the stored format", async () => {
    const [transaction] = await addFingerprints([row()], "acct-1", sha256Hex);
    expect(transaction.fingerprint).toBe(
      "v1:b47efd573e54e698a3f5d7668a4774f80737d4755fccee9ec57a0870949647f0",
    );
  });
});

describe("sha256Hex", () => {
  it("gives the known hash of a known input", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
