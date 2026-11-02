import { monthName } from "@/features/budget/months";
import type { TransactionType } from "@/features/categorize/transactionType";
import type { TransactionLine } from "./transactionsScreenData";

/** A blank value means All, as in All Accounts. */
export type TransactionFilters = {
  search: string;
  accountId: string;
  type: TransactionType | "";
  categoryId: string;
  needsReview: boolean;
  showHidden: boolean;
};

export const NO_FILTERS: TransactionFilters = {
  search: "",
  accountId: "",
  type: "",
  categoryId: "",
  needsReview: false,
  showHidden: false,
};

export function showsCategoryFilter(filters: TransactionFilters): boolean {
  return filters.type === "spending";
}

/** A category only means something under Spending, so changing type clears it. */
export function withType(
  filters: TransactionFilters,
  type: TransactionFilters["type"],
): TransactionFilters {
  return { ...filters, type, categoryId: "" };
}

/** Show Hidden stays as it was, because it says what to show, not what to find. */
export function clearFilters(filters: TransactionFilters): TransactionFilters {
  return { ...NO_FILTERS, showHidden: filters.showHidden };
}

/** The title and bank text hold the label and description between them. */
function matchesSearch(line: TransactionLine, term: string): boolean {
  return [line.title, line.bankText, line.purpose].some((text) =>
    text?.toLowerCase().includes(term),
  );
}

export function filterLines(
  lines: readonly TransactionLine[],
  filters: TransactionFilters,
): TransactionLine[] {
  const { accountId, type, categoryId, needsReview, showHidden } = filters;
  const term = filters.search.trim().toLowerCase();
  const category = showsCategoryFilter(filters) ? categoryId : "";

  return lines.filter(
    (line) =>
      (showHidden || !line.hidden) &&
      (accountId === "" || line.accountId === accountId) &&
      (type === "" || line.type === type) &&
      (category === "" || line.categoryId === category) &&
      (!needsReview || line.needsReview) &&
      (term === "" || matchesSearch(line, term)),
  );
}

export type EmptyState =
  | { kind: "month"; title: string; text: string }
  | { kind: "all-hidden"; title: string; text: string }
  | { kind: "filters"; title: string };

function narrowsRows(filters: TransactionFilters): boolean {
  const { search, accountId, type, needsReview } = filters;
  return search.trim() !== "" || accountId !== "" || type !== "" || needsReview;
}

function emptyState(
  lines: readonly TransactionLine[],
  filters: TransactionFilters,
  month: string,
): EmptyState {
  const name = monthName(month);
  if (lines.length === 0) {
    return {
      kind: "month",
      title: `No rows in ${name}`,
      text: "Import a statement that covers this month to see its rows.",
    };
  }
  if (!narrowsRows(filters)) {
    return {
      kind: "all-hidden",
      title: `All rows in ${name} are hidden`,
      text: "Select Show Hidden to see them.",
    };
  }
  return { kind: "filters", title: "No rows match these filters" };
}

function countText(count: number, month: string): string {
  const rows = count === 1 ? "1 row" : `${count.toLocaleString("en-US")} rows`;
  return `${rows} in ${monthName(month)}.`;
}

export type TransactionsView = {
  lines: TransactionLine[];
  subtitle: string;
  empty: EmptyState | null;
};

/** What the screen shows for a month's rows and the filters set on them. */
export function transactionsView(
  lines: readonly TransactionLine[],
  filters: TransactionFilters,
  month: string,
): TransactionsView {
  const shown = filterLines(lines, filters);
  return {
    lines: shown,
    subtitle: countText(shown.length, month),
    empty: shown.length === 0 ? emptyState(lines, filters, month) : null,
  };
}
