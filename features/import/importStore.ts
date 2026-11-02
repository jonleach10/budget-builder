import type { SupabaseClient } from "@supabase/supabase-js";
import type { RatesByDate } from "@/features/fx/findRate";
import type { RuleRow } from "@/features/rules/rules";
import { readAllRows, type RowQuery } from "@/lib/readAllRows";
import { BASE_CURRENCY, RATED_CURRENCY } from "./prepareImport";
import type { Account, StatementFormat } from "./types";

type AccountRow = {
  id: string;
  last_four: string;
  format: StatementFormat;
  currency: string;
};

type RateRow = { rate_date: string; rate: string };

export type ImportCategory = { id: string; name: string };

/** Throws `ReadRowsError` if the read fails. */
export async function readImportAccounts(
  client: SupabaseClient,
): Promise<Account[]> {
  const rows = await readAllRows(
    () =>
      client
        .from("accounts")
        .select(
          "id, last_four, format, currency",
        ) as unknown as RowQuery<AccountRow>,
    ["id"],
  );

  return rows.map((row) => ({
    id: row.id,
    lastFour: row.last_four,
    format: row.format,
    currency: row.currency,
  }));
}

/** Throws `ReadRowsError` if the read fails. */
export function readImportRules(client: SupabaseClient): Promise<RuleRow[]> {
  return readAllRows(
    () =>
      client
        .from("rules")
        .select(
          "id, match_on, value, position, type, category_id",
        ) as unknown as RowQuery<RuleRow>,
    ["id"],
  );
}

/** Throws `ReadRowsError` if the read fails. */
export function readImportCategories(
  client: SupabaseClient,
): Promise<ImportCategory[]> {
  return readAllRows(
    () =>
      client
        .from("categories")
        .select("id, name") as unknown as RowQuery<ImportCategory>,
    ["id"],
  );
}

/** Gives `prepareImport` its reader. Throws `ReadRowsError` if a read fails. */
export function readSavedRates(client: SupabaseClient) {
  return async (from: string, to: string): Promise<RatesByDate> => {
    const rows = await readAllRows(
      () =>
        client
          .from("fx_rates")
          .select("rate_date, rate")
          .eq("base", RATED_CURRENCY)
          .eq("quote", BASE_CURRENCY)
          .gte("rate_date", from)
          .lte("rate_date", to) as unknown as RowQuery<RateRow>,
      ["rate_date"],
    );

    return Object.fromEntries(rows.map((row) => [row.rate_date, row.rate]));
  };
}
