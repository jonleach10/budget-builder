import { describe, expect, it } from "vitest";
import {
  copyMonth,
  saveBudget,
  type BudgetStore,
  type StoredAmount,
  type BudgetWrite,
} from "./budgetChanges";

type FakeOptions = {
  stored?: Record<string, StoredAmount[]>;
  failRead?: boolean;
  failWrite?: boolean;
};

function fakeStore({ stored = {}, failRead, failWrite }: FakeOptions = {}) {
  const saved: BudgetWrite[][] = [];
  const inserted: BudgetWrite[][] = [];

  const store: BudgetStore = {
    async amounts(month, country) {
      return failRead ? null : (stored[`${month}:${country}`] ?? []);
    },
    async save(rows) {
      saved.push(rows);
      return failWrite ? "failed" : "done";
    },
    async insertMissing(rows) {
      inserted.push(rows);
      return failWrite ? "failed" : "done";
    },
  };
  return { store, saved, inserted };
}

const NOT_SAVED = {
  ok: false,
  message: "The budget wasn't saved. Try again.",
};
const BAD_AMOUNTS = {
  ok: false,
  message:
    "The budget wasn't saved. Correct the highlighted amounts and try again.",
};
const NOT_COPIED = {
  ok: false,
  message: "The amounts weren't copied. Try again.",
};

describe("saveBudget", () => {
  const input = { month: "2026-10", country: "US" };

  it("saves the amounts as whole minor units", async () => {
    const { store, saved } = fakeStore();

    const result = await saveBudget(store, {
      ...input,
      amounts: { "cat-a": "450.00", "cat-b": "1,200" },
    });

    expect(result).toEqual({ ok: true, notice: "Budget saved." });
    expect(saved).toEqual([
      [
        {
          month: "2026-10",
          country: "US",
          category_id: "cat-a",
          amount_minor: 45000,
        },
        {
          month: "2026-10",
          country: "US",
          category_id: "cat-b",
          amount_minor: 120000,
        },
      ],
    ]);
  });

  it("skips a blank amount that was never saved", async () => {
    const { store, saved } = fakeStore();

    await saveBudget(store, {
      ...input,
      amounts: { "cat-a": "", "cat-b": "10" },
    });

    expect(saved[0].map((row) => row.category_id)).toEqual(["cat-b"]);
  });

  it("stores 0 when a saved amount is cleared, so nothing is deleted", async () => {
    const { store, saved } = fakeStore({
      stored: {
        "2026-10:US": [{ category_id: "cat-a", amount_minor: 45000 }],
      },
    });

    await saveBudget(store, { ...input, amounts: { "cat-a": "" } });

    expect(saved[0]).toEqual([
      {
        month: "2026-10",
        country: "US",
        category_id: "cat-a",
        amount_minor: 0,
      },
    ]);
  });

  it("writes only the amounts that changed", async () => {
    const { store, saved } = fakeStore({
      stored: {
        "2026-10:US": [{ category_id: "cat-a", amount_minor: 45000 }],
      },
    });

    await saveBudget(store, {
      ...input,
      amounts: { "cat-a": "450.00", "cat-b": "10" },
    });

    expect(saved[0].map((row) => row.category_id)).toEqual(["cat-b"]);
  });

  it("writes nothing when nothing changed, and still says it's saved", async () => {
    const { store, saved } = fakeStore();

    const result = await saveBudget(store, {
      ...input,
      amounts: { "cat-a": "" },
    });

    expect(result.ok).toBe(true);
    expect(saved).toEqual([]);
  });

  it("writes in the country's own currency rules for Germany", async () => {
    const { store, saved } = fakeStore();

    await saveBudget(store, {
      month: "2026-10",
      country: "DE",
      amounts: { "cat-a": "1,234.00" },
    });

    expect(saved[0][0]).toMatchObject({ country: "DE", amount_minor: 123400 });
  });

  it.each(["-5", "abc", "1.234"])(
    "refuses the whole budget for the bad amount %j",
    async (text) => {
      const { store, saved } = fakeStore();

      const result = await saveBudget(store, {
        ...input,
        amounts: { "cat-a": "10", "cat-b": text },
      });

      expect(result).toEqual(BAD_AMOUNTS);
      expect(saved).toEqual([]);
    },
  );

  it.each([
    ["2026-13", "US"],
    ["2026-10-01", "US"],
    ["2026-10", "FR"],
  ])("refuses the month %j and country %j", async (month, country) => {
    const { store, saved } = fakeStore();

    const result = await saveBudget(store, {
      month,
      country,
      amounts: { "cat-a": "10" },
    });

    expect(result).toEqual(NOT_SAVED);
    expect(saved).toEqual([]);
  });

  it("says so when the read fails", async () => {
    const { store, saved } = fakeStore({ failRead: true });

    const result = await saveBudget(store, {
      ...input,
      amounts: { "cat-a": "10" },
    });

    expect(result).toEqual(NOT_SAVED);
    expect(saved).toEqual([]);
  });

  it("says so when the write fails", async () => {
    const { store } = fakeStore({ failWrite: true });

    const result = await saveBudget(store, {
      ...input,
      amounts: { "cat-a": "10" },
    });

    expect(result).toEqual(NOT_SAVED);
  });
});

