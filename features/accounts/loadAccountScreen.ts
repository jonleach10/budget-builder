import type { SupabaseClient } from "@supabase/supabase-js";
import { serverClient } from "@/features/auth/requireSession";
import {
  orNull,
  readCategories,
  TRANSACTION_COLUMNS,
} from "@/features/budget/loadScreens";
import type { TransactionRow } from "@/features/budget/rows";
import { readAllRows, type RowQuery } from "@/lib/readAllRows";
import {
  buildAccountScreen,
  chooseAccount,
  type AccountRecord,
  type AccountScreenData,
} from "./accountScreenData";

function readAccountRecords(client: SupabaseClient): Promise<AccountRecord[]> {
  return readAllRows(
    () =>
      client
        .from("accounts")
        .select(
          "id, name, last_four, country, currency",
        ) as unknown as RowQuery<AccountRecord>,
    ["id"],
  );
}

/** Every row the account has, so the page can tell an account with none. */
function readAccountRows(
  client: SupabaseClient,
  accountId: string,
): Promise<TransactionRow[]> {
  return readAllRows(
    () =>
      client
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("account_id", accountId) as unknown as RowQuery<TransactionRow>,
    ["id"],
  );
}

/** Gives null if the screen can't be built, so it never claims an account is empty. */
export async function loadAccountScreen(
  accountId: string | null,
  today: string,
): Promise<AccountScreenData | null> {
  return orNull(async () => {
    const client = await serverClient();
    const [accounts, categories] = await Promise.all([
      readAccountRecords(client),
      readCategories(client),
    ]);
    const account = chooseAccount(accounts, accountId);
    const rows =
      account === null ? [] : await readAccountRows(client, account.id);

    return buildAccountScreen({
      accounts,
      accountId,
      rows,
      categories,
      period: "last-3-months",
      today,
    });
  });
}
