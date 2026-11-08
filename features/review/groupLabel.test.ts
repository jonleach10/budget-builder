import { describe, expect, it } from "vitest";
import type {
  RowChanges,
  RowEditStore,
} from "@/features/transactions/rowEdits";
import type { TransactionLine } from "@/features/transactions/transactionsScreenData";
import { checkGroupLabel, groupLabelStart, labelGroup } from "./groupLabel";

type FakeRow = { type: "spending" | null; inReview: boolean };

/**
 * Rows by ID, as `updateInReview` sees them: it lands only on rows still in
 * review that hold the type asked for. It keeps every write it was sent.
 */
function fakeStore(rows: Record<string, FakeRow>, failFrom = Infinity) {
  const writes: { ids: string[]; type: "spending" | null; changes: RowChanges }[] = [];
  const store: RowEditStore = {
    read: async () => null,
    clearPair: async () => "failed",
    update: async () => "failed",
    undoSort: async () => "failed",
    async updateInReview(ids, type, changes) {
      if (writes.length >= failFrom) return "failed";
      writes.push({ ids: [...ids], type, changes });
      return ids.filter((id) => rows[id]?.inReview && rows[id].type === type);
    },
  };
  return { store, writes };
}

const IN_REVIEW: FakeRow = { type: null, inReview: true };

describe("Change All", () => {
  it("sends only the label, to the group's rows in review, and says how many got it", async () => {
    const { store, writes } = fakeStore({
      a: IN_REVIEW,
      b: { type: "spending", inReview: true },
      c: IN_REVIEW,
    });

    const result = await labelGroup(store, ["a", "b", "c"], "  Corner Market  ");

    expect(result).toEqual({
      ok: true,
      notice: "The label was saved on 3 rows.",
      saved: 3,
      total: 3,
    });
    expect(writes).toEqual([
      { ids: ["a", "b", "c"], type: "spending", changes: { note: "Corner Market" } },
      { ids: ["a", "b", "c"], type: null, changes: { note: "Corner Market" } },
    ]);
  });

  it("clears the label on every row when it's blank", async () => {
    const { store, writes } = fakeStore({ a: IN_REVIEW, b: IN_REVIEW });

    const result = await labelGroup(store, ["a", "b"], "   ");

    expect(result).toEqual({
      ok: true,
      notice: "The label was cleared on 2 rows.",
      saved: 2,
      total: 2,
    });
    expect(writes.map(({ changes }) => changes)).toEqual([
      { note: null },
      { note: null },
    ]);
  });

  it("leaves rows that left review since the inbox loaded, and says so", async () => {
    const decided: FakeRow = { type: "spending", inReview: false };
    const { store } = fakeStore({ a: IN_REVIEW, b: decided, c: IN_REVIEW });

    await expect(labelGroup(store, ["a", "b", "c"], "Pharmacy")).resolves.toEqual({
      ok: true,
      notice:
        "The label was saved on 2 rows. 1 row had already left review, so it was left as it is.",
      saved: 2,
      total: 3,
    });
    const two = fakeStore({ a: IN_REVIEW, b: decided, c: decided });
    await expect(labelGroup(two.store, ["a", "b", "c"], "Pharmacy")).resolves.toMatchObject({
      notice:
        "The label was saved on 1 row. 2 rows had already left review, so they were left as they are.",
    });
  });

  it("says none were saved when every row has left review", async () => {
    const { store } = fakeStore({ a: { type: "spending", inReview: false } });

    await expect(labelGroup(store, ["a"], "Pharmacy")).resolves.toEqual({
      ok: false,
      message: "These rows have changed, so none were saved. Check the rows, then try again.",
    });
  });

  it("names Change All, not Accept, when a batch fails partway", async () => {
    const ids = ["a", "b", "c"];
    const { store } = fakeStore({ a: IN_REVIEW, b: IN_REVIEW, c: IN_REVIEW }, 2);

    await expect(labelGroup(store, ids, "Pharmacy", 2)).resolves.toEqual({
      ok: false,
      message:
        "The label was saved on 2 of 3 rows. Click Change All again to finish.",
    });
  });

  it("says nothing was saved when the first write fails", async () => {
    const { store } = fakeStore({ a: IN_REVIEW, b: IN_REVIEW }, 0);

    await expect(labelGroup(store, ["a", "b"], "Pharmacy")).resolves.toEqual({
      ok: false,
      message: "These rows weren't saved. Try again.",
    });
  });

  it("refuses a label that isn't text, and writes nothing", async () => {
    const { store, writes } = fakeStore({ a: IN_REVIEW });

    const result = await labelGroup(store, ["a"], 42 as unknown as string);

    expect(result.ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("refuses a call with no label at all, before any write", async () => {
    const { store, writes } = fakeStore({ "row-1": IN_REVIEW, "row-2": IN_REVIEW });

    const result = await labelGroup(store, ["row-1", "row-2"], undefined as unknown as string);

    expect(result).toEqual({ ok: false, message: "These rows weren't saved. Try again." });
    expect(writes).toEqual([]);
  });
});

let nextLine = 0;

/** A row in the group, with the label it holds now, if any. */
function line(label: string | null = null): TransactionLine {
  nextLine += 1;
  return {
    id: `t${nextLine}`,
    date: "Oct 3",
    title: label ?? "SAMPLE PHARMACY",
    bankText: label === null ? null : "SAMPLE PHARMACY",
    purpose: null,
    bankType: null,
    bankCategory: null,
    accountId: "acc-us",
    account: "Joint Checking",
    type: null,
    typeLabel: null,
    categoryId: null,
    category: null,
    amount: "-$18.00",
    original: null,
    needsReview: true,
    paired: false,
    pairedWith: null,
    hidden: false,
  };
}

describe("the Change All dialog", () => {
  it("starts with the label every row shares, or blank", () => {
    expect(groupLabelStart([line("Pharmacy"), line("Pharmacy")])).toBe("Pharmacy");
    expect(groupLabelStart([line("Pharmacy"), line()])).toBe("");
    expect(groupLabelStart([line("Pharmacy"), line("Drugstore")])).toBe("");
    expect(groupLabelStart([line(), line()])).toBe("");
  });

  it("says how many rows already hold a different label before saving", () => {
    const rows = [line(), line("Drugstore"), line("Pharmacy"), line("Old name")];

    expect(checkGroupLabel(rows, " Pharmacy ")).toEqual({
      warning: "2 rows already have a different label. Saving replaces them.",
      canSave: true,
      saveText: "Save Label",
    });
    expect(checkGroupLabel(rows.slice(0, 3), "Pharmacy").warning).toBe(
      "1 row already has a different label. Saving replaces it.",
    );
  });

  it("says nothing more when no row holds a different label", () => {
    expect(checkGroupLabel([line(), line("Pharmacy")], "Pharmacy")).toEqual({
      warning: null,
      canSave: true,
      saveText: "Save Label",
    });
  });

  it("says a blank label clears every row's label", () => {
    expect(checkGroupLabel([line(), line("Pharmacy")], "  ")).toEqual({
      warning: "The label is blank, so saving clears the label on every row in this group.",
      canSave: true,
      saveText: "Clear Labels",
    });
  });

  it("can't save a blank label when no row has one to clear", () => {
    expect(checkGroupLabel([line(), line()], "")).toEqual({
      warning: null,
      canSave: false,
      saveText: "Save Label",
    });
  });
});
