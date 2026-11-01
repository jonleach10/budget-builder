import { describe, expect, it } from "vitest";
import { readAllRows, ReadRowsError, type RowQuery } from "./readAllRows";

type Row = { id: number };

const SERVER_LIMIT = 1000;

function rowsUpTo(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
}

/**
 * Behaves as Supabase's API does: it never returns more than the server limit
 * for one request, whatever range is asked for, and a range needs an order to
 * mean the same rows on every request.
 */
function fakeQuery(rows: readonly Row[]) {
  const requests: { orders: string[]; from: number; to: number }[] = [];

  function start(): RowQuery<Row> {
    const orders: string[] = [];
    let from = 0;
    let to = rows.length;

    const query: RowQuery<Row> = {
      order(column) {
        orders.push(column);
        return query;
      },
      range(start, end) {
        from = start;
        to = end;
        return query;
      },
      then(onDone, onFailed) {
        requests.push({ orders, from, to });
        const page = rows.slice(from, Math.min(to + 1, from + SERVER_LIMIT));
        return Promise.resolve({ data: [...page], error: null }).then(
          onDone,
          onFailed,
        );
      },
    };
    return query;
  }

  return { start, requests };
}

describe("readAllRows", () => {
  it("brings back a result longer than one page, whole and in order", async () => {
    const rows = rowsUpTo(2500);
    const { start, requests } = fakeQuery(rows);

    await expect(readAllRows(start, ["id"])).resolves.toEqual(rows);
    expect(requests.map(({ from, to }) => [from, to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("orders every page by the stable columns", async () => {
    const { start, requests } = fakeQuery(rowsUpTo(1500));

    await readAllRows(start, ["month", "id"]);

    expect(requests.map(({ orders }) => orders)).toEqual([
      ["month", "id"],
      ["month", "id"],
    ]);
  });

  it("stops at a short page without asking again", async () => {
    const { start, requests } = fakeQuery(rowsUpTo(10));

    await expect(readAllRows(start, ["id"])).resolves.toHaveLength(10);
    expect(requests).toHaveLength(1);
  });

  it("ends on an empty page when the rows fill a page exactly", async () => {
    const { start, requests } = fakeQuery(rowsUpTo(2000));

    await expect(readAllRows(start, ["id"])).resolves.toHaveLength(2000);
    expect(requests).toHaveLength(3);
  });

  it("gives an empty list for no rows", async () => {
    const { start } = fakeQuery([]);

    await expect(readAllRows(start, ["id"])).resolves.toEqual([]);
  });

  it("refuses to return part of a result when a later page fails", async () => {
    const rows = rowsUpTo(1500);
    const { start } = fakeQuery(rows);
    let calls = 0;

    const failsOnSecondPage = (): RowQuery<Row> => {
      calls += 1;
      if (calls === 1) return start();
      const query: RowQuery<Row> = {
        order: () => query,
        range: () => query,
        then: (onDone, onFailed) =>
          Promise.resolve({
            data: null,
            error: { message: "SYNTHETIC SECRET ROW TEXT" },
          }).then(onDone, onFailed),
      };
      return query;
    };

    const failure = await readAllRows(failsOnSecondPage, ["id"]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ReadRowsError);
    expect(String(failure)).not.toContain("SYNTHETIC");
  });
});
