import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { categoryStore, loadCategories } from "./categoryStore";

type Reply = {
  data?: unknown;
  count?: number | null;
  error?: { code: string } | null;
};

/** Answers each table with a canned reply and records the filters it was given. */
function fakeClient(replies: Readonly<Record<string, Reply>>) {
  const filters: Record<string, string[]> = {};

  function from(table: string) {
    const reply = { data: null, count: null, error: null, ...replies[table] };
    const filtered = (text: string) => {
      (filters[table] ??= []).push(text);
      return builder;
    };
    const builder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      eq: (column: string, value: string) => filtered(`${column}=${value}`),
      or: (text: string) => filtered(text),
      then: (resolve: (value: typeof reply) => unknown) => resolve(reply),
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, filters };
}

const COUNTS = {
  transactions: { count: 3 },
  rules: { count: 2 },
  budget_amounts: { count: 1 },
};

describe("categoryStore usage", () => {
  it("counts each table for the category", async () => {
    const { client, filters } = fakeClient(COUNTS);

    expect(await categoryStore(client).usage("cat-1")).toEqual({
      transactions: 3,
      rules: 2,
      budgetAmounts: 1,
    });
    expect(filters.rules).toEqual(["category_id=cat-1"]);
    expect(filters.budget_amounts).toEqual(["category_id=cat-1"]);
  });

  it("counts a transaction that only suggests the category", async () => {
    const { client, filters } = fakeClient(COUNTS);

    await categoryStore(client).usage("cat-1");

    expect(filters.transactions).toEqual([
      "category_id.eq.cat-1,suggested_category_id.eq.cat-1",
    ]);
  });

  it("keeps a zero count as zero", async () => {
    const { client } = fakeClient({
      transactions: { count: 0 },
      rules: { count: 0 },
      budget_amounts: { count: 0 },
    });

    expect(await categoryStore(client).usage("cat-1")).toEqual({
      transactions: 0,
      rules: 0,
      budgetAmounts: 0,
    });
  });

  it.each(["transactions", "rules", "budget_amounts"])(
    "is unknown, not zero, when counting %s fails",
    async (table) => {
      const { client } = fakeClient({
        ...COUNTS,
        [table]: { count: null, error: { code: "57014" } },
      });

      expect(await categoryStore(client).usage("cat-1")).toBeNull();
    },
  );
});

describe("categoryStore writes", () => {
  const CATEGORY = { name: "Pets", position: 1 };

  it("reports a repeated name on insert", async () => {
    const { client } = fakeClient({
      categories: { error: { code: "23505" } },
    });

    expect(await categoryStore(client).insert(CATEGORY)).toBe("duplicate");
  });

  it("reports a repeated name on update", async () => {
    const { client } = fakeClient({
      categories: { error: { code: "23505" } },
    });

    expect(await categoryStore(client).update("cat-1", CATEGORY)).toBe(
      "duplicate",
    );
  });

  it("reports any other error as a failure", async () => {
    const { client } = fakeClient({
      categories: { error: { code: "42501" } },
    });

    expect(await categoryStore(client).insert(CATEGORY)).toBe("failed");
  });

  it("reports an update that matched no row", async () => {
    const { client } = fakeClient({ categories: { data: [] } });

    expect(await categoryStore(client).update("cat-1", CATEGORY)).toBe(
      "missing",
    );
  });

  it("reports a delete that removed a row", async () => {
    const { client, filters } = fakeClient({
      categories: { data: [{ id: "cat-1" }] },
    });

    expect(await categoryStore(client).remove("cat-1")).toBe("done");
    expect(filters.categories).toEqual(["id=cat-1"]);
  });
});

describe("loadCategories", () => {
  it("returns categories in position order", async () => {
    const { client } = fakeClient({
      categories: {
        data: [
          { id: "b", name: "Dining", position: 1 },
          { id: "a", name: "Groceries", position: 0 },
        ],
      },
    });

    const rows = await loadCategories(client);

    expect(rows?.map(({ name }) => name)).toEqual(["Groceries", "Dining"]);
  });

  it("is null when the read fails, so a screen can't show an empty list", async () => {
    const { client } = fakeClient({
      categories: { error: { code: "57014" } },
    });

    expect(await loadCategories(client)).toBeNull();
  });
});
