import { describe, expect, it } from "vitest";
import { passThroughHash } from "@/features/import/__fixtures__/load";
import { parseStatement } from "@/features/import/parseStatement";
import type {
  Account,
  ParsedStatement,
  Transaction,
} from "@/features/import/types";
import { generateStatements, SANDBOX_ACCOUNTS } from "./generate.ts";
import {
  WEIRD_STATEMENTS,
  type WeirdStatement,
  weirdStatements,
} from "./weird.ts";

const TODAY = "2026-11-08";

const accounts: Account[] = SANDBOX_ACCOUNTS.map((account) => ({
  id: `account-${account.lastFour}`,
  lastFour: account.lastFour,
  format: account.format,
  currency: account.currency,
}));

async function parsedRows(
  name: WeirdStatement,
  today = TODAY,
): Promise<Transaction[]> {
  const statements: ParsedStatement[] = await Promise.all(
    weirdStatements(today, [name]).map(({ name: fileName, text }) =>
      parseStatement({ fileName, text, accounts, hash: passThroughHash }),
    ),
  );
  return statements.flatMap(({ transactions }) => transactions);
}

describe("weirdStatements, for every fixture", () => {
  it.each(WEIRD_STATEMENTS)("%s gives the same files for the same day", (name) => {
    expect(weirdStatements(TODAY, [name])).toEqual(weirdStatements(TODAY, [name]));
  });

  it.each(WEIRD_STATEMENTS)("%s uses only an IBAN that can't be a real account", (name) => {
    const text = weirdStatements(TODAY, [name])
      .map((file) => file.text)
      .join("\n");
    const ibans = text.match(/\b[A-Z]{2}\d{2}(?: ?\d){10,}/g) ?? [];

    expect(ibans.every((iban) => iban.startsWith("DE00"))).toBe(true);
  });

  // Not seeded: it's the normal seed's text, whose made-up recipient IBAN is
  // there on purpose for redaction, and generate.test.ts checks it.
  it.each(WEIRD_STATEMENTS.filter((name) => name !== "seeded"))(
    "%s names only the sandbox's own accounts",
    (name) => {
    const text = weirdStatements(TODAY, [name])
      .map((file) => `${file.name}\n${file.text}`)
      .join("\n");
    const lastFours = [
      ...text.matchAll(/(?:Chase|DE|\.\.\.)(\d{4})(?!\d)|DE00\d{14}(\d{4})/g),
    ].map(([, short, iban]) => short ?? iban);

    expect(lastFours.length).toBeGreaterThan(0);
    expect(
      lastFours.every((lastFour) =>
        SANDBOX_ACCOUNTS.some((account) => account.lastFour === lastFour),
      ),
    ).toBe(true);
    },
  );

  it("gives seeded the normal seed's own text, file by file", () => {
    const seed = generateStatements(TODAY).map(({ text }) => text);

    expect(weirdStatements(TODAY, ["seeded"]).map(({ text }) => text)).toEqual(seed);
  });

  it("gives every file its own name, so all of them fit in one folder", () => {
    const names = weirdStatements(TODAY, WEIRD_STATEMENTS).map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("weirdStatements, rows dated today", () => {
  it("gives a row posted today on every account, and none after", async () => {
    const rows = await parsedRows("rows-today");
    const today = rows.filter(({ postedOn }) => postedOn === TODAY);

    expect(new Set(today.map(({ accountId }) => accountId))).toEqual(
      new Set(accounts.map(({ id }) => id)),
    );
    expect(rows.every(({ postedOn }) => postedOn <= TODAY)).toBe(true);
  });

  it("includes a card purchase made today, not only one posted today", async () => {
    const rows = await parsedRows("rows-today");

    expect(rows.some(({ purchasedOn }) => purchasedOn === TODAY)).toBe(true);
  });
});

function textOf(name: WeirdStatement, lastFour: string): string {
  const file = weirdStatements(TODAY, [name]).find(({ name: fileName }) =>
    fileName.includes(lastFour),
  );
  if (file === undefined) throw new Error(`No ${lastFour} file for ${name}.`);
  return file.text;
}

describe("weirdStatements, long transfer numbers", () => {
  const numbersIn = (text: string) =>
    [...text.matchAll(/transaction#: (\d+)/g)].map(([, number]) => number);

  it("gives checking-to-savings moves with transfer numbers of 12 or more digits", () => {
    const sent = numbersIn(textOf("long-transfer-number", "1111"));
    const received = numbersIn(textOf("long-transfer-number", "4444"));

    expect(sent).toEqual(received);
    expect(sent.map((number) => number.length).sort((a, b) => a - b)).toEqual([
      12, 14,
    ]);
  });

  it("gives files the real parser accepts, with each amount on both sides", async () => {
    const rows = await parsedRows("long-transfer-number");
    const amounts = (lastFour: string, sign: number) =>
      rows
        .filter(({ accountId }) => accountId === `account-${lastFour}`)
        .map(({ amount }) => amount.minor * sign)
        .sort((a, b) => a - b);

    expect(amounts("1111", -1)).toEqual(amounts("4444", 1));
    expect(amounts("1111", -1)).toHaveLength(2);
  });
});

describe("weirdStatements, semicolon in a purpose", () => {
  it("writes a purpose holding a bare semicolon, after the IBAN, the way the bank does", () => {
    const [header, ...lines] = textOf("semicolon-purpose", "3333").split("\n");
    const columns = header.split(";").length;
    const odd = lines.filter((line) => line.split(";").length === columns + 1);

    expect(odd).toHaveLength(1);
    const fields = odd[0].split(";");
    expect(fields[6]).toMatch(/^DE00\d{18}$/);
    expect(fields.slice(-2).join(";")).toBe("Rechnung 2611; Danke");
    expect(odd[0]).not.toContain('"');
  });
});

describe("weirdStatements, decomposed Unicode", () => {
  it("gives text written with combining accents, at both banks", async () => {
    const decomposed = (await parsedRows("decomposed-unicode")).filter(
      ({ description }) => description !== description.normalize("NFC"),
    );

    expect(new Set(decomposed.map(({ accountId }) => accountId))).toEqual(
      new Set(["account-2222", "account-3333"]),
    );
  });

  it("spells a merchant from the normal seed the decomposed way", async () => {
    const normal = await Promise.all(
      generateStatements(TODAY).map(({ name, text }) =>
        parseStatement({ fileName: name, text, accounts, hash: passThroughHash }),
      ),
    );
    const seeded = new Set(
      normal.flatMap(({ transactions }) => transactions.map((row) => row.description)),
    );
    const weird = await parsedRows("decomposed-unicode");

    expect(
      weird.some(
        ({ description }) =>
          !seeded.has(description) && seeded.has(description.normalize("NFC")),
      ),
    ).toBe(true);
  });
});

describe("weirdStatements, empty month", () => {
  it("gives each account a statement with its header and no rows", () => {
    const files = weirdStatements(TODAY, ["empty-month"]);
    const headers = new Map(
      generateStatements(TODAY).map(({ name, text }) => [
        name.match(/\d{4}/)?.[0],
        text.split("\n")[0],
      ]),
    );

    expect(files).toHaveLength(SANDBOX_ACCOUNTS.length);
    for (const { name, text } of files) {
      expect(text).toBe(headers.get(name.match(/\d{4}/)?.[0]));
    }
    expect(new Set(files.map(({ name }) => name.match(/\d{4}/)?.[0]))).toEqual(
      new Set(SANDBOX_ACCOUNTS.map(({ lastFour }) => lastFour)),
    );
  });

  it("gives Chase files the real parser reads as no rows", async () => {
    const chase = weirdStatements(TODAY, ["empty-month"]).filter(({ name }) =>
      name.startsWith("Chase"),
    );
    const parsed = await Promise.all(
      chase.map(({ name, text }) =>
        parseStatement({ fileName: name, text, accounts, hash: passThroughHash }),
      ),
    );

    expect(parsed).toHaveLength(3);
    expect(parsed.every(({ transactions }) => transactions.length === 0)).toBe(true);
  });
});

describe("weirdStatements, zero rate", () => {
  it("gives a foreign purchase whose bank text shows a rate of zero, at each bank", async () => {
    const zeroRated = (await parsedRows("zero-rate")).filter(
      ({ original }) => original?.rate !== undefined && Number(original.rate) === 0,
    );

    expect(new Set(zeroRated.map(({ accountId }) => accountId))).toEqual(
      new Set(["account-1111", "account-3333"]),
    );
    expect(zeroRated.every(({ amount }) => amount.minor !== 0)).toBe(true);
  });
});

describe("weirdStatements, leap day", () => {
  it("gives rows on 29 February of the last leap year, in every format", async () => {
    const rows = await parsedRows("leap-day");
    const onLeapDay = rows.filter(({ postedOn }) => postedOn === "2024-02-29");

    expect(new Set(onLeapDay.map(({ accountId }) => accountId))).toEqual(
      new Set(["account-1111", "account-2222", "account-3333"]),
    );
  });

  it("uses this year's leap day once it has passed", async () => {
    const rows = await parsedRows("leap-day", "2028-03-01");

    expect(rows.some(({ postedOn }) => postedOn === "2028-02-29")).toBe(true);
    expect(rows.every(({ postedOn }) => postedOn <= "2028-03-01")).toBe(true);
  });

  it("includes a card purchase on leap day that posts on 1 March", async () => {
    const rows = await parsedRows("leap-day");

    expect(
      rows.some(
        ({ purchasedOn, postedOn }) =>
          purchasedOn === "2024-02-29" && postedOn === "2024-03-01",
      ),
    ).toBe(true);
  });
});
