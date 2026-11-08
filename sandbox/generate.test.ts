import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pairTransfers } from "@/features/categorize/pairTransfers";
import { passThroughHash } from "@/features/import/__fixtures__/load";
import { parseStatement } from "@/features/import/parseStatement";
import { REDACTED } from "@/features/import/redact";
import type { Account, Transaction } from "@/features/import/types";
import {
  ACCOUNT_WITH_NO_ROWS,
  type DataSize,
  generateStatements,
  SANDBOX_ACCOUNTS,
  sandboxMonths,
} from "./generate.ts";

const TODAY = "2026-11-15";

const accounts: Account[] = SANDBOX_ACCOUNTS.map((account) => ({
  id: `account-${account.lastFour}`,
  lastFour: account.lastFour,
  format: account.format,
  currency: account.currency,
}));

async function parsedRows(
  today = TODAY,
  size?: DataSize,
): Promise<Transaction[]> {
  const statements = await Promise.all(
    generateStatements(today, { size }).map(({ name, text }) =>
      parseStatement({ fileName: name, text, accounts, hash: passThroughHash }),
    ),
  );
  return statements.flatMap(({ transactions }) => transactions);
}

const SIZES: readonly DataSize[] = ["default", "small", "medium", "large"];

function allText(size?: DataSize): string {
  return generateStatements(TODAY, { size })
    .map((file) => file.text)
    .join("\n");
}

function monthsOf(rows: readonly Transaction[]): string[] {
  return [...new Set(rows.map(({ postedOn }) => postedOn.slice(0, 7)))].sort();
}

function digestOf(files: unknown): string {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}

// Taken from the generator before it had sizes. The sandbox's flows and
// screenshots rely on this output, so a change here must be on purpose.
const DEFAULT_DIGESTS: Record<string, string> = {
  "2026-11-03":
    "fb21319adf179724600cd3a2e006b0b446a40311f866396c26133b676b532ed6",
  "2026-11-15":
    "9f759d915bbe3419be1b3ad91dc819c48d6e3569e88e600fa9337c443c9c73be",
  "2027-02-15":
    "2452e599611285a9d8278411cd634ca6e1453a8ccb847097b16ea2357d877eb4",
};

