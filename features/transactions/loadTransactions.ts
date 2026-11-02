import { serverClient } from "@/features/auth/requireSession";
import {
  orNull,
  readAccounts,
  readCategories,
} from "@/features/budget/loadScreens";
import { addMonths } from "@/features/budget/months";
import { addDays } from "@/features/fx/dates";
import { readStoredTransactions } from "@/features/import/storedTransactions";
import {
  buildTransactionsScreen,
  type TransactionsScreenData,
} from "./transactionsScreenData";

/** The reader's dates include both ends, so this ends on the month's last day. */
export function monthRange(month: string): { from: string; to: string } {
  return {
    from: `${month}-01`,
    to: addDays(`${addMonths(month, 1)}-01`, -1),
  };
}

export async function loadTransactionsScreen(
  month: string,
): Promise<TransactionsScreenData | null> {
  return orNull(async () => {
    const client = await serverClient();
    const [rows, accounts, categories] = await Promise.all([
      readStoredTransactions(client, monthRange(month)),
      readAccounts(client),
      readCategories(client),
    ]);
    return buildTransactionsScreen({ rows, accounts, categories });
  });
}
