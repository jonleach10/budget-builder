import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Odd states the import can't make, written straight to the owner's stored
 * rows after the normal seed, as the owner, so every policy still applies.
 * Nothing here imports app code at run time, so the sandbox's command line can
 * read the names.
 */

export const WEIRD_ROWS = ["missing-rate", "half-failed-move"] as const;

export type WeirdRows = (typeof WEIRD_ROWS)[number];

/**
 * The weird-row names among those given, each once, in WEIRD_ROWS order. Each
 * state is applied once however often it's asked for, because a second
 * half-failed-move would break a second move.
 */
export function weirdRowsIn(names: readonly string[]): WeirdRows[] {
  return WEIRD_ROWS.filter((name) => names.includes(name));
}

/** How far back findRate looks for a first of the month with no rate of its own. */
const RATE_LOOKBACK_DAYS = 7;

function addDays(date: string, days: number): string {
  const moved = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return moved.toISOString().slice(0, 10);
}

function check({ error }: { error: unknown }): void {
  if (error) throw error instanceof Error ? error : new Error(JSON.stringify(error));
}

/**
 * This month's Combined view then has no rate for Germany's budget, as after a
 * rates outage. Rows keep the rates locked on them at import.
 */
async function missingRate(client: SupabaseClient, today: string): Promise<void> {
  const first = `${today.slice(0, 7)}-01`;

  check(
    await client
      .from("fx_rates")
      .delete()
      .gte("rate_date", addDays(first, -RATE_LOOKBACK_DAYS))
      .lte("rate_date", first),
  );
}

function dataOf<Data>(result: { data: Data | null; error: unknown }): Data {
  check(result);
  if (result.data === null) throw new Error("Supabase returned no data.");
  return result.data;
}

type SavingsRow = {
  id: string;
  posted_on: string;
  transfer_number: string | null;
  transfer_pair_id: string | null;
};

/**
 * The newest move from checking to savings, as if pairing had stored only one
 * side: checking still says transfer and names the pair, and savings is back
 * to needing review, with no pair. The import's pairing can't leave this.
 */
async function halfFailedMove(client: SupabaseClient): Promise<void> {
  const [savings] = dataOf(
    await client.from("accounts").select("id").eq("last_four", "4444"),
  );
  if (savings === undefined) throw new Error("No savings account to break a move in.");

  const rows = dataOf<SavingsRow[]>(
    await client
      .from("transactions")
      .select("id, posted_on, transfer_number, transfer_pair_id")
      .eq("account_id", savings.id),
  );
  const [newest] = rows
    .filter((row) => row.transfer_number !== null && row.transfer_pair_id !== null)
    .sort((a, b) => b.posted_on.localeCompare(a.posted_on));
  if (newest === undefined) throw new Error("No paired move to break.");

  const changed = dataOf(
    await client
      .from("transactions")
      .update({ type: null, transfer_pair_id: null })
      .eq("id", newest.id)
      .select("id"),
  );
  if (changed.length !== 1) throw new Error("The move's savings side didn't change.");
}

const APPLY: Record<
  WeirdRows,
  (client: SupabaseClient, today: string) => Promise<void>
> = {
  "missing-rate": missingRate,
  "half-failed-move": halfFailedMove,
};

/** Runs one after another, in the order given, on the owner's MFA session. */
export async function applyWeirdRows(
  client: SupabaseClient,
  today: string,
  names: readonly WeirdRows[],
): Promise<void> {
  for (const name of names) await APPLY[name](client, today);
}
