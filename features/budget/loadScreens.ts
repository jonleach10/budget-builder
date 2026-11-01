import type { SupabaseClient } from "@supabase/supabase-js";
import { serverClient } from "@/features/auth/requireSession";
import { addDays } from "@/features/fx/dates";
import { FxError } from "@/features/fx/errors";
import type { RatesByDate } from "@/features/fx/findRate";
import { MoneyError } from "@/lib/money";
import { inPositionOrder } from "@/lib/ordering";
import { readAllRows, ReadRowsError, type RowQuery } from "@/lib/readAllRows";
import { currencyFor } from "./budget";
import { buildBudgetScreen, type BudgetScreenData } from "./budgetScreenData";
import { BudgetError } from "./errors";
import { addMonths } from "./months";
import {
  buildOverviewScreen,
  type OverviewScreenData,
} from "./overviewScreenData";
import {
  toLedger,
  type AccountRow,
  type BudgetAmountRow,
  type CategoryRow,
  type LedgerRow,
  type TransactionRow,
} from "./rows";
import type { ScreenParams } from "./screenParams";
import { TREND_MONTHS } from "./viewFigures";

const TRANSACTION_COLUMNS =
  "id, account_id, posted_on, amount_minor, currency, description, " +
  "base_amount_minor, base_currency, type, category_id, hidden";

// findRate looks back up to 7 days, for a first of the month with no rate.
const RATE_LOOKBACK_DAYS = 7;

type ListReply = { data: unknown; error: unknown };

async function readList<Row>(query: PromiseLike<ListReply>): Promise<Row[]> {
  const { data, error } = await query;
  if (error || data === null) throw new ReadRowsError();
  return data as Row[];
}

function readAccounts(client: SupabaseClient): Promise<AccountRow[]> {
  return readList(client.from("accounts").select("id, name, country"));
}

async function readCategories(client: SupabaseClient): Promise<CategoryRow[]> {
  return inPositionOrder(
    await readList<CategoryRow>(
      client.from("categories").select("id, name, position"),
    ),
  );
}

/** Reads every month, because a month with none needs the nearest with some. */
function readAmounts(client: SupabaseClient): Promise<BudgetAmountRow[]> {
  return readAllRows(
    () =>
      client
        .from("budget_amounts")
        .select(
          "month, country, category_id, amount_minor",
        ) as unknown as RowQuery<BudgetAmountRow>,
    ["month", "country", "category_id"],
  );
}

/** Reads rows posted from the start of one month up to the start of another. */
function readTransactions(
  client: SupabaseClient,
  firstMonth: string,
  endMonth: string,
): Promise<TransactionRow[]> {
  return readAllRows(
    () =>
      client
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .gte("posted_on", `${firstMonth}-01`)
        .lt(
          "posted_on",
          `${endMonth}-01`,
        ) as unknown as RowQuery<TransactionRow>,
    ["id"],
  );
}

export function ratesByDate(
  rows: readonly { rate_date: string; rate: string }[],
): RatesByDate {
  return Object.fromEntries(rows.map((row) => [row.rate_date, row.rate]));
}

/** Only ever reads saved rates, so rendering a screen fetches nothing. */
async function readRates(
  client: SupabaseClient,
  month: string,
): Promise<RatesByDate> {
  const first = `${month}-01`;
  const rows = await readList<{ rate_date: string; rate: string }>(
    client
      .from("fx_rates")
      .select("rate_date, rate")
      .eq("base", currencyFor("DE"))
      .eq("quote", currencyFor("US"))
      .gte("rate_date", addDays(first, -RATE_LOOKBACK_DAYS))
      .lte("rate_date", first),
  );
  return ratesByDate(rows);
}

async function hasAnyTransaction(client: SupabaseClient): Promise<boolean> {
  const rows = await readList(client.from("transactions").select("id").limit(1));
  return rows.length > 0;
}

/**
 * Gives null if the screen can't be built, so it never claims there's nothing
 * to show. These errors carry fixed messages and no row data.
 */
async function orNull<Screen>(load: () => Promise<Screen>): Promise<Screen | null> {
  try {
    return await load();
  } catch (error) {
    const known =
      error instanceof ReadRowsError ||
      error instanceof BudgetError ||
      error instanceof MoneyError ||
      error instanceof FxError;
    if (!known) throw error;
    return null;
  }
}

async function readMonth(client: SupabaseClient, month: string) {
  const [accounts, categories, amounts, rows, rates] = await Promise.all([
    readAccounts(client),
    readCategories(client),
    readAmounts(client),
    readTransactions(client, month, addMonths(month, 1)),
    readRates(client, month),
  ]);

  const ledgerOf = (transactions: readonly TransactionRow[]): LedgerRow[] =>
    toLedger(transactions, accounts, categories);

  return { categories, amounts, rates, ledger: ledgerOf(rows), ledgerOf };
}

export async function loadBudgetScreen(
  params: ScreenParams,
): Promise<BudgetScreenData | null> {
  return orNull(async () => {
    const { categories, amounts, rates, ledger } = await readMonth(
      await serverClient(),
      params.month,
    );
    return buildBudgetScreen(params, { categories, amounts, rates, ledger });
  });
}

export async function loadOverviewScreen(
  params: ScreenParams,
  current: string,
): Promise<OverviewScreenData | null> {
  return orNull(async () => {
    const client = await serverClient();
    const [month, trendRows, hasTransactions] = await Promise.all([
      readMonth(client, params.month),
      readTransactions(
        client,
        addMonths(current, 1 - TREND_MONTHS),
        addMonths(current, 1),
      ),
      hasAnyTransaction(client),
    ]);
    const { categories, amounts, rates, ledger, ledgerOf } = month;

    return buildOverviewScreen(params, current, {
      categories,
      amounts,
      rates,
      ledger,
      trendLedger: ledgerOf(trendRows),
      hasTransactions,
    });
  });
}
