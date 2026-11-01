import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { changedRows } from "@/lib/actionResult";
import { inPositionOrder } from "@/lib/ordering";
import type { CategoryRow } from "./categories";
import type { CategoryStore } from "./categoryChanges";

const COUNT_ONLY = { count: "exact", head: true } as const;
const UNIQUE_VIOLATION = "23505";

function isDuplicate(error: PostgrestError | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

/** Categories through Supabase. Row-level security limits them to the owner. */
export function categoryStore(client: SupabaseClient): CategoryStore {
  return {
    async list() {
      const { data, error } = await client
        .from("categories")
        .select("id, name, position");
      return error ? null : (data as CategoryRow[]);
    },

    /**
     * Counts rather than reads, because transactions and budget amounts can
     * pass Supabase's page size. A suggestion counts as use, because deleting
     * the category would clear it. The id comes from a stored row, so it's safe
     * inside the filter text.
     */
    async usage(id) {
      const [transactions, rules, budgetAmounts] = await Promise.all([
        client
          .from("transactions")
          .select("id", COUNT_ONLY)
          .or(`category_id.eq.${id},suggested_category_id.eq.${id}`),
        client.from("rules").select("id", COUNT_ONLY).eq("category_id", id),
        client
          .from("budget_amounts")
          .select("category_id", COUNT_ONLY)
          .eq("category_id", id),
      ]);

      if (
        transactions.count === null ||
        rules.count === null ||
        budgetAmounts.count === null
      ) {
        return null;
      }
      return {
        transactions: transactions.count,
        rules: rules.count,
        budgetAmounts: budgetAmounts.count,
      };
    },

    async insert(category) {
      const { error } = await client.from("categories").insert(category);
      if (isDuplicate(error)) return "duplicate";
      return error ? "failed" : "done";
    },

    async update(id, changes) {
      const { data, error } = await client
        .from("categories")
        .update(changes)
        .eq("id", id)
        .select("id");
      return isDuplicate(error) ? "duplicate" : changedRows(data, error);
    },

    async remove(id) {
      const { data, error } = await client
        .from("categories")
        .delete()
        .eq("id", id)
        .select("id");
      return changedRows(data, error);
    },
  };
}

/** Null means the read failed, so a screen doesn't claim there are none. */
export async function loadCategories(
  client: SupabaseClient,
): Promise<CategoryRow[] | null> {
  const rows = await categoryStore(client).list();
  return rows === null ? null : inPositionOrder(rows);
}
