import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { RuleRow } from "./rules";
import { loadRulesScreen, ruleStore } from "./ruleStore";

type Reply = { data?: unknown; error?: { code: string } | null };

function fakeClient(replies: Readonly<Record<string, Reply>>) {
  function from(table: string) {
    const reply = { data: null, error: null, ...replies[table] };
    const builder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      eq: () => builder,
      then: (resolve: (value: typeof reply) => unknown) => resolve(reply),
    };
    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

const RULE: RuleRow = {
  id: "rule-1",
  match_on: "ppdId",
  value: "000111222",
  position: 0,
  type: "income",
  category_id: null,
};

describe("ruleStore", () => {
  it("is null, not empty, when the read fails", async () => {
    const client = fakeClient({ rules: { error: { code: "57014" } } });

    expect(await ruleStore(client).list()).toBeNull();
  });

  it("reports an update that matched no row", async () => {
    const client = fakeClient({ rules: { data: [] } });

    expect(await ruleStore(client).update("rule-1", { position: 1 })).toBe(
      "missing",
    );
  });

  it("reports a failed delete", async () => {
    const client = fakeClient({ rules: { error: { code: "42501" } } });

    expect(await ruleStore(client).remove("rule-1")).toBe("failed");
  });
});

describe("loadRulesScreen", () => {
  it("lists categories in position order for the rule form", async () => {
    const client = fakeClient({
      rules: { data: [RULE] },
      categories: {
        data: [
          { id: "b", name: "Dining", position: 1 },
          { id: "a", name: "Groceries", position: 0 },
        ],
      },
    });

    const screen = await loadRulesScreen(client);

    expect(screen?.idRules.map(({ id }) => id)).toEqual(["rule-1"]);
    expect(screen?.categories.map(({ name }) => name)).toEqual([
      "Groceries",
      "Dining",
    ]);
  });

  it.each(["rules", "categories"])(
    "is null when reading %s fails",
    async (table) => {
      const client = fakeClient({
        rules: { data: [] },
        categories: { data: [] },
        [table]: { error: { code: "57014" } },
      });

      expect(await loadRulesScreen(client)).toBeNull();
    },
  );
});
