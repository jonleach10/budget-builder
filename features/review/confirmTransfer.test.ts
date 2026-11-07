import { describe, expect, it } from "vitest";
import {
  confirmTransfer,
  type TransferRow,
  type TransferStore,
} from "./confirmTransfer";

const PAIR_ID = "pair-new";

const CHANGED = {
  ok: false,
  message:
    "One of these rows has changed, so this transfer wasn't saved. Check the rows, then try again.",
};

function stored(id: string, extra: Partial<TransferRow> = {}): TransferRow {
  return {
    id,
    account_id: id === "out" ? "acc-checking" : "acc-savings",
    amount_minor: id === "out" ? -50000 : 50000,
    currency: "USD",
    type: null,
    transfer_pair_id: null,
    hidden: false,
    ...extra,
  };
}

const NOT_SAVED = { ok: false, message: "This transfer wasn't saved. Try again." };

const NOT_ONE_TRANSFER = {
  ok: false,
  message:
    "These rows can't be one transfer. Select two rows on different accounts, with the same amount going out and coming in.",
};

/**
 * Stored rows in memory, guarded the way the database's update is. `beforePair`
 * changes rows between the read and the write, as another tab could.
 */
function memoryStore(
  rows: TransferRow[],
  { beforePair = () => {} }: { beforePair?: (rows: TransferRow[]) => void } = {},
) {
  const calls: string[] = [];
  const store: TransferStore = {
    async read(ids) {
      calls.push("read");
      return rows.filter(({ id }) => ids.includes(id)).map((row) => ({ ...row }));
    },
    async pair(ids, pairId) {
      calls.push("pair");
      beforePair(rows);
      const open = rows.filter(
        (row) =>
          ids.includes(row.id) &&
          row.transfer_pair_id === null &&
          (row.type === null || row.type === "transfer") &&
          !row.hidden,
      );
      for (const row of open) {
        row.type = "transfer";
        row.transfer_pair_id = pairId;
      }
      return open.map(({ id }) => id);
    },
    async restore(id, pairId, type) {
      calls.push("restore");
      const row = rows.find((each) => each.id === id && each.transfer_pair_id === pairId);
      if (row === undefined) return "missing";
      row.type = type;
      row.transfer_pair_id = null;
      return "done";
    },
  };
  return { store, rows, calls };
}

function confirm(store: TransferStore, ids: unknown = ["out", "in"]) {
  return confirmTransfer(store, ids as string[], () => PAIR_ID);
}

describe("confirmTransfer", () => {
  it("gives both rows one pair ID and the transfer type", async () => {
    const { store, rows } = memoryStore([stored("out"), stored("in")]);

    const result = await confirm(store);

    expect(result).toEqual({ ok: true, notice: "The rows are marked as a transfer." });
    expect(rows).toEqual([
      expect.objectContaining({ id: "out", type: "transfer", transfer_pair_id: PAIR_ID }),
      expect.objectContaining({ id: "in", type: "transfer", transfer_pair_id: PAIR_ID }),
    ]);
  });

  it.each<[string, Partial<TransferRow>]>([
    ["paired", { type: "transfer", transfer_pair_id: "pair-old" }],
    ["given another type", { type: "income" }],
    ["hidden", { hidden: true }],
    ["deleted", { id: "gone" }],
  ])("refuses a row %s since the inbox loaded, and writes nothing", async (_name, change) => {
    const { store, calls } = memoryStore([stored("out"), stored("in", change)]);

    const result = await confirm(store);

    expect(result).toEqual(CHANGED);
    expect(calls).toEqual(["read"]);
  });

  it.each<[string, Partial<TransferRow>]>([
    ["on the same account", { account_id: "acc-checking" }],
    ["in another currency", { currency: "EUR" }],
    ["with an amount that isn't the opposite", { amount_minor: 49999 }],
    ["moving the same way", { amount_minor: -50000 }],
  ])("refuses two rows %s, and writes nothing", async (_name, change) => {
    const { store, calls } = memoryStore([stored("out"), stored("in", change)]);

    const result = await confirm(store);

    expect(result).toEqual(NOT_ONE_TRANSFER);
    expect(calls).toEqual(["read"]);
  });

  it.each<[string, unknown]>([
    ["one row", ["out"]],
    ["three rows", ["out", "in", "third"]],
    ["the same row twice", ["out", "out"]],
    ["an ID that isn't text", ["out", 7]],
    ["an empty ID", ["out", ""]],
    ["IDs that aren't a list", "out,in"],
  ])("refuses %s before reading anything", async (_name, ids) => {
    const { store, calls } = memoryStore([stored("out"), stored("in")]);

    await expect(confirm(store, ids)).resolves.toEqual(NOT_SAVED);
    expect(calls).toEqual([]);
  });

  it("saves nothing when the read fails", async () => {
    const { store, calls } = memoryStore([stored("out"), stored("in")]);
    store.read = async () => "failed";

    await expect(confirm(store)).resolves.toEqual(NOT_SAVED);
    expect(calls).toEqual([]);
  });

  it("says nothing was saved when the update fails", async () => {
    const { store } = memoryStore([stored("out"), stored("in")]);
    store.pair = async () => "failed";

    await expect(confirm(store)).resolves.toEqual(NOT_SAVED);
  });

  describe("a row that changes between the read and the update", () => {
    it("takes the other row back out of the pair, with its old type", async () => {
      const { store, rows, calls } = memoryStore(
        [stored("out", { type: "transfer" }), stored("in")],
        { beforePair: (current) => (current[1].type = "income") },
      );

      const result = await confirm(store);

      expect(result).toEqual(CHANGED);
      expect(calls).toEqual(["read", "pair", "restore"]);
      expect(rows).toEqual([
        expect.objectContaining({ id: "out", type: "transfer", transfer_pair_id: null }),
        expect.objectContaining({ id: "in", type: "income", transfer_pair_id: null }),
      ]);
    });

    it("needs nothing undone when neither row was written", async () => {
      const { store, calls } = memoryStore([stored("out"), stored("in")], {
        beforePair: (current) => {
          for (const row of current) row.hidden = true;
        },
      });

      await expect(confirm(store)).resolves.toEqual(CHANGED);
      expect(calls).toEqual(["read", "pair"]);
    });

    it("says where to undo a row it couldn't take back out", async () => {
      const { store } = memoryStore([stored("out"), stored("in")], {
        beforePair: (current) => (current[1].type = "income"),
      });
      store.restore = async () => "failed";

      await expect(confirm(store)).resolves.toEqual({
        ok: false,
        message:
          "One of these rows has changed, and the other was marked as a transfer on its own. Change its type in Transactions to undo it.",
      });
    });
  });

  it("refuses two rows of zero", async () => {
    const { store } = memoryStore([
      stored("out", { amount_minor: 0 }),
      stored("in", { amount_minor: 0 }),
    ]);

    await expect(confirm(store)).resolves.toEqual(NOT_ONE_TRANSFER);
  });
});
