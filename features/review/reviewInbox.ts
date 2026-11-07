import { BudgetError } from "@/features/budget/errors";
import { shortDateAsOf } from "@/features/budget/months";
import type { AccountRow, CategoryRow } from "@/features/budget/rows";
import { lookUp } from "@/features/categorize/bankMaps";
import { needsReview } from "@/features/categorize/needsReview";
import {
  merchantKey,
  mixedMerchants,
  pastCategories,
  type CategorizedRow,
} from "@/features/categorize/pastCategories";
import { REDACTED } from "@/features/import/redact";
import type { StoredTransaction } from "@/features/import/storedTransactions";
import {
  buildTransactionsScreen,
  type TransactionLine,
} from "@/features/transactions/transactionsScreenData";
import { formatMoney, sumMinor } from "@/lib/money";

/** A category the owner can confirm with one tap. It's never stored by itself. */
export type Suggestion = { categoryId: string; name: string };

export type MerchantGroup = {
  /** The `merchantKey` its rows share. */
  key: string;
  /** The newest row's bank text. */
  name: string;
  /** What the rows share: an ID, or the bank text. */
  detail: string;
  count: number;
  countText: string;
  /** The rows' USD amounts added up. */
  total: string;
  /** The count, and the suggestion if there is one, for the phone's group line. */
  phoneDetail: string;
  suggestion: Suggestion | null;
  /** Newest first. */
  rows: TransactionLine[];
};

export type NoMerchantRow = {
  line: TransactionLine;
  suggestion: Suggestion | null;
  /** The text lost a number at import, so the owner may need the statement. */
  redacted: boolean;
};

export type InboxEmpty = {
  kind: "done" | "nothing-imported";
  title: string;
  text: string;
};

export type ReviewInbox = {
  /** Rows that need review, which is every row in `groups` and `noMerchant`. */
  left: number;
  subtitle: string;
  /** Largest first. */
  groups: MerchantGroup[];
  /** Newest first. Each row takes its own decision. */
  noMerchant: NoMerchantRow[];
  categories: { id: string; name: string }[];
  empty: InboxEmpty | null;
};

export type ReviewSource = {
  /** Every stored row, so past categories learn from all of them. */
  rows: readonly StoredTransaction[];
  accounts: readonly AccountRow[];
  categories: readonly CategoryRow[];
  /** Today's month, so a date from another year shows its year. */
  thisMonth: string;
};

