import { BudgetError } from "@/features/budget/errors";
import { shortDateAsOf } from "@/features/budget/months";
import type { AccountRow, CategoryRow } from "@/features/budget/rows";
import { lookUp } from "@/features/categorize/bankMaps";
import { needsReview } from "@/features/categorize/needsReview";
import {
  canBeOneTransfer,
  pairTransfers,
  type PairingAccount,
  type RowId,
  type UncertainMatch,
  type UncertainReason,
} from "@/features/categorize/pairTransfers";
import {
  isRedactedKey,
  merchantKey,
  mixedMerchants,
  pastCategories,
  type CategorizedRow,
} from "@/features/categorize/pastCategories";
import { isOpenToPairing } from "@/features/import/classifyImport";
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

/** Rows that may be one transfer, for the owner to confirm or type. */
export type TransferMatch = {
  /** The rows' IDs, sorted, so it stays the same across loads. */
  key: string;
  title: string;
  help: string;
  /** Newest first. */
  rows: TransactionLine[];
  /** The rows selected when the match opens: both, when there are only two. */
  picked: string[];
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
  /** Newest first. */
  transfers: TransferMatch[];
  /** Rows flagged at import as a repeat in one file, not hidden. Newest first. */
  duplicates: TransactionLine[];
  categories: { id: string; name: string }[];
  empty: InboxEmpty | null;
};

export type ReviewSource = {
  /** Every stored row, so past categories learn from all of them. */
  rows: readonly StoredTransaction[];
  accounts: readonly AccountRow[];
  /** Each account's statement format, which decides how its rows can pair. */
  pairingAccounts: readonly PairingAccount[];
  categories: readonly CategoryRow[];
  /** Today's month, so a date from another year shows its year. */
  thisMonth: string;
};

export function rowsText(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "row" : "rows"}`;
}

/**
 * What the group's rows share. Redacted text may hide two payees, so that group
 * asks the owner to check its rows instead.
 */
function detailOf(
  key: string,
  { ppdId, orderingPartyId }: StoredTransaction,
): string {
  if (ppdId?.trim()) return `PPD ID ${ppdId}`;
  if (orderingPartyId?.trim()) return `Ordering Party ID ${orderingPartyId}`;
  if (isRedactedKey(key)) return "Redacted text. Check the rows before you accept.";
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

/**
 * The phone's one group line. A redacted group says so instead of naming its
 * suggestion, which still shows when the group is open.
 */
function phoneDetailOf(
  key: string,
  countText: string,
  suggestion: Suggestion | null,
): string {
  if (isRedactedKey(key)) return `${countText} · Redacted text`;
  return suggestion === null ? countText : `${countText} · Suggested: ${suggestion.name}`;
}

const MATCH_TEXT: Record<UncertainReason, { title: string; help: string }> = {
  "transfer-number": {
    title: "Same Transfer Number",
    help: "These rows share a transfer number.",
  },
  "card-payment": {
    title: "Card Payment",
    help: "A card payment and a bank row have the same amount, within 5 days.",
  },
  "same-amount": {
    title: "Same Amount Within 3 Days",
    help: "These rows have opposite amounts on two accounts and no transfer number.",
  },
};

const PICK_TWO = "Select the two rows that belong together.";

function identityOf({ accountId, fingerprint }: RowId): string {
  return JSON.stringify([accountId, fingerprint]);
}

/** Whether any two of the rows could be one transfer, as Mark as Transfer checks. */
function holdsAPair(rows: readonly StoredTransaction[]): boolean {
  return rows.some((row, index) =>
    rows.slice(index + 1).some((other) => canBeOneTransfer(row, other)),
  );
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
  pairingAccounts,
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

  const candidates = rows.filter(
    (stored) => isOpenToPairing(stored) && !stored.hidden,
  );
  // A duplicate stays in totals until hidden, so it's listed whether or not
  // it needs review.
  const duplicates = rows
    .filter((stored) => stored.possibleDuplicate && !stored.hidden)
    .sort(byNewest);
  // A match can hold a stored transfer row that isn't in review.
  const shown = [...new Set([...inReview, ...candidates, ...duplicates])];
  const linesById = new Map(
    buildTransactionsScreen({ rows: shown, accounts, categories }).lines.map(
      (line) => [line.id, line],
    ),
  );
  // The inbox spans every month, so a row's date needs its year when it's old.
  const lineOf = ({ id, postedOn }: StoredTransaction): TransactionLine => ({
    ...(linesById.get(id) as TransactionLine),
    date: shortDateAsOf(postedOn, thisMonth),
  });

  const byIdentity = new Map(rows.map((stored) => [identityOf(stored), stored]));
  const pairing = pairTransfers(candidates, pairingAccounts);
  // A sure pair is shown, not stored: the owner confirms every transfer here.
  const found: UncertainMatch[] = [
    ...pairing.pairs.map(({ evidence, moneyOut, moneyIn }) => ({
      reason: evidence,
      rows: [moneyOut, moneyIn],
    })),
    ...pairing.uncertain,
  ];
  const inReviewIds = new Set(inReview.map(({ id }) => id));
  const transfers = found
    .map(({ reason, rows: ids }) => ({
      reason,
      matched: ids
        .map((id) => byIdentity.get(identityOf(id)) as StoredTransaction)
        .sort(byNewest),
    }))
    // Rows already typed as transfers leave the owner nothing to decide.
    .filter(({ matched }) => matched.some(({ id }) => inReviewIds.has(id)))
    // Shared evidence alone can't make a transfer, such as a row repeated in one
    // file. With no two rows that could be one, the rows go back to review.
    .filter(({ matched }) => holdsAPair(matched))
    .sort((a, b) => byNewest(a.matched[0], b.matched[0]))
    .map(({ reason, matched }): TransferMatch => {
      const ids = matched.map(({ id }) => id);
      const isPair = ids.length === 2;
      const { title, help } = MATCH_TEXT[reason];
      return {
        key: [...ids].sort().join(","),
        title,
        help: isPair ? help : `${help} ${PICK_TWO}`,
        rows: matched.map(lineOf),
        picked: isPair ? ids : [],
      };
    });
  const inAMatch = new Set(
    transfers.flatMap((match) => match.rows.map(({ id }) => id)),
  );

  const byKey = new Map<string, StoredTransaction[]>();
  const noMerchant: NoMerchantRow[] = [];
  for (const stored of inReview) {
    if (inAMatch.has(stored.id)) continue;
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
      detail: detailOf(key, group[0]),
      count: group.length,
      countText,
      total: totalOf(group),
      phoneDetail: phoneDetailOf(key, countText, suggestion),
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
    transfers,
    duplicates: duplicates.map(lineOf),
    categories: categories.map(({ id, name }) => ({ id, name })),
    empty: emptyState(left + duplicates.length, rows.length),
  };
}

/** `open` is every row the inbox still shows, including possible duplicates. */
function emptyState(open: number, stored: number): InboxEmpty | null {
  if (open > 0) return null;
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
