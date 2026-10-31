import type { Hash, StatementRow, Transaction } from "./types";

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

      const fingerprint = await hash(JSON.stringify([...parts, repeatIndex]));
      return { ...row, accountId, fingerprint };
    }),
  );
}
