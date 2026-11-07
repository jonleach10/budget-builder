import { randomUUID } from "node:crypto";
import {
  canBeOneTransfer,
  type TransferSide,
} from "@/features/categorize/pairTransfers";
import type { TransactionType } from "@/features/categorize/transactionType";
import type { ActionResult, WriteResult } from "@/lib/actionResult";

/** What a stored row holds that decides whether it can join a transfer. */
export type TransferRow = {
  id: string;
  account_id: string;
  amount_minor: number;
  currency: string;
  type: TransactionType | null;
  transfer_pair_id: string | null;
  hidden: boolean;
};

/** The part of the transactions table this needs. */
export type TransferStore = {
  read(ids: readonly string[]): Promise<TransferRow[] | "failed">;
  /**
   * Gives every row that's still open to pairing the pair ID and the transfer
   * type, in one update, and gives the IDs it changed.
   */
  pair(ids: readonly string[], pairId: string): Promise<string[] | "failed">;
  /** Takes one row back out of the pair, with the type it had before. */
  restore(
    id: string,
    pairId: string,
    type: TransactionType | null,
  ): Promise<WriteResult>;
};

const MARKED: ActionResult = {
  ok: true,
  notice: "The rows are marked as a transfer.",
};

const NOT_SAVED: ActionResult = {
  ok: false,
  message: "This transfer wasn't saved. Try again.",
};

const CHANGED: ActionResult = {
  ok: false,
  message:
    "One of these rows has changed, so this transfer wasn't saved. Check the rows, then try again.",
};

const HALF_PAIR: ActionResult = {
  ok: false,
  message:
    "One of these rows has changed, and the other was marked as a transfer on its own. Change its type in Transactions to undo it.",
};

const NOT_ONE_TRANSFER: ActionResult = {
  ok: false,
  message:
    "These rows can't be one transfer. Select two rows on different accounts, with the same amount going out and coming in.",
};

/** A server action can be sent anything, so this checks more than the types do. */
function isTwoIds(ids: unknown): ids is [string, string] {
  return (
    Array.isArray(ids) &&
    ids.length === 2 &&
    ids.every((id) => typeof id === "string" && id !== "") &&
    ids[0] !== ids[1]
  );
}

function sideOf(row: TransferRow): TransferSide {
  return {
    accountId: row.account_id,
    amount: { minor: row.amount_minor, currency: row.currency },
  };
}

/** The guard `pair` writes with, which matches `import_transactions` and leaves out hidden rows. */
function isOpen({ type, transfer_pair_id, hidden }: TransferRow): boolean {
  return (
    transfer_pair_id === null &&
    (type === null || type === "transfer") &&
    !hidden
  );
}

/**
 * Marks two rows the owner picked as one transfer. Both rows land in one
 * update, guarded like `import_transactions`, so neither can join a pair it
 * left since the inbox loaded.
 */
export async function confirmTransfer(
  store: TransferStore,
  ids: readonly string[],
  newPairId: () => string = randomUUID,
): Promise<ActionResult> {
  if (!isTwoIds(ids)) return NOT_SAVED;
  const rows = await store.read(ids);
  if (rows === "failed") return NOT_SAVED;
  if (rows.length !== 2 || !rows.every(isOpen)) return CHANGED;
  const [a, b] = rows.map(sideOf);
  if (!canBeOneTransfer(a, b)) return NOT_ONE_TRANSFER;

  const pairId = newPairId();
  const written = await store.pair(ids, pairId);
  if (written === "failed") return NOT_SAVED;
  if (written.length === 2) return MARKED;
  if (written.length === 0) return CHANGED;

  // The other row changed after the read, so this one holds half a pair.
  const half = rows.find(({ id }) => id === written[0]) as TransferRow;
  const undone = await store.restore(half.id, pairId, half.type);
  return undone === "done" ? CHANGED : HALF_PAIR;
}
