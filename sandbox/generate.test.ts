import { describe, expect, it } from "vitest";
import { pairTransfers } from "@/features/categorize/pairTransfers";
import { passThroughHash } from "@/features/import/__fixtures__/load";
import { parseStatement } from "@/features/import/parseStatement";
import { REDACTED } from "@/features/import/redact";
import type { Account, Transaction } from "@/features/import/types";
import { generateStatements, SANDBOX_ACCOUNTS } from "./generate.ts";

const TODAY = "2026-11-15";

const accounts: Account[] = SANDBOX_ACCOUNTS.map((account) => ({
  id: `account-${account.lastFour}`,
  lastFour: account.lastFour,
  format: account.format,
  currency: account.currency,
}));

async function parsedRows(today = TODAY): Promise<Transaction[]> {
  const statements = await Promise.all(
    generateStatements(today).map(({ name, text }) =>
      parseStatement({ fileName: name, text, accounts, hash: passThroughHash }),
    ),
  );
  return statements.flatMap(({ transactions }) => transactions);
}

function monthsOf(rows: readonly Transaction[]): string[] {
  return [...new Set(rows.map(({ postedOn }) => postedOn.slice(0, 7)))].sort();
}

describe("generateStatements", () => {
  it("writes one file per account, which the real parser accepts", async () => {
    expect(generateStatements(TODAY)).toHaveLength(SANDBOX_ACCOUNTS.length);
    await expect(parsedRows()).resolves.not.toHaveLength(0);
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

  it("keeps working across a new year", async () => {
    expect(monthsOf(await parsedRows("2027-02-15"))).toEqual([
      "2026-10",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});
