import type { Hash, StatementRow, Transaction } from "./types";

// Stored rows match on the whole value. A new format needs a new prefix, and a
// migration to recompute old rows from their stored fields.
const FORMAT_PREFIX = "v1:";

/** Web Crypto, so the server and the browser demo share one hash. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Identifies each row so overlapping exports can be matched later. Identical
 * rows are told apart by a repeat index, which counts them and not their
 * position, so reordering a file doesn't change its set of fingerprints.
 */
export async function addFingerprints(
  rows: readonly StatementRow[],
  accountId: string,
  hash: Hash,
): Promise<Transaction[]> {
  const seen = new Map<string, number>();

  return Promise.all(
    rows.map(async (row) => {
      const parts = [
        accountId,
        row.postedOn,
        row.amount.minor,
        row.amount.currency,
        row.description,
      ];
      const key = JSON.stringify(parts);
      const repeatIndex = seen.get(key) ?? 0;
      seen.set(key, repeatIndex + 1);

      const digest = await hash(JSON.stringify([...parts, repeatIndex]));
      const fingerprint = `${FORMAT_PREFIX}${digest}`;
      return { ...row, accountId, fingerprint, repeatIndex };
    }),
  );
}