describe("generateStatements at the default size", () => {
  it.each(Object.entries(DEFAULT_DIGESTS))(
    "gives exactly the files it gave before sizes, on %s",
    (today, digest) => {
      expect(digestOf(generateStatements(today))).toBe(digest);
      expect(digestOf(generateStatements(today, { size: "default" }))).toBe(
        digest,
      );
    },
  );

  it("covers the same five months as before sizes", () => {
    expect(sandboxMonths(TODAY)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });
});

describe("generateStatements at a set size", () => {
  // About the owner's real row count, then 5 and 15 times it.
  it.each([
    ["small", 1_600],
    ["medium", 8_000],
    ["large", 24_000],
  ] as const)("at %s, gives about %i rows", async (size, target) => {
    const { length } = await parsedRows(TODAY, size);

    expect(length).toBeGreaterThanOrEqual(target * 0.9);
    expect(length).toBeLessThanOrEqual(target * 1.1);
  });

  it.each(SIZES)("at %s, spreads rows across every account in both currencies", async (size) => {
    const rows = await parsedRows(TODAY, size);

    expect(new Set(rows.map(({ accountId }) => accountId))).toEqual(
      new Set(accounts.map(({ id }) => id)),
    );
    expect(new Set(rows.map(({ amount }) => amount.currency))).toEqual(
      new Set(["USD", "EUR"]),
    );
  });

  it.each(SIZES)("at %s, lists every month that has rows", async (size) => {
    const listed = sandboxMonths(TODAY, { size });

    // The second month listed is the empty one.
    expect(monthsOf(await parsedRows(TODAY, size))).toEqual(
      listed.filter((_, index) => index !== 1),
    );
  });

  it.each(SIZES)("at %s, gives the same files for the same day", (size) => {
    expect(generateStatements(TODAY, { size })).toEqual(
      generateStatements(TODAY, { size }),
    );
  });

  it.each(SIZES)("at %s, uses only an IBAN that can't be a real account", (size) => {
    const ibans = allText(size).match(/\b[A-Z]{2}\d{2}(?: ?\d){10,}/g) ?? [];

    expect(ibans.length).toBeGreaterThan(0);
    expect(ibans.every((iban) => iban.startsWith("DE00"))).toBe(true);
  });
});

describe("generateStatements", () => {
  it("writes one file per account, which the real parser accepts", async () => {
    expect(generateStatements(TODAY)).toHaveLength(SANDBOX_ACCOUNTS.length);
    await expect(parsedRows()).resolves.not.toHaveLength(0);
  });

  it("writes no rows for the account with no rows", async () => {
    const withEmpty: Account[] = [
      ...accounts,
      {
        id: "account-empty",
        lastFour: ACCOUNT_WITH_NO_ROWS.lastFour,
        format: ACCOUNT_WITH_NO_ROWS.format,
        currency: ACCOUNT_WITH_NO_ROWS.currency,
      },
    ];
    const statements = await Promise.all(
      generateStatements(TODAY).map(({ name, text }) =>
        parseStatement({
          fileName: name,
          text,
          accounts: withEmpty,
          hash: passThroughHash,
        }),
      ),
    );

    expect(statements.map(({ accountId }) => accountId)).not.toContain(
      "account-empty",
    );
  });

  it("gives the same files for the same day", () => {
    expect(generateStatements(TODAY)).toEqual(generateStatements(TODAY));
  });

  it("gives about 400 rows", async () => {
    const { length } = await parsedRows();

    expect(length).toBeGreaterThanOrEqual(350);
    expect(length).toBeLessThanOrEqual(450);
  });

  it("covers five months, with the second one empty", async () => {
    expect(monthsOf(await parsedRows())).toEqual([
      "2026-07",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("holds no row after today", async () => {
    const dates = (await parsedRows("2026-11-03")).map(
      ({ postedOn }) => postedOn,
    );

    expect(dates.every((date) => date <= "2026-11-03")).toBe(true);
  });

  it("includes transfers the real pairing settles and leaves uncertain", async () => {
    const { pairs, uncertain } = pairTransfers(await parsedRows(), accounts);
    const evidence = pairs.map((pair) => pair.evidence);

    expect(evidence).toContain("transfer-number");
    expect(evidence).toContain("card-payment");
    expect(uncertain.map(({ reason }) => reason)).toContain("same-amount");
  });

  it("includes a card payment with two bank rows that could be its other side", async () => {
    const { uncertain } = pairTransfers(await parsedRows(), accounts);

    expect(
      uncertain.some(({ reason, rows }) => reason === "card-payment" && rows.length === 3),
    ).toBe(true);
  });

  it("includes a row the import treats as a possible duplicate", async () => {
    const rows = await parsedRows();

    expect(rows.some((row) => (row.repeatIndex ?? 0) > 0)).toBe(true);
  });

  it("includes a foreign purchase on each side of the Atlantic", async () => {
    const originals = (await parsedRows()).flatMap((row) =>
      row.original === undefined ? [] : [row.original.amount.currency],
    );

    expect(originals).toContain("EUR");
    expect(originals).toContain("USD");
  });

  it("includes rows the real redaction removes a number from", async () => {
    const rows = await parsedRows();
    const redacted = rows.filter(({ description, purpose }) =>
      `${description} ${purpose}`.includes(REDACTED),
    );

    expect(redacted.some(({ description }) => description === REDACTED)).toBe(
      true,
    );
    expect(redacted.some(({ description }) => description !== REDACTED)).toBe(
      true,
    );
  });

  it("includes a refund and a row with no description", async () => {
    const rows = await parsedRows();

    expect(rows.some(({ bankType }) => bankType === "Return")).toBe(true);
    expect(rows.some(({ description }) => description === "")).toBe(true);
  });

  it("includes text long enough to test wrapping", async () => {
    const longest = Math.max(
      ...(await parsedRows()).map(({ description }) => description.length),
    );

    expect(longest).toBeGreaterThanOrEqual(90);
  });

  it("uses only an IBAN that can't be a real account", () => {
    const text = generateStatements(TODAY)
      .map((file) => file.text)
      .join("\n");
    const ibans = text.match(/\b[A-Z]{2}\d{2}(?: ?\d){10,}/g) ?? [];

    expect(ibans.length).toBeGreaterThan(0);
    expect(ibans.every((iban) => iban.startsWith("DE00"))).toBe(true);
  });

  // The seed labels last month's newest SAMPLE GROCER row, and card merchants
  // are picked at random, so December 2026 once had none.
  it.each(["2026-11-15", "2027-01-15"])(
    "writes a SAMPLE GROCER row last month for the seed to label, on %s",
    async (today) => {
      const [lastMonth] = sandboxMonths(today).slice(-2);
      const grocer = (await parsedRows(today)).filter(
        ({ postedOn, description }) =>
          postedOn.startsWith(lastMonth) && description.startsWith("SAMPLE GROCER"),
      );

      expect(grocer).not.toHaveLength(0);
    },
  );

  it("keeps working across a new year", async () => {
    expect(monthsOf(await parsedRows("2027-02-15"))).toEqual([
      "2026-10",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});
