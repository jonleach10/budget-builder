import { StatementError } from "./errors";
import type { StatementRow } from "./types";

export type BalanceRow = Pick<StatementRow, "amount" | "balance"> & {
  line: number;
};

/**
 * Rows run newest first, so each balance less its amount is the next balance.
 * A mismatch means rows are missing or the file changed, so it fails the file.
 * A pair with a blank balance can't be judged, so it's skipped.
 */
export function checkBalances(rows: readonly BalanceRow[]): void {
  for (let i = 0; i + 1 < rows.length; i += 1) {
    const { amount, balance } = rows[i];
    const next = rows[i + 1];
    if (!balance || !next.balance) continue;
    if (balance.minor - amount.minor !== next.balance.minor) {
      throw new StatementError("balance-mismatch", next.line);
    }
  }
}
