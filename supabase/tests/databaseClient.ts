import type { PGlite, Transaction } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitAs, OWNER, withMfa, type Session } from "./harness";

// PGlite turns a date into a Date object. Supabase's API sends it as text.
const DATE_TYPE = 1082;

type Reply = { data: unknown; error: unknown };

/**
 * Answers the calls the app makes from the real tables and function, as this
 * session. Each call is its own transaction, as each API request is, and a
 * failed one comes back as a reply. An update sets only the columns it's given,
 * as Supabase's API does, so column grants and triggers see what the app sends.
 */
export function databaseClient(
  db: PGlite,
  session: Session = withMfa(OWNER),
): SupabaseClient {
  async function ask(work: (tx: Transaction) => Promise<unknown>): Promise<Reply> {
    try {
      return { data: await commitAs(db, session, work), error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  function from(table: string) {
    let columns = "";
    let changes: Readonly<Record<string, unknown>> | null = null;
    const conditions: string[] = [];
    const values: unknown[] = [];

    function keep(column: string, operator: string, value: string) {
      values.push(value);
      conditions.push(`${column}::text ${operator} $${values.length}`);
      return builder;
    }

    function statement(): string {
      const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
      if (changes === null) {
        return `select ${columns} from public.${table} ${where}`;
      }
      const assignments = Object.entries(changes).map(([column, value]) => {
        values.push(value);
        return `${column} = $${values.length}`;
      });
      return `update public.${table} set ${assignments.join(", ")} ${where}
        returning ${columns}`;
    }

    const builder = {
      select(list: string) {
        columns = list;
        return builder;
      },
      update(patch: Readonly<Record<string, unknown>>) {
        changes = patch;
        return builder;
      },
      // Postgres writes a boolean as text the way String() does: true or false.
      eq: (column: string, value: string | boolean) => keep(column, "=", String(value)),
      gte: (column: string, value: string) => keep(column, ">=", value),
      lte: (column: string, value: string) => keep(column, "<=", value),
      lt: (column: string, value: string) => keep(column, "<", value),
      in(column: string, list: readonly string[]) {
        values.push(list);
        conditions.push(`${column}::text = any($${values.length}::text[])`);
        return builder;
      },
      /** The app only ever tests for null this way. */
      is(column: string) {
        conditions.push(`${column} is null`);
        return builder;
      },
      /** Takes the forms the app sends: `column.eq.value` and `column.is.null`. */
      or(filters: string) {
        const either = filters.split(",").map((filter) => {
          const [column, operator, ...rest] = filter.split(".");
          const value = rest.join(".");
          if (operator === "is" && value === "null") return `${column} is null`;
          if (operator !== "eq") throw new Error(`Unsupported filter: ${operator}`);
          values.push(value);
          return `${column}::text = $${values.length}`;
        });
        conditions.push(`(${either.join(" or ")})`);
        return builder;
      },
      limit: () => builder,
      order: () => builder,
      range: () => builder,
      then(onDone: (reply: Reply) => unknown) {
        return ask(async (tx) => {
          const read = await tx.query(statement(), values, {
            parsers: { [DATE_TYPE]: (value) => value },
          });
          return read.rows;
        }).then(onDone);
      },
    };
    return builder;
  }

  return {
    from,
    rpc: (_name: string, args: Record<string, unknown>) =>
      ask(async (tx) => {
        const { rows: reply } = await tx.query<{ counts: unknown }>(
          `select public.import_transactions($1::jsonb, $2::jsonb, $3::jsonb) as counts`,
          [
            JSON.stringify(args.p_rows),
            JSON.stringify(args.p_rates),
            JSON.stringify(args.p_pairs),
          ],
        );
        return reply[0].counts;
      }),
  } as unknown as SupabaseClient;
}
