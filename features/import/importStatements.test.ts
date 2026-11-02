import { describe, expect, it, vi } from "vitest";
import { addDays } from "@/features/fx/dates";
import {
  accounts,
  chaseBankFileName,
  chaseCardFileName,
  commerzbankFileName,
  loadFixture,
} from "./__fixtures__/load";
import {
  fakeImportClient,
  type FakeImportData,
} from "./__fixtures__/fakeImportClient";
import { importStatements, type StatementFile } from "./importStatements";

const TODAY = "2026-10-31";

const ACCOUNT_ROWS = accounts.map((account) => ({
  id: account.id,
  last_four: account.lastFour,
  format: account.format,
  currency: account.currency,
}));

function csv(name: string, text = loadFixture(name)): StatementFile {
  return new File([text], name);
}

/** The ECB's reply for a range: one rate for each date it's asked about. */
function ratesReply() {
  return vi.fn(async () =>
    Response.json(
      ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-15"].map(
        (date) => ({ date, base: "EUR", quote: "USD", rate: 1.08 }),
      ),
    ),
  );
}

/** A stored bank row that can pay the card fixture's 250.00 payment. */
function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "stored-1",
    account_id: "bank-1",
    fingerprint: "v1:stored",
    posted_on: "2026-10-04",
    purchased_on: null,
    amount_minor: -25000,
    currency: "USD",
    description: "SYNTHETIC PAYMENT",
    purpose: null,
    original_amount_minor: null,
    original_currency: null,
    original_rate: null,
    bank_type: null,
    bank_category: null,
    ppd_id: null,
    ordering_party_id: null,
    transfer_number: null,
    balance_minor: null,
    type: null,
    category_id: null,
    category_source: null,
    suggested_category_id: null,
    note: null,
    hidden: false,
    possible_duplicate: false,
    transfer_pair_id: null,
    ...overrides,
  };
}

function run(
  files: readonly StatementFile[],
  data: FakeImportData = {},
  fetch: typeof globalThis.fetch = ratesReply(),
  today = TODAY,
) {
  const { client, rpc } = fakeImportClient({ accounts: ACCOUNT_ROWS, ...data });
  const result = importStatements({ files, client, fetch, today });
  return { result, rpc };
}

function sentTo(rpc: ReturnType<typeof fakeImportClient>["rpc"]) {
  const [name, args] = rpc.mock.calls[0] as unknown as [
    string,
    { p_rows: { account_id: string }[]; p_rates: unknown[]; p_pairs: unknown[] },
  ];
  return { name, ...args };
}

function typesSent(rpc: ReturnType<typeof fakeImportClient>["rpc"]) {
  const rows = sentTo(rpc).p_rows as { type?: string }[];
  return rows.map((row) => row.type);
}

