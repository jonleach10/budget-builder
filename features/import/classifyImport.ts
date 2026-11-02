import {
  bankCategoryMap,
  bankTypeMap,
  lookUp,
} from "@/features/categorize/bankMaps";
import {
  categorize,
  type CategoryContext,
} from "@/features/categorize/categorize";
import { defaultType } from "@/features/categorize/defaultType";
import { findType } from "@/features/categorize/findType";
import {
  pairTransfers,
  type PairingAccount,
  type PairingResult,
  type RowId,
} from "@/features/categorize/pairTransfers";
import {
  merchantKey,
  mixedMerchants,
  pastCategories,
  type CategorizedRow,
} from "@/features/categorize/pastCategories";
import { hasText } from "@/features/categorize/text";
import type { TransactionType } from "@/features/categorize/transactionType";
import { addDays } from "@/features/fx/dates";
import {
  toCategoryRules,
  toMatchingRules,
  type RuleRow,
} from "@/features/rules/rules";
import type { StoredTransaction } from "./storedTransactions";
import type { Transaction } from "./types";

// Wider than `pairTransfers`' longest gap, which is 5 days for a card payment.
const STORED_ROW_REACH_DAYS = 7;

export type ClassifyInput = {
  /** The rows of this upload, some of which may already be stored. */
  transactions: readonly Transaction[];
  /** Every stored row in `storedRowWindow`, whatever its state. */
  storedNearby: readonly StoredTransaction[];
  /** Stored rows whose category the owner confirmed. */
  confirmed: readonly StoredTransaction[];
  accounts: readonly PairingAccount[];
  rules: readonly RuleRow[];
  categories: readonly { id: string; name: string }[];
};

/** What classification adds to a row, under the columns it's stored in. */
export type RowDecision = {
  type?: TransactionType;
  category_id?: string;
  category_source?: string;
  suggested_category_id?: string;
};

export type ClassifiedImport = {
  /** One for each of `transactions`, in the same order. */
  decisions: RowDecision[];
  /** What `import_transactions` reads from each pair. */
  pairs: { moneyOut: RowId; moneyIn: RowId }[];
};

function keyOf({ accountId, fingerprint }: RowId): string {
  return JSON.stringify([accountId, fingerprint]);
}

/** Matches the guard in `import_transactions`. */
function isOpenToPairing(row: StoredTransaction): boolean {
  return (
    row.transferPairId === null && (row.type === null || row.type === "transfer")
  );
}

/**
 * A row already stored is skipped when it's sent again, so what's stored
 * decides whether it can pair. Its copy would be a second row with the same
 * identity, which is also true of a row in two files of one upload.
 */
function rowsNotStored(
  transactions: readonly Transaction[],
  storedNearby: readonly StoredTransaction[],
): Transaction[] {
  const seen = new Set(storedNearby.map(keyOf));
  return transactions.filter((row) => {
    const key = keyOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function keysOf(rows: readonly RowId[]): Set<string> {
  return new Set(rows.map(keyOf));
}

function transferKeys({ pairs, unpairedCardPayments }: PairingResult): Set<string> {
  return keysOf([
    ...pairs.flatMap(({ moneyOut, moneyIn }) => [moneyOut, moneyIn]),
    ...unpairedCardPayments,
  ]);
}

/**
 * A name with no match gets no fields, so a renamed category sends the row to
 * review instead of failing the import.
 */
function categoryFields(
  row: Transaction,
  type: TransactionType | undefined,
  context: CategoryContext,
  idsByName: ReadonlyMap<string, string>,
): RowDecision {
  const result = categorize(row, type, context);

  if (result.status === "categorized") {
    const id = idsByName.get(result.category);
    return id === undefined
      ? {}
      : { category_id: id, category_source: result.source };
  }
  if (result.status === "needs-review" && result.suggestedCategory) {
    const id = idsByName.get(result.suggestedCategory);
    return id === undefined ? {} : { suggested_category_id: id };
  }
  return {};
}

function withCategoryName(
  categories: ClassifyInput["categories"],
): (row: StoredTransaction) => CategorizedRow {
  const namesById = new Map(categories.map(({ id, name }) => [id, name]));

  return (row) => ({
    transaction: row,
    category: namesById.get(row.categoryId ?? ""),
    source: row.categorySource ?? undefined,
  });
}

/** The stored rows an upload's rows could pair with, or null if it has no rows. */
export function storedRowWindow(
  transactions: readonly Transaction[],
): { from: string; to: string } | null {
  if (transactions.length === 0) return null;

  const dates = transactions.map((row) => row.postedOn).sort();
  return {
    from: addDays(dates[0], -STORED_ROW_REACH_DAYS),
    to: addDays(dates[dates.length - 1], STORED_ROW_REACH_DAYS),
  };
}

/**
 * Decides what's stored with each row, doing no reading or writing. The type
 * comes from rules, then pairing, then the bank, then a past category, and the
 * category from the `categorize` chain. Anything left undecided reaches review.
 *
 * Only a spending row can hold a category, so a merchant with a confirmed
 * category is spending even when the bank's type says nothing. A row with a
 * transfer number is left out of that step, because its other side may arrive
 * in a later upload, and a stored `spending` row can't pair.
 *
 * A pair is only sent if it holds a new row, so an import never changes rows
 * it didn't bring, and importing a file again changes nothing.
 */
export function classifyImport({
  transactions,
  storedNearby,
  confirmed,
  accounts,
  rules,
  categories,
}: ClassifyInput): ClassifiedImport {
  const matchingRules = toMatchingRules(rules);
  const ruleTypeOf = (row: Transaction) => findType(row, matchingRules);

  const newRows = rowsNotStored(transactions, storedNearby);
  const pairing = pairTransfers(
    [
      ...newRows.filter((row) => (ruleTypeOf(row) ?? "transfer") === "transfer"),
      ...storedNearby.filter(isOpenToPairing),
    ],
    accounts,
  );
  const transfers = transferKeys(pairing);
  const uncertain = keysOf(pairing.uncertain.flatMap(({ rows }) => rows));
  const history = confirmed.map(withCategoryName(categories));
  const pastCategoryByMerchant = pastCategories(history);

  function typeOf(row: Transaction): TransactionType | undefined {
    const ruleType = ruleTypeOf(row);
    if (ruleType !== undefined) return ruleType;
    if (transfers.has(keyOf(row))) return "transfer";
    if (uncertain.has(keyOf(row))) return undefined;

    const type = defaultType(row);
    if (type !== undefined || hasText(row.transferNumber)) return type;

    const hasPastCategory =
      lookUp(pastCategoryByMerchant, merchantKey(row)) !== undefined;
    return hasPastCategory ? "spending" : undefined;
  }

  const idsByName = new Map(categories.map(({ id, name }) => [name, id]));
  const context: CategoryContext = {
    categoryRules: toCategoryRules(rules, categories),
    pastCategories: pastCategoryByMerchant,
    mixedMerchants: mixedMerchants(history),
    bankTypeMap,
    bankCategoryMap,
  };

  const newKeys = keysOf(newRows);
  return {
    decisions: transactions.map((row) => {
      const type = typeOf(row);
      return { type, ...categoryFields(row, type, context, idsByName) };
    }),
    pairs: pairing.pairs
      .filter(
        ({ moneyOut, moneyIn }) =>
          newKeys.has(keyOf(moneyOut)) || newKeys.has(keyOf(moneyIn)),
      )
      .map(({ moneyOut, moneyIn }) => ({ moneyOut, moneyIn })),
  };
}
