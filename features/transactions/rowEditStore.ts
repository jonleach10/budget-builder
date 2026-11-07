import type { SupabaseClient } from "@supabase/supabase-js";
import { changedRows } from "@/lib/actionResult";
import type { RowEditStore, RowState } from "./rowEdits";

/** Stored rows through Supabase. Row-level security limits them to the owner. */
export function rowEditStore(client: SupabaseClient): RowEditStore {
  return {
    async read(id) {
      const { data, error } = await client
        .from("transactions")
        .select("type, category_id, transfer_pair_id")
        .eq("id", id);
      if (error || data === null || data.length === 0) return null;
      return data[0] as RowState;
    },

    async clearPair(pairId) {
      const { data, error } = await client
        .from("transactions")
        .update({
          type: null,
          category_id: null,
          category_source: null,
          transfer_pair_id: null,
        })
        .eq("transfer_pair_id", pairId)
        .select("id");
      return changedRows(data, error);
    },

    async update(id, pairId, changes) {
      const row = client.from("transactions").update(changes).eq("id", id);
      const { data, error } = await (
        pairId === null
          ? row.is("transfer_pair_id", null)
          : row.eq("transfer_pair_id", pairId)
      ).select("id");
      return changedRows(data, error);
    },

    /**
     * A row in review isn't hidden, as in needsReview, and has no category,
     * because a deleted one is set to null.
     */
    async updateInReview(ids, type, changes) {
      const rows = client
        .from("transactions")
        .update(changes)
        .in("id", [...ids])
        .eq("hidden", false)
        .is("category_id", null)
        .is("transfer_pair_id", null);
      const { data, error } = await (
        type === null ? rows.is("type", null) : rows.eq("type", type)
      ).select("id");
      if (error || data === null) return "failed";
      return data.length;
    },
  };
}
