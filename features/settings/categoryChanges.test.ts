import { describe, expect, it, vi } from "vitest";
import type { CategoryRow, CategoryUsage } from "./categories";
import {
  addCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  type CategoryStore,
} from "./categoryChanges";

const GROCERIES: CategoryRow = {
  id: "cat-groceries",
  name: "Groceries",
  position: 0,
};
const PETS: CategoryRow = { id: "cat-pets", name: "Pets", position: 4 };

const UNUSED: CategoryUsage = { transactions: 0, rules: 0, budgetAmounts: 0 };

function fakeStore(
  rows: readonly CategoryRow[] | null = [GROCERIES, PETS],
  usage: CategoryUsage | null = UNUSED,
) {
  return {
    list: vi.fn(async () => rows),
    usage: vi.fn(async () => usage),
    insert: vi.fn<CategoryStore["insert"]>(async () => "done"),
    update: vi.fn<CategoryStore["update"]>(async () => "done"),
    remove: vi.fn<CategoryStore["remove"]>(async () => "done"),
  } satisfies CategoryStore;
}

const NOT_SAVED = {
  ok: false,
  message: "The category wasn't saved. Try again.",
};
const NOT_DELETED = {
  ok: false,
  message: "The category wasn't deleted. Try again.",
};
const GONE = {
  ok: false,
  message:
    "This category no longer exists. Reload the page to see the current list.",
};
const DUPLICATE = {
  ok: false,
  message: "A category with this name already exists. Enter a different name.",
};

describe("addCategory", () => {
  it("stores the trimmed name at the end of the list", async () => {
    const store = fakeStore();

    expect(await addCategory(store, "  Travel ")).toEqual({ ok: true });
    expect(store.insert).toHaveBeenCalledWith({ name: "Travel", position: 5 });
  });

  it("refuses a blank name without writing", async () => {
    const store = fakeStore();

    expect(await addCategory(store, "  ")).toEqual({
      ok: false,
      message: "Enter a category name.",
    });
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("refuses a duplicate name without writing", async () => {
    const store = fakeStore();

    expect(await addCategory(store, "pets")).toEqual(DUPLICATE);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("gives the same message when the database catches a duplicate", async () => {
    const store = fakeStore();
    store.insert.mockResolvedValue("duplicate");

    expect(await addCategory(store, "Travel")).toEqual(DUPLICATE);
  });

  it("reports a failed read without writing", async () => {
    const store = fakeStore(null);

    expect(await addCategory(store, "Travel")).toEqual(NOT_SAVED);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("reports a failed write", async () => {
    const store = fakeStore();
    store.insert.mockResolvedValue("failed");

    expect(await addCategory(store, "Travel")).toEqual(NOT_SAVED);
  });
});

describe("renameCategory", () => {
  it("stores the trimmed name", async () => {
    const store = fakeStore();

    expect(await renameCategory(store, PETS.id, " Animals ")).toEqual({
      ok: true,
    });
    expect(store.update).toHaveBeenCalledWith(PETS.id, { name: "Animals" });
  });

  it("refuses another category's name without writing", async () => {
    const store = fakeStore();

    expect(await renameCategory(store, PETS.id, "Groceries")).toEqual(DUPLICATE);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("gives the same message when the database catches a duplicate", async () => {
    const store = fakeStore();
    store.update.mockResolvedValue("duplicate");

    expect(await renameCategory(store, PETS.id, "Animals")).toEqual(DUPLICATE);
  });

  it("says so when the category is gone", async () => {
    const store = fakeStore();

    expect(await renameCategory(store, "missing", "Animals")).toEqual(GONE);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("reports a failed read", async () => {
    expect(await renameCategory(fakeStore(null), PETS.id, "Animals")).toEqual(
      NOT_SAVED,
    );
  });

  it("reports a failed write", async () => {
    const store = fakeStore();
    store.update.mockResolvedValue("failed");

    expect(await renameCategory(store, PETS.id, "Animals")).toEqual(NOT_SAVED);
  });
});

describe("moveCategory", () => {
  it("writes the new positions", async () => {
    const store = fakeStore();

    expect(await moveCategory(store, PETS.id, "up")).toEqual({ ok: true });
    expect(store.update.mock.calls).toEqual([
      [PETS.id, { position: 0 }],
      [GROCERIES.id, { position: 1 }],
    ]);
  });

  it("writes nothing at the end of the list", async () => {
    const store = fakeStore();

    await moveCategory(store, GROCERIES.id, "up");

    expect(store.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown direction without reading", async () => {
    const store = fakeStore();

    expect(await moveCategory(store, PETS.id, "sideways")).toEqual(NOT_SAVED);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("says so when the category is gone", async () => {
    expect(await moveCategory(fakeStore(), "missing", "up")).toEqual(GONE);
  });

  it("stops at the first failed write", async () => {
    const store = fakeStore();
    store.update.mockResolvedValue("failed");

    expect(await moveCategory(store, PETS.id, "up")).toEqual(NOT_SAVED);
    expect(store.update).toHaveBeenCalledTimes(1);
  });
});

describe("deleteCategory", () => {
  it("deletes a category nothing uses and says so", async () => {
    const store = fakeStore();

    expect(await deleteCategory(store, PETS.id)).toEqual({
      ok: true,
      notice: "Pets deleted.",
    });
    expect(store.usage).toHaveBeenCalledWith(PETS.id);
    expect(store.remove).toHaveBeenCalledWith(PETS.id);
  });

  it.each([
    ["a transaction", { ...UNUSED, transactions: 1 }],
    ["a rule", { ...UNUSED, rules: 1 }],
    ["a budget amount", { ...UNUSED, budgetAmounts: 1 }],
  ])("refuses when it has %s, without deleting", async (_use, usage) => {
    const store = fakeStore([PETS], usage);

    const result = await deleteCategory(store, PETS.id);

    expect(result).toMatchObject({ ok: false });
    expect(result).toHaveProperty(
      "message",
      expect.stringContaining("This category can't be deleted"),
    );
    expect(JSON.stringify(result)).not.toContain(PETS.name);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("deletes nothing if the counts can't be read", async () => {
    const store = fakeStore([PETS], null);

    expect(await deleteCategory(store, PETS.id)).toEqual(NOT_DELETED);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("deletes nothing if the list can't be read", async () => {
    const store = fakeStore(null);

    expect(await deleteCategory(store, PETS.id)).toEqual(NOT_DELETED);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("says so when the category is gone", async () => {
    const store = fakeStore();

    expect(await deleteCategory(store, "missing")).toEqual(GONE);
    expect(store.usage).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("says so when the category goes while deleting", async () => {
    const store = fakeStore();
    store.remove.mockResolvedValue("missing");

    expect(await deleteCategory(store, PETS.id)).toEqual(GONE);
  });

  it("reports a failed delete", async () => {
    const store = fakeStore();
    store.remove.mockResolvedValue("failed");

    expect(await deleteCategory(store, PETS.id)).toEqual(NOT_DELETED);
  });
});
