// Supabase's API returns at most 1,000 rows per request by default.
const PAGE_SIZE = 1000;

type RowPage<Row> = { data: Row[] | null; error: unknown };

/** The parts of a Supabase query this needs, so tests can pass a fake. */
export type RowQuery<Row> = PromiseLike<RowPage<Row>> & {
  order(column: string): RowQuery<Row>;
  range(from: number, to: number): RowQuery<Row>;
};

/** Has a fixed message, because a database error can quote what it read. */
export class ReadRowsError extends Error {
  constructor() {
    super("Budget Builder can't read the saved rows. Try again.");
    this.name = "ReadRowsError";
  }
}

/**
 * Reads every page of a query until a short page. The columns must identify a
 * row, because a range only means the same rows on every request if the order
 * can't change. A failed page throws, so a caller never gets part of a result.
 */
export async function readAllRows<Row>(
  buildQuery: () => RowQuery<Row>,
  stableOrder: readonly [string, ...string[]],
): Promise<Row[]> {
  const rows: Row[] = [];

  for (;;) {
    const ordered = stableOrder.reduce(
      (query, column) => query.order(column),
      buildQuery(),
    );
    const { data, error } = await ordered.range(
      rows.length,
      rows.length + PAGE_SIZE - 1,
    );
    if (error || data === null) throw new ReadRowsError();

    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}
