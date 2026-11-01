import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCategories } from "@/features/settings/categoryStore";
import { changedRows } from "@/lib/actionResult";
import type { RuleStore } from "./ruleChanges";
import { rulesScreen, type RulesScreenData, type RuleRow } from "./rules";

const COLUMNS = "id, match_on, value, position, type, category_id";

/** Rules through Supabase. Row-level security limits them to the owner. */
export function ruleStore(client: SupabaseClient): RuleStore {
  return {
    async list() {
      const { data, error } = await client.from("rules").select(COLUMNS);
      return error ? null : (data as RuleRow[]);
    },

    async insert(rule) {
      const { error } = await client.from("rules").insert(rule);
      return error ? "failed" : "done";
    },

    async update(id, changes) {
      const { data, error } = await client
        .from("rules")
        .update(changes)
        .eq("id", id)
        .select("id");
      return changedRows(data, error);
    },

    async remove(id) {
      const { data, error } = await client
        .from("rules")
        .delete()
        .eq("id", id)
        .select("id");
      return changedRows(data, error);
    },
  };
}

/** Null means a read failed, so the screen doesn't claim there are no rules. */
export async function loadRulesScreen(
  client: SupabaseClient,
): Promise<RulesScreenData | null> {
  const [rows, categories] = await Promise.all([
    ruleStore(client).list(),
    loadCategories(client),
  ]);
  if (rows === null || categories === null) return null;

  return rulesScreen(rows, categories);
}
