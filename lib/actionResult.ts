/** What a server action tells the screen. A message never holds row data. */
export type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; message: string };

/** The result of one stored write. */
export type WriteResult = "done" | "missing" | "failed";

/**
 * Reads a write that asked for its rows back. Supabase doesn't treat a filter
 * that matched nothing as an error, so an empty list is the only sign of it.
 */
export function changedRows(
  data: readonly unknown[] | null,
  error: unknown,
): WriteResult {
  if (error) return "failed";
  return data !== null && data.length > 0 ? "done" : "missing";
}
