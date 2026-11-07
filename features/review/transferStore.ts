import type { SupabaseClient } from "@supabase/supabase-js";
import { changedRows } from "@/lib/actionResult";
import type { TransferRow, TransferStore } from "./confirmTransfer";

/** Stored rows through Supabase. Row-level security limits them to the owner. */
export function transferStore(client: SupabaseClient): TransferStore {
  return {
    async read(ids) {
      const { data, error } = await client
        .from("transactions")
        .select("id, account_id, amount_minor, currency, type, transfer_pair_id, hidden")
        .in("id", [...ids]);
      if (error || data === null) return "failed";
      return data as TransferRow[];
    },

    /** One update, guarded like `import_transactions`, leaving out hidden rows. */
    async pair(ids, pairId) {
      const { data, error } = await client
        .from("transactions")
        .update({ type: "transfer", transfer_pair_id: pairId })
        .in("id", [...ids])
        .is("transfer_pair_id", null)
        .eq("hidden", false)
        .or("type.is.null,type.eq.transfer")
        .select("id");
      if (error || data === null) return "failed";
      return (data as { id: string }[]).map(({ id }) => id);
    },

    async restore(id, pairId, type) {
      const { data, error } = await client
        .from("transactions")
        .update({ type, transfer_pair_id: null })
        .eq("id", id)
        .eq("transfer_pair_id", pairId)
        .select("id");
      return changedRows(data, error);
    },
  };
}
