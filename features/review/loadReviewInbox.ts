import type { SupabaseClient } from "@supabase/supabase-js";
import { serverClient } from "@/features/auth/requireSession";
import {
  orNull,
  readAccounts,
  readCategories,
  readPairingAccounts,
} from "@/features/budget/loadScreens";
import { readStoredTransactions } from "@/features/import/storedTransactions";
import { buildReviewInbox, type ReviewInbox, type ReviewSource } from "./reviewInbox";

/**
 * Reads every stored row, because review isn't bound to a month and past
 * categories learn from all of them. Throws if any read fails.
 */
export async function readReviewSource(
  client: SupabaseClient,
  thisMonth: string,
): Promise<ReviewSource> {
  const [rows, accounts, pairingAccounts, categories] = await Promise.all([
    readStoredTransactions(client),
    readAccounts(client),
    readPairingAccounts(client),
    readCategories(client),
  ]);
  return { rows, accounts, pairingAccounts, categories, thisMonth };
}

export async function loadReviewInbox(
  thisMonth: string,
): Promise<ReviewInbox | null> {
  return orNull(async () =>
    buildReviewInbox(await readReviewSource(await serverClient(), thisMonth)),
  );
}
