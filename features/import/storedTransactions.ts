import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategorySource } from "@/features/categorize/pastCategories";
import type { TransactionType } from "@/features/categorize/transactionType";
import { readAllRows, type RowQuery } from "@/lib/readAllRows";
import type { OriginalAmount, Transaction } from "./types";

export const STORED_COLUMNS =
  "id, account_id, fingerprint, posted_on, purchased_on, amount_minor, " +
  "currency, description, purpose, original_amount_minor, original_currency, " +
  "original_rate, bank_type, bank_category, ppd_id, ordering_party_id, " +
  "transfer_number, balance_minor, type, category_id, category_source, " +
  "suggested_category_id, note, hidden, possible_duplicate, transfer_pair_id";

/** A row of the transactions table, with the columns `STORED_COLUMNS` reads. */
export type StoredTransactionRow = {
  id: string;
  account_id: string;
  fingerprint: string;
  posted_on: string;
  purchased_on: string | null;
  amount_minor: number;
  currency: string;
  description: string;
  purpose: string | null;
  original_amount_minor: number | null;
  original_currency: string | null;
  original_rate: string | null;
  bank_type: string | null;
  bank_category: string | null;
  ppd_id: string | null;
  ordering_party_id: string | null;
  transfer_number: string | null;
  balance_minor: number | null;
  type: string | null;
  category_id: string | null;
  category_source: string | null;
  suggested_category_id: string | null;
  note: string | null;
  hidden: boolean;
  possible_duplicate: boolean;
  transfer_pair_id: string | null;
};

/** A stored row: what the bank said, plus what's been decided about it. */
export type StoredTransaction = Transaction & {
  id: string;
  type: TransactionType | null;
  categoryId: string | null;
  categorySource: CategorySource | null;
  suggestedCategoryId: string | null;
  note: string | null;
  hidden: boolean;
  possibleDuplicate: boolean;
  transferPairId: string | null;
};

function originalOf(row: StoredTransactionRow): OriginalAmount | undefined {
  const { original_amount_minor: minor, original_currency: currency } = row;
  if (minor === null || currency === null) return undefined;
  return { amount: { minor, currency }, rate: row.original_rate ?? undefined };
}

export function toStoredTransaction(
  row: StoredTransactionRow,
): StoredTransaction {
  const { amount_minor: minor, balance_minor: balance, currency } = row;

  return {
    id: row.id,
    accountId: row.account_id,
    fingerprint: row.fingerprint,
    postedOn: row.posted_on,
    purchasedOn: row.purchased_on ?? undefined,
    amount: { minor, currency },
    description: row.description,
    purpose: row.purpose ?? undefined,
    original: originalOf(row),
    bankType: row.bank_type ?? undefined,
    bankCategory: row.bank_category ?? undefined,
    ppdId: row.ppd_id ?? undefined,
    orderingPartyId: row.ordering_party_id ?? undefined,
    transferNumber: row.transfer_number ?? undefined,
    balance: balance === null ? undefined : { minor: balance, currency },
    type: row.type as TransactionType | null,
    categoryId: row.category_id,
    categorySource: row.category_source as CategorySource | null,
    suggestedCategoryId: row.suggested_category_id,
    note: row.note,
    hidden: row.hidden,
    possibleDuplicate: row.possible_duplicate,
    transferPairId: row.transfer_pair_id,
  };
}

/** Dates are `posted_on`, as YYYY-MM-DD, and include both ends. */
export type StoredTransactionFilter = {
  from?: string;
  to?: string;
  /** Only rows whose category JL confirmed, the ones past categories learn from. */
  manualOnly?: boolean;
};

function storedRowsQuery(
  client: SupabaseClient,
  { from, to, manualOnly }: StoredTransactionFilter,
): RowQuery<StoredTransactionRow> {
  let query = client.from("transactions").select(STORED_COLUMNS);
  if (from !== undefined) query = query.gte("posted_on", from);
  if (to !== undefined) query = query.lte("posted_on", to);
  if (manualOnly) query = query.eq("category_source", "manual");
  return query as unknown as RowQuery<StoredTransactionRow>;
}

/** Throws `ReadRowsError` if any page fails, so there's never a partial result. */
export async function readStoredTransactions(
  client: SupabaseClient,
  filter: StoredTransactionFilter = {},
): Promise<StoredTransaction[]> {
  const rows = await readAllRows(() => storedRowsQuery(client, filter), ["id"]);
  return rows.map(toStoredTransaction);
}