describe("importStatements", () => {
  it("stores every file in one call and gives the counts", async () => {
    const { result, rpc } = run(
      [
        csv(chaseBankFileName),
        csv(chaseCardFileName),
        csv(commerzbankFileName),
      ],
      {
        rpcReply: {
          data: { new: 20, skipped: 3, possible_duplicates: 1 },
          error: null,
        },
      },
    );

    await expect(result).resolves.toEqual({
      ok: true,
      fileCount: 3,
      summary: {
        newRows: 20,
        skippedRows: 3,
        possibleDuplicates: 1,
        // Two rows with no booking date, and one dated after today.
        ignoredPending: 3,
      },
    });
    expect(rpc).toHaveBeenCalledTimes(1);

    const sent = sentTo(rpc);
    expect(sent.name).toBe("import_transactions");
    expect(new Set(sent.p_rows.map((row) => row.account_id))).toEqual(
      new Set(["bank-1", "card-1", "euro-1"]),
    );
    expect(sent.p_rates.length).toBeGreaterThan(0);
    expect(sent.p_pairs).toEqual([]);
  });

  it("stores each row with its type, in the order of the file", async () => {
    const { result, rpc } = run([csv(chaseCardFileName)]);
    await result;

    expect(typesSent(rpc)).toEqual([
      "spending",
      "spending",
      "spending",
      "spending",
      // A card payment with no bank row to pair with.
      "transfer",
      "spending",
      "spending",
      // An adjustment has no default type, so it reaches review.
      undefined,
    ]);
  });

  it("gives a row the category from a rule", async () => {
    const { result, rpc } = run([csv(chaseCardFileName)], {
      categories: [{ id: "category-1", name: "Groceries" }],
      rules: [
        {
          id: "rule-1",
          match_on: "descriptionContains",
          value: "EXAMPLE MARKET",
          position: 0,
          type: null,
          category_id: "category-1",
        },
      ],
    });
    await result;

    const [row] = sentTo(rpc).p_rows as Record<string, unknown>[];
    expect(row).toMatchObject({
      type: "spending",
      category_id: "category-1",
      category_source: "rule",
    });
  });

  it("pairs a row with a stored row from an earlier upload", async () => {
    const { result, rpc } = run([csv(chaseCardFileName)], {
      transactions: [storedRow()],
    });
    await result;

    expect(sentTo(rpc).p_pairs).toEqual([
      {
        moneyOut: { accountId: "bank-1", fingerprint: "v1:stored" },
        moneyIn: { accountId: "card-1", fingerprint: expect.any(String) },
      },
    ]);
  });

  it("doesn't pair with a stored row far from the upload's dates", async () => {
    const { result, rpc } = run([csv(chaseCardFileName)], {
      transactions: [storedRow({ posted_on: "2026-08-01" })],
    });
    await result;

    expect(sentTo(rpc).p_pairs).toEqual([]);
  });

  it("learns from a confirmed row of any date", async () => {
    const { result, rpc } = run([csv(chaseCardFileName)], {
      categories: [{ id: "category-1", name: "Groceries" }],
      transactions: [
        storedRow({
          posted_on: "2024-01-01",
          amount_minor: -1000,
          description: "EXAMPLE MARKET #1234",
          type: "spending",
          category_id: "category-1",
          category_source: "manual",
        }),
      ],
    });
    await result;

    const [row] = sentTo(rpc).p_rows as Record<string, unknown>[];
    expect(row).toMatchObject({
      category_id: "category-1",
      category_source: "history",
    });
  });

  it("reads nothing more when every row waits for its date", async () => {
    const { result, rpc } = run(
      [csv(chaseCardFileName)],
      { failingTable: "rules" },
      ratesReply(),
      "2020-01-01",
    );

    await expect(result).resolves.toMatchObject({ ok: true });
    expect(sentTo(rpc).p_rows).toEqual([]);
  });

  it("reuses saved rates and fetches nothing when each weekday has one", async () => {
    const dates: string[] = [];
    for (let date = "2026-09-24"; date <= "2026-10-15"; date = addDays(date, 1)) {
      dates.push(date);
    }
    const fetch = ratesReply();
    const { result, rpc } = run(
      [csv(commerzbankFileName)],
      {
        fx_rates: dates.map((rate_date) => ({
          rate_date,
          base: "EUR",
          quote: "USD",
          rate: "1.08",
        })),
      },
      fetch,
    );

    await expect(result).resolves.toMatchObject({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(sentTo(rpc).p_rates).toEqual([]);
  });
});

describe("importStatements when it can't finish", () => {
  const AGAIN = "Nothing was stored. Export the file again, then import it.";

  it("refuses an empty upload", async () => {
    const { result, rpc } = run([]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: "Choose at least one CSV file.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses files over the limit without reading them", async () => {
    const text = vi.fn(async () => "");
    const { result, rpc } = run([
      { name: "large.csv", size: 1_400_000, text },
    ]);

    await expect(result).resolves.toEqual({
      ok: false,
      message:
        "This upload is 1.4 MB, and the limit is 1 MB. Nothing was sent. Import fewer files at once, or export a shorter period.",
    });
    expect(text).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores nothing from the whole upload when one file is bad", async () => {
    const { result, rpc } = run([
      csv(chaseCardFileName),
      csv("statement.csv", "not,a,statement\n1,2,3\n"),
    ]);

    await expect(result).resolves.toEqual({
      ok: false,
      message:
        "statement.csv isn't a format Budget Builder can read. Nothing was stored. Export a CSV from Chase or Commerzbank.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("names the account problem for a file with an unknown account", async () => {
    const name = "Chase9999_Activity_20261031.csv";
    const { result } = run([csv(name, loadFixture(chaseBankFileName))]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `Budget Builder can't match ${name} to one account. Nothing was stored. Check the account's last four digits, and that a Chase file has its original file name, then import it again.`,
    });
  });

  it("says a file name matters when a Chase file was renamed", async () => {
    const name = "october-checking.csv";
    const { result, rpc } = run([csv(name, loadFixture(chaseBankFileName))]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `Budget Builder can't match ${name} to one account. Nothing was stored. Check the account's last four digits, and that a Chase file has its original file name, then import it again.`,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says a Commerzbank file has no rows, not that its account is unknown", async () => {
    const [header] = loadFixture(commerzbankFileName).split("\n");
    const { result, rpc } = run([
      csv(chaseCardFileName),
      csv(commerzbankFileName, `${header}\n`),
    ]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `${commerzbankFileName} has no rows, so Budget Builder can't tell which account it's for. Nothing was stored. Remove the file from the list, then import again.`,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("names the format problem when the account has another format", async () => {
    const name = "Chase3333_Activity_20261031.csv";
    const { result } = run([csv(name, loadFixture(chaseBankFileName))]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `${name} doesn't match the statement format set for its account. Nothing was stored. Check the account's format, then import the file again.`,
    });
  });

  it("gives the line of a Chase balance that doesn't reconcile", async () => {
    const text = loadFixture(chaseBankFileName).replace("3360.51", "3360.52");
    const { result, rpc } = run([csv(chaseBankFileName, text)]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `The running balance in ${chaseBankFileName} doesn't add up at line 3, so rows may be missing. ${AGAIN}`,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gives the line of a row it can't read", async () => {
    const text = loadFixture(chaseCardFileName).replace("-42.17", "SECRET");
    const { result } = run([csv(chaseCardFileName, text)]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `Line 2 of ${chaseCardFileName} can't be read. ${AGAIN}`,
    });
  });

  it("gives the line of a row in another currency", async () => {
    const text = loadFixture(commerzbankFileName).replace(
      "-3,5;EUR",
      "-3,5;USD",
    );
    const { result } = run([csv(commerzbankFileName, text)]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `Line 9 of ${commerzbankFileName} isn't in the account's currency. Nothing was stored. Check the account's currency, then import the file again.`,
    });
  });

  it("refuses a file with rows from two accounts", async () => {
    const text = loadFixture(commerzbankFileName).replace(
      "-3,5;EUR;DE00123456789012343333",
      "-3,5;EUR;DE00123456789012344444",
    );
    const { result } = run([csv(commerzbankFileName, text)]);

    await expect(result).resolves.toEqual({
      ok: false,
      message: `${commerzbankFileName} has rows from more than one account, starting at line 9. Nothing was stored. Export each account to its own file, then import them.`,
    });
  });

  it("stores nothing when the rate fetch fails", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 500 }));
    const { result, rpc } = run([csv(commerzbankFileName)], {}, fetch);

    await expect(result).resolves.toEqual({
      ok: false,
      message:
        "Exchange rates aren't available right now. Nothing was stored. Try again in a few minutes.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["accounts", { failingTable: "accounts" }],
    ["saved rates", { failingTable: "fx_rates" }],
    ["rules", { failingTable: "rules" }],
    ["categories", { failingTable: "categories" }],
    ["stored rows", { failingTable: "transactions" }],
    [
      "the database call",
      { rpcReply: { data: null, error: { message: "SYNTHETIC SECRET ROW TEXT" } } },
    ],
    ["an empty reply", { rpcReply: { data: null, error: null } }],
  ] as const)("gives a fixed message when %s fails", async (_, data) => {
    const { result } = run([csv(commerzbankFileName)], data);

    await expect(result).resolves.toEqual({
      ok: false,
      message: "The import didn't finish. Try again. Rows already stored are skipped.",
    });
  });

  it("never quotes a row in its message", async () => {
    const text = loadFixture(chaseCardFileName).replace("-42.17", "SECRET");
    const { result } = run([csv(chaseCardFileName, text)]);

    const outcome = await result;
    expect(JSON.stringify(outcome)).not.toContain("SECRET");
    expect(JSON.stringify(outcome)).not.toContain("EXAMPLE MARKET");
  });
});
