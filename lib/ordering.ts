/** A stored row that the owner can move up or down a list. */
export type Positioned = { id: string; position: number };

export type Direction = "up" | "down";

export function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down";
}

/** Position defaults to 0 in the schema, so ties are possible. Ids settle them. */
export function inPositionOrder<Row extends Positioned>(
  rows: readonly Row[],
): Row[] {
  return [...rows].sort(
    (a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function nextPosition(rows: readonly Positioned[]): number {
  return rows.reduce((next, row) => Math.max(next, row.position + 1), 0);
}

/**
 * Gives the writes that move one row a step along the list. It numbers the whole
 * list rather than swapping two positions, because swapping tied positions
 * changes nothing. Rows already in the right place aren't written.
 */
export function moveWithin(
  rows: readonly Positioned[],
  id: string,
  direction: Direction,
): Positioned[] {
  const ordered = inPositionOrder(rows);
  const from = ordered.findIndex((row) => row.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ordered.length) return [];

  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];

  return ordered.flatMap((row, position) =>
    row.position === position ? [] : [{ id: row.id, position }],
  );
}
