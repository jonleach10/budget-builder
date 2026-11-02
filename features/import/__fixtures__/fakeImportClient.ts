import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";
import type { StoredCounts } from "../prepareImport";

const SERVER_LIMIT = 1000;

type Row = Record<string, unknown>;

type Reply = { data: unknown; error: unknown };

export type FakeImportData = {
  accounts?: readonly Row[];
  fx_rates?: readonly Row[];
  /** A table whose reads fail, the way a failed request does. */
  failingTable?: "accounts" | "fx_rates";
  rpcReply?: Reply;
};

const STORED: StoredCounts = { new: 0, skipped: 0, possible_duplicates: 0 };

/**
 * Behaves as Supabase's API does for the calls an import makes: no request
 * returns more than the server limit, and a failure comes back as a reply
 * rather than a thrown error. A failure's text is meant to look like a database
 * error that quotes a row, so a test can show it never reaches the screen.
 */
export function fakeImportClient(data: FakeImportData = {}) {
  const rpc = vi.fn(
    async (): Promise<Reply> => data.rpcReply ?? { data: STORED, error: null },
  );

  function from(table: "accounts" | "fx_rates") {
    const filters: ((row: Row) => boolean)[] = [];
    let first = 0;
    let last = Number.MAX_SAFE_INTEGER;

    function keep(test: (row: Row) => boolean) {
      filters.push(test);
      return builder;
    }

    const builder = {
      select: () => builder,
      eq: (column: string, value: string) =>
        keep((row) => row[column] === value),
      gte: (column: string, value: string) =>
        keep((row) => String(row[column]) >= value),
      lte: (column: string, value: string) =>
        keep((row) => String(row[column]) <= value),
      order: () => builder,
      range(start: number, end: number) {
        first = start;
        last = end;
        return builder;
      },
      then(
        onDone: (reply: Reply) => unknown,
        onFailed: (reason: unknown) => unknown,
      ) {
        const rows = data[table] ?? [];
        const reply: Reply =
          data.failingTable === table
            ? { data: null, error: { message: "SYNTHETIC SECRET ROW TEXT" } }
            : {
                data: rows
                  .filter((row) => filters.every((test) => test(row)))
                  .slice(first, Math.min(last + 1, first + SERVER_LIMIT)),
                error: null,
              };
        return Promise.resolve(reply).then(onDone, onFailed);
      },
    };
    return builder;
  }

  return { client: { from, rpc } as unknown as SupabaseClient, rpc };
}
