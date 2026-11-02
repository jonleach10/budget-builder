import { describe, expect, it } from "vitest";
import { addDays } from "@/features/fx/dates";
import { ReadRowsError } from "@/lib/readAllRows";
import { fakeImportClient } from "./__fixtures__/fakeImportClient";
import { readImportAccounts, readSavedRates } from "./importStore";

const rate = (rate_date: string, value: string, quote = "USD") => ({
  rate_date,
  base: "EUR",
  quote,
  rate: value,
});

describe("readImportAccounts", () => {
  it("gives each account as parseStatement wants it", async () => {
    const { client } = fakeImportClient({
      accounts: [
        {
          id: "bank-1",
          last_four: "1111",
          format: "chase-bank",
          currency: "USD",
        },
      ],
    });

    await expect(readImportAccounts(client)).resolves.toEqual([
      { id: "bank-1", lastFour: "1111", format: "chase-bank", currency: "USD" },
    ]);
  });

  it("throws the fixed error when the read fails", async () => {
    const { client } = fakeImportClient({ failingTable: "accounts" });

    await expect(readImportAccounts(client)).rejects.toBeInstanceOf(
      ReadRowsError,
    );
  });
});

describe("readSavedRates", () => {
  it("gives EUR to USD rates by date, including both ends of the range", async () => {
    const { client } = fakeImportClient({
      fx_rates: [
        rate("2026-09-30", "1.07"),
        rate("2026-10-01", "1.08"),
        rate("2026-10-02", "1.09"),
        rate("2026-10-03", "1.10"),
      ],
    });

    await expect(
      readSavedRates(client)("2026-10-01", "2026-10-02"),
    ).resolves.toEqual({ "2026-10-01": "1.08", "2026-10-02": "1.09" });
  });

  it("leaves out rates for another currency", async () => {
    const { client } = fakeImportClient({
      fx_rates: [rate("2026-10-01", "0.9", "GBP")],
    });

    await expect(
      readSavedRates(client)("2026-10-01", "2026-10-01"),
    ).resolves.toEqual({});
  });

  it("reads past one page of results", async () => {
    const days = Array.from({ length: 1001 }, (_, index) =>
      addDays("2023-01-01", index),
    );
    const { client } = fakeImportClient({
      fx_rates: days.map((day) => rate(day, "1.08")),
    });

    const saved = await readSavedRates(client)(days[0], days[1000]);

    expect(Object.keys(saved)).toHaveLength(1001);
  });

  it("throws the fixed error when the read fails", async () => {
    const { client } = fakeImportClient({ failingTable: "fx_rates" });

    await expect(
      readSavedRates(client)("2026-10-01", "2026-10-02"),
    ).rejects.toBeInstanceOf(ReadRowsError);
  });
});