export function rowsText(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "row" : "rows"}`;
}

function detailOf({ ppdId, orderingPartyId }: StoredTransaction): string {
  if (ppdId?.trim()) return `PPD ID ${ppdId}`;
  if (orderingPartyId?.trim()) return `Ordering Party ID ${orderingPartyId}`;
  return "Same bank text";
}

/** Every row's USD amount, which for a foreign row is the one locked at import. */
function totalOf(rows: readonly StoredTransaction[]): string {
  const currency = rows[0].base.currency;
  if (rows.some(({ base }) => base.currency !== currency)) {
    throw new BudgetError("entry-currency-mismatch");
  }
  return formatMoney({
    minor: sumMinor(rows.map(({ base }) => base.minor)),
    currency,
  });
}

function byNewest(a: StoredTransaction, b: StoredTransaction): number {
  return b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id);
}

function largestFirst(a: MerchantGroup, b: MerchantGroup): number {
  return (
    b.count - a.count || a.name.localeCompare(b.name) || a.key.localeCompare(b.key)
  );
}

/**
 * Builds the Review inbox from stored rows, doing no reading or writing. It
 * holds the rows `needsReview` picks, the definition Budget counts with.
 *
 * A suggestion comes from the category the owner confirmed for the merchant,
 * worked out now, because those grow as the owner reviews. The value stored at
 * import is the fallback. A merchant with two confirmed categories gets neither,
 * so it keeps asking. Nothing here categorizes a row.
 */
export function buildReviewInbox({
  rows,
  accounts,
  categories,
  thisMonth,
}: ReviewSource): ReviewInbox {
  const namesById = new Map(categories.map(({ id, name }) => [id, name]));
  const idsByName = new Map(categories.map(({ id, name }) => [name, id]));
  const nameOf = (id: string | null) =>
    id === null ? undefined : namesById.get(id);

  const history: CategorizedRow[] = rows.map((stored) => ({
    transaction: stored,
    category: nameOf(stored.categoryId),
    source: stored.categorySource ?? undefined,
  }));
  const past = pastCategories(history);
  const mixed = new Set(mixedMerchants(history));

  function suggestionFor(id: string | undefined): Suggestion | null {
    const name = id === undefined ? undefined : namesById.get(id);
    return id === undefined || name === undefined
      ? null
      : { categoryId: id, name };
  }

  /** The value stored at import, only when every row holds the same one. */
  function storedSuggestion(
    group: readonly StoredTransaction[],
  ): Suggestion | null {
    const [first, ...rest] = group.map(({ suggestedCategoryId }) => suggestedCategoryId);
    if (first === null || rest.some((id) => id !== first)) return null;
    return suggestionFor(first);
  }

  function groupSuggestion(
    key: string,
    group: readonly StoredTransaction[],
  ): Suggestion | null {
    if (mixed.has(key)) return null;
    const pastName = lookUp(past, key);
    const fromPast = suggestionFor(
      pastName === undefined ? undefined : idsByName.get(pastName),
    );
    return fromPast ?? storedSuggestion(group);
  }

  const inReview = rows
    .filter((stored) =>
      needsReview({
        hidden: stored.hidden,
        type: stored.type,
        category: nameOf(stored.categoryId),
      }),
    )
    .sort(byNewest);

  const linesById = new Map(
    buildTransactionsScreen({ rows: inReview, accounts, categories }).lines.map(
      (line) => [line.id, line],
    ),
  );
  // The inbox spans every month, so a row's date needs its year when it's old.
  const lineOf = ({ id, postedOn }: StoredTransaction): TransactionLine => ({
    ...(linesById.get(id) as TransactionLine),
    date: shortDateAsOf(postedOn, thisMonth),
  });

  const byKey = new Map<string, StoredTransaction[]>();
  const noMerchant: NoMerchantRow[] = [];
  for (const stored of inReview) {
    const key = merchantKey(stored);
    if (key === undefined) {
      noMerchant.push({
        line: lineOf(stored),
        suggestion: suggestionFor(stored.suggestedCategoryId ?? undefined),
        redacted: stored.description.includes(REDACTED),
      });
      continue;
    }
    byKey.set(key, [...(byKey.get(key) ?? []), stored]);
  }

  const groups = [...byKey].map(([key, group]): MerchantGroup => {
    const suggestion = groupSuggestion(key, group);
    const countText = rowsText(group.length);
    return {
      key,
      name: group[0].description,
      detail: detailOf(group[0]),
      count: group.length,
      countText,
      total: totalOf(group),
      phoneDetail:
        suggestion === null
          ? countText
          : `${countText} · Suggested: ${suggestion.name}`,
      suggestion,
      rows: group.map(lineOf),
    };
  });

  const left = inReview.length;
  return {
    left,
    subtitle: left === 0 ? "Nothing left to review." : `${rowsText(left)} left.`,
    groups: groups.sort(largestFirst),
    noMerchant,
    categories: categories.map(({ id, name }) => ({ id, name })),
    empty: emptyState(left, rows.length),
  };
}

function emptyState(left: number, stored: number): InboxEmpty | null {
  if (left > 0) return null;
  if (stored === 0) {
    return {
      kind: "nothing-imported",
      title: "Nothing to review yet",
      text: "Import a statement and any rows that need a decision appear here.",
    };
  }
  return {
    kind: "done",
    title: "All rows are reviewed",
    text: "New rows appear here after your next import.",
  };
}
