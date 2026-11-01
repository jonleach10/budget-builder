import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetStore, StoredAmount } from "./budgetChanges";

const PRIMARY_KEY = "user_id,month,country,category_id";

/**
 * Budget amounts through Supabase. Row-level security limits them to the owner,
 * and the schema fills in user_id. One month and country holds one row per
 * category, so a read here can't reach Supabase's page size.
 */
export function budgetStore(client: SupabaseClient): BudgetStore {
  return {
    async amounts(month, country) {
      const { data, error } = await client
        .from("budget_amounts")
        .select("category_id, amount_minor")
        .eq("month", month)
        .eq("country", country);
      return error ? null : (data as StoredAmount[]);
    },

    async save(rows) {
      const { error } = await client
        .from("budget_amounts")
        .upsert(rows, { onConflict: PRIMARY_KEY });
      return error ? "failed" : "done";
    },

    async insertMissing(rows) {
      const { error } = await client
        .from("budget_amounts")
        .upsert(rows, { onConflict: PRIMARY_KEY, ignoreDuplicates: true });
      return error ? "failed" : "done";
    },
  };
}