describe("copyMonth", () => {
  const OCTOBER = [
    { category_id: "cat-a", amount_minor: 45000 },
    { category_id: "cat-b", amount_minor: 20000 },
  ];
  const input = { from: "2026-10", month: "2026-11", country: "US" };

  it("copies the amounts into the new month", async () => {
    const { store, inserted, saved } = fakeStore({
      stored: { "2026-10:US": OCTOBER },
    });

    const result = await copyMonth(store, input);

    expect(result).toEqual({
      ok: true,
      notice: "Amounts copied from October 2026.",
    });
    expect(saved).toEqual([]);
    expect(inserted).toEqual([
      [
        {
          month: "2026-11",
          country: "US",
          category_id: "cat-a",
          amount_minor: 45000,
        },
        {
          month: "2026-11",
          country: "US",
          category_id: "cat-b",
          amount_minor: 20000,
        },
      ],
    ]);
  });

  it("never overwrites an amount the month already has", async () => {
    const { store, inserted } = fakeStore({
      stored: {
        "2026-10:US": OCTOBER,
        "2026-11:US": [{ category_id: "cat-a", amount_minor: 1 }],
      },
    });

    await copyMonth(store, input);

    expect(inserted[0].map((row) => row.category_id)).toEqual(["cat-b"]);
  });

  it("copies from a later month too, so a past month can be backfilled", async () => {
    const { store, inserted } = fakeStore({
      stored: { "2026-10:US": OCTOBER },
    });

    await copyMonth(store, { ...input, month: "2026-04" });

    expect(inserted[0][0].month).toBe("2026-04");
  });

  it("refuses when the source month has no amounts", async () => {
    const { store, inserted } = fakeStore();

    expect(await copyMonth(store, input)).toEqual({
      ok: false,
      message: "October 2026 has no amounts to copy.",
    });
    expect(inserted).toEqual([]);
  });

  it.each([
    ["bad", "2026-11", "US"],
    ["2026-10", "bad", "US"],
    ["2026-10", "2026-11", "FR"],
  ])("refuses from %j to %j for %j", async (from, month, country) => {
    const { store, inserted } = fakeStore();

    expect(await copyMonth(store, { from, month, country })).toEqual(NOT_COPIED);
    expect(inserted).toEqual([]);
  });

  it("says so when a read or write fails", async () => {
    const failedRead = fakeStore({ failRead: true });
    const failedWrite = fakeStore({
      failWrite: true,
      stored: { "2026-10:US": OCTOBER },
    });

    expect(await copyMonth(failedRead.store, input)).toEqual(NOT_COPIED);
    expect(await copyMonth(failedWrite.store, input)).toEqual(NOT_COPIED);
  });
});
