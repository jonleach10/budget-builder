import { serverClient } from "@/features/auth/requireSession";
import {
  orNull,
  readAccounts,
  readCategories,
} from "@/features/budget/loadScreens";
import { readStoredTransactions } from "@/features/import/storedTransactions";
import { buildReviewInbox, type ReviewInbox } from "./reviewInbox";

/**
 * Reads every stored row, because review isn't bound to a month and past
 * categories learn from all of them.
 */
export async function loadReviewInbox(
  thisMonth: string,
): Promise<ReviewInbox | null> {
  return orNull(async () => {
    const client = await serverClient();
    const [rows, accounts, categories] = await Promise.all([
      readStoredTransactions(client),
      readAccounts(client),
      readCategories(client),
    ]);
    return buildReviewInbox({ rows, accounts, categories, thisMonth });
  });
}
