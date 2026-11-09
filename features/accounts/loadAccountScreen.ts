import type { SupabaseClient } from "@supabase/supabase-js";
import { serverClient } from "@/features/auth/requireSession";
import {
  orNull,
  readCategories,
  TRANSACTION_COLUMNS,
} from "@/features/budget/loadScreens";
import { readAllRows, type RowQuery } from "@/lib/readAllRows";
import {
  buildAccountScreen,
  chooseAccount,
  type AccountRecord,
  type AccountScreenData,
  type AccountTransactionRow,
} from "./accountScreenData";
import type { PeriodChoice } from "./period";

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

/** The columns an `AccountTransactionRow` holds: the merchant key's fields too. */
const ACCOUNT_ROW_COLUMNS = `${TRANSACTION_COLUMNS}, ppd_id, ordering_party_id`;

/** Every row the account has, so the page can tell an account with none. */
function readAccountRows(
  client: SupabaseClient,
  accountId: string,
): Promise<AccountTransactionRow[]> {
  return readAllRows(
    () =>
      client
        .from("transactions")
        .select(ACCOUNT_ROW_COLUMNS)
        .eq("account_id", accountId) as unknown as RowQuery<AccountTransactionRow>,
    ["id"],
  );
}

/**
 * Gives null if the screen can't be built, so it never claims an account is empty.
 * It reads every row the account has, since the period before and All Months need
 * months outside the period.
 */
export async function loadAccountScreen(
  accountId: string | null,
  period: PeriodChoice,
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
      period,
      today,
    });
  });
}
